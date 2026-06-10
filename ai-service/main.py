import os
import json
from typing import Any, Dict, List
import typing_extensions as typing
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from credenza_engine_backend_ready import (
    build_user_dict_from_payload,
    load_or_train_artifacts,
    predict_segment,
    predict_recommendation,
    normalize_category,
)
import dr_market
import llm_provider

app = FastAPI(title="Credenza AI Service", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ARTIFACTS_PATH = os.path.join(os.path.dirname(__file__), "credenza_artifacts.joblib")
artifacts = load_or_train_artifacts(ARTIFACTS_PATH)

# ─── Schemas para Pydantic y Gemini ─────────────────────────

class SegmentRequest(BaseModel):
    perfil: Dict[str, Any]

class RecommendationRequest(BaseModel):
    perfil: Dict[str, Any]
    product: Dict[str, Any]

class Alternative(typing.TypedDict):
    name: str
    price: str
    desc: str
    payment: str

class SimilarProduct(typing.TypedDict):
    name: str
    price: str
    desc: str
    why_fits: str

class ViableAlternative(typing.TypedDict):
    name: str
    category: str
    price: str
    desc: str
    why_better: str

class GeminiResponse(typing.TypedDict):
    suggestion_text: str
    action_steps: List[str]
    alternatives: List[Alternative]
    similar_products: List[SimilarProduct]
    viable_alternatives: List[ViableAlternative]

# Proveedor de IA generativa activo (groq / openrouter / gemini), autodetectado
# según la API key presente en el entorno. Puede no haber ninguno: en ese caso
# el sistema usa la salida del motor determinista.
LLM_PROVIDER = llm_provider.active_provider()

# Mensaje de sistema con el ESQUEMA JSON exacto, para proveedores OpenAI-
# compatibles (groq/openrouter) que no soportan response_schema nativo.
LLM_SYSTEM = (
    "Eres un asesor financiero y de compras experto en el mercado de República Dominicana. "
    "Hablas en español dominicano claro, en segunda persona y con tono cercano y honesto. "
    "Respondes SIEMPRE con un único objeto JSON VÁLIDO, sin texto fuera del JSON, con EXACTAMENTE estas claves:\n"
    '{\n'
    '  "suggestion_text": "string",\n'
    '  "action_steps": ["string", ...],\n'
    '  "alternatives": [{"name":"string","price":"string","desc":"string","payment":"string"}],\n'
    '  "similar_products": [{"name":"string","price":"string","desc":"string","why_fits":"string"}],\n'
    '  "viable_alternatives": [{"name":"string","category":"string","price":"string","desc":"string","why_better":"string"}]\n'
    '}\n'
    "Nunca inventes tasas, precios ni instituciones: usa solo los datos verificados y la referencia de mercado que se te entreguen."
)

def enrich_with_gemini(analysis_result: dict, perfil: dict, product: dict) -> dict:
    """Enriquece el análisis con el proveedor de IA activo (groq/openrouter/gemini).
    Si no hay proveedor o la llamada falla, devuelve la salida del motor intacta."""
    if not LLM_PROVIDER:
        return analysis_result

    product_name = product.get('name', 'el producto')
    category = product.get('product_category', 'tecnología')
    price = product.get('price', 0)
    purpose = product.get('purpose', 'No especificado')
    main_constraint = product.get('main_constraint', 'No especificado')
    notes = product.get('notes', '')
    lifespan = product.get('lifespan', 'No especificado')
    payment_type = product.get('payment_type', 'No especificado')
    
    # Hogar specific fields
    square_meters = product.get('square_meters')
    bedrooms = product.get('bedrooms')
    zone = product.get('zone', 'No especificada')
    
    # Dependents from perfil
    personal = perfil.get('personal', perfil)
    dependents = personal.get('dependents', 0)
    emp_type = personal.get('employmentType', personal.get('situacionLaboral', 'No especificado'))

    # Determine if the purchase is incompatible.
    # Se alinea con el veredicto de viabilidad del motor (no un umbral suelto),
    # para que la UI y la IA sean coherentes con el resto del análisis.
    chosen = analysis_result.get('chosen_analysis', {})
    rec_score = chosen.get('recommendation_score', 1.0)
    is_incompatible = (chosen.get('viable') is False) or rec_score < 0.45

    # ── Grounding: referencia de mercado RD + comparación de tasa ──────────
    # Se le entrega a la IA datos verificados del motor para que NO invente
    # tasas, precios ni instituciones.
    norm_cat = normalize_category(category)
    market_ref = dr_market.market_reference_for_prompt(norm_cat)
    rate_analysis = analysis_result.get('rate_analysis')
    metrics = chosen.get('metrics', {})
    grounding_prompt = f"""
        DATOS VERIFICADOS DEL MOTOR (úsalos como fuente de verdad; NO los contradigas):
        - Veredicto de viabilidad: {'VIABLE' if chosen.get('viable') else 'NO VIABLE'} (score {rec_score:.0%}, banda: {chosen.get('risk_band_name','')}).
        - Flujo libre actual: RD${metrics.get('fcf_current', 0):,.0f}/mes; flujo tras la compra: RD${metrics.get('fcf_post', 0):,.0f}/mes.
        - Endeudamiento (DTI) tras la compra: {metrics.get('dti_post', 0)*100:.0f}%; cuota estimada: RD${metrics.get('installment', 0):,.0f}/mes.
        - Fondo de emergencia: {metrics.get('emergency_months', 0):.1f} meses de gastos.
        - Segmento del usuario: {analysis_result.get('segment_name','')}.
        {f"- COMPARACIÓN DE TASA: el usuario paga {rate_analysis['user_rate_pct']:.0f}% anual (mercado RD típico ~{rate_analysis['market_typical_pct']:.0f}%, mínimo ~{rate_analysis['market_low_pct']:.0f}%). Veredicto: tasa {rate_analysis['verdict']}. Cambiando de entidad podría bajar la cuota a ~RD${rate_analysis['best_reference_installment']:,.0f}/mes y ahorrar ~RD${rate_analysis['potential_total_savings']:,.0f} en el plazo." if rate_analysis else ""}

        REFERENCIA DE MERCADO DOMINICANO (usa SOLO estas instituciones/tasas; si citas tasas o bancos, deben venir de aquí):
        {market_ref if market_ref else '(sin referencia específica para esta categoría; usa marcas/productos reales y conocidos del mercado, sin inventar precios exactos)'}

        REGLAS DE FACTIBILIDAD (obligatorias):
        - Toda sugerencia debe ser ALCANZABLE para este usuario según su flujo libre; no propongas nada cuya cuota supere el 35% de su flujo libre actual.
        - Las alternativas deben ser SIMILARES a lo que el usuario quiere ("{purpose}") pero realmente factibles para su bolsillo.
        - No inventes tasas, precios ni instituciones. Si no tienes un dato verificado, usa los rangos de referencia provistos e indícalo como "referencial".
    """

    try:
        # similar_products / viable_alternatives ya no se muestran (todo se
        # consolidó en `alternatives`). Pedimos esos campos vacíos y, si la
        # compra no es viable, exigimos que las alternativas sean asequibles.
        finances = perfil.get('finances', perfil)
        monthly_income = float(finances.get('monthlyIncome', finances.get('monthly_income_avg', 0)) or 0)
        fixed_exp = float(finances.get('fixedExpenses', finances.get('fixed_expenses_monthly', 0)) or 0)
        variable_exp = float(finances.get('variableExpenses', finances.get('variable_expenses_monthly_avg', 0)) or 0)
        debts = float(finances.get('activeDebts', finances.get('current_debt_payment_monthly', 0)) or 0)
        free_cash = monthly_income - fixed_exp - variable_exp - debts
        max_affordable_monthly = max(free_cash * 0.30, 0)

        if is_incompatible:
            incompatible_prompt = f"""
        IMPORTANTE — LA COMPRA NO ES VIABLE PARA ESTE USUARIO (score: {rec_score:.0%}).
        Su flujo libre mensual es ~RD${free_cash:,.0f} y puede pagar como máximo ~RD${max_affordable_monthly:,.0f}/mes en cuotas.
        Por eso, las 3 `alternatives` que sugieras DEBEN ser productos REALES que el usuario SÍ pueda costear
        (cuota mensual por debajo de RD${max_affordable_monthly:,.0f}), ya sea del mismo tipo más económico, o de una
        categoría distinta que cumpla el mismo propósito ("{purpose}") de forma más accesible
        (ej.: si no puede pagar una laptop, una tablet con teclado o un Chromebook; si no puede un carro, una moto o scooter).
        Devuelve `similar_products` y `viable_alternatives` como listas VACÍAS [].
            """
        else:
            incompatible_prompt = """
        Devuelve `similar_products` y `viable_alternatives` como listas VACÍAS [] (la compra es viable).
            """

        if category.lower() == "préstamo":
            alternatives_prompt = f"""
        3. Provee EXACTAMENTE 3 `alternatives` que son opciones de entidades financieras o bancos REALES en el país del usuario (ej. República Dominicana: Banco Popular, Banreservas, BHD, Asociación Popular, etc.) que ofrezcan préstamos personales.
           - Evalúa si la tasa que el usuario ingresó (o la tasa estándar calculada de {product.get('interest_rate', 0.18)*100:.1f}%) es competitiva con el mercado actual.
           Para cada alternativa incluye:
           - `name`: Nombre del Banco o Entidad + "(Mejor Tasa)" o "(Más Flexible)" según corresponda. (ej. "Banco Popular - Préstamo Personal (Mejor Tasa)")
           - `price`: "Tasa estimada: X% a Y%"
           - `desc`: Una oración describiendo los beneficios de este préstamo (ej. tasa fija a 1 año, sin penalidad de abono, desembolso rápido, etc.) y por qué le conviene según su propósito ("{purpose}").
           - `payment`: Plazo sugerido basado en su perfil (ej: "Financiamiento a 24 meses")
            """
        elif category.lower() == "seguro":
            alternatives_prompt = f"""
        3. Provee EXACTAMENTE 3 `alternatives` que son planes de Aseguradoras REALES en el país del usuario (ej. República Dominicana: ARS Humano, Mapfre, Universal, Monumental, etc.) para el tipo de seguro buscado.
           - Compara la prima mensual ingresada de RD${price:,.2f} con el promedio del mercado para coberturas similares.
           Para cada alternativa incluye:
           - `name`: Nombre de la Aseguradora y Plan (ej. "Mapfre - Seguro de Vehículo Full")
           - `price`: Prima estimada mensual en formato "RD$XXX/mes" o "$XXX USD/mes"
           - `desc`: Una oración describiendo la cobertura clave, deducibles o beneficios (ej. asistencia vial 24/7, cobertura catastrófica) y por qué le conviene según su propósito ("{purpose}").
           - `payment`: "Pago mensual continuo"
            """
        elif category.lower() == "vehículo":
            alternatives_prompt = f"""
        3. Provee EXACTAMENTE 3 `alternatives` que son Vehículos REALES del mercado actual en el mismo segmento.
           - Considera su presupuesto original de RD${price:,.2f}.
           - Busca OTRAS marcas/modelos que retengan mejor su valor de reventa, consuman menos combustible o tengan repuestos más baratos en su país.
           Para cada alternativa incluye:
           - `name`: Marca, Modelo y Año (ej. "Toyota RAV4 2018" o "Honda CR-V 2017")
           - `price`: Precio realista de dealer en formato "$XXX USD" o "RD$XXX"
           - `desc`: Por qué es una mejor opción a largo plazo (ej. "Piezas económicas en el país y excelente valor de reventa"). Incluye fuente o referencia de dealer local.
           - `payment`: Sugerencia de financiamiento automotriz basada en su perfil (ej: "Financiamiento de Vehículo a 48 meses")
            """
        elif category.lower() == "hogar":
            alternatives_prompt = f"""
        3. Provee EXACTAMENTE 3 `alternatives` que son opciones Inmobiliarias (Bienes Raíces) REALES en el mercado.
           - Evalúa si {bedrooms} habitaciones y {square_meters} mt2 tiene sentido lógico sabiendo que el usuario tiene {dependents} dependientes (hijos/familiares). Si busca comprar para "Vivir" pero la casa es muy pequeña para sus dependientes, házselo saber en el suggestion_text.
           - Basado en su presupuesto de RD${price:,.2f} y su interés en la zona "{zone}", sugiere 3 tipos de propiedades o sectores alternativos.
           Para cada alternativa incluye:
           - `name`: Tipo de Propiedad y Sector (ej. "Apartamento 3 Hab - Santo Domingo Este" o "Casa - Autopista San Isidro")
           - `price`: Precio estimado realista en formato "$XXX USD" o "RD$XXX"
           - `desc`: Por qué esta opción tiene sentido para su tamaño de familia ({dependents} dependientes) y su presupuesto. (Ej. "Menor costo por metro cuadrado sin sacrificar habitaciones").
           - `payment`: Sugerencia de financiamiento hipotecario basada en su perfil (ej: "Préstamo Hipotecario a 20 años")
            """
        else:
            alternatives_prompt = f"""
        3. Provee EXACTAMENTE 3 `alternatives` que son productos REALES del mercado actual en la categoría "{category}". Las alternativas deben considerar:
           - El propósito del usuario: "{purpose}"
           - Su restricción principal: "{main_constraint}"
           - Su presupuesto original de RD${price:,.2f}
           ¡IMPORTANTE! NO repitas el mismo nombre del producto original ("{product_name}"). Busca OTROS productos reales y específicos que representen estas 3 opciones:
           a) Opción Económica: Un producto REAL diferente y más barato (ej. si busca "MacBook Pro M4", sugiere "MacBook Air M2"). El `name` debe incluir "(Versión Económica)" al final.
           b) Opción Mejor Relación Precio-Calidad: Un producto REAL con el mejor balance. El `name` debe incluir "(Mejor Relación Precio-Calidad)" al final.
           c) Opción Premium: Un producto REAL de gama superior. El `name` debe incluir "Premium" al final.
           Para cada alternativa incluye:
           - `name`: Nombre REAL del producto diferente al original + la etiqueta correspondiente.
           - `price`: Precio fijo REAL en formato "$XXX USD"
           - `desc`: Una oración describiendo las especificaciones clave y por qué encaja con su propósito. Incluye la fuente del precio (ej. "Precio en Amazon: $XXX USD").
           - `payment`: Sugerencia de financiamiento basada en su perfil (ej: "Financiamiento a 12 meses", "Compra de contado")
            """

        prompt = f"""
        Como experto financiero dominicano y asesor de compras, analiza este caso:
        
        CONTEXTO DEL USUARIO:
        - El usuario quiere: {product_name} ({category})
        - Precio o Monto: RD${price:,.2f}
        - Propósito / Para qué lo quiere: {purpose}
        - Su prioridad o restricción principal: {main_constraint}
        - Método de pago elegido: {payment_type}
        - Notas adicionales del usuario: {notes if notes else 'Ninguna'}
        - Plan elegido: {chosen.get('scenario_details', {}).get('name','')} (cuota RD${metrics.get('installment', 0):,.0f}/mes).
        - Datos del usuario: ingreso RD${monthly_income:,.0f}/mes, gastos fijos RD${fixed_exp:,.0f}, variables RD${variable_exp:,.0f}, deudas RD${debts:,.0f}, {dependents} dependientes, empleo: {emp_type}.
        {grounding_prompt}

        TAREA:
        1. Escribe un `suggestion_text`: Un párrafo de 2-4 líneas, en segunda persona y tono cercano, que resuma si la compra o préstamo es viable o no PARA ESTE usuario en específico. Apóyate en sus números reales (flujo libre, DTI, cuota, fondo de emergencia de los DATOS VERIFICADOS) y en su propósito ("{purpose}"). No contradigas el veredicto del motor. Si es un préstamo y su tasa está "alta", dile explícitamente que está pagando de más y cuánto podría ahorrar cambiando de entidad.
        2. Escribe `action_steps`: 2 a 3 pasos concretos, accionables y personalizados (con cifras de su caso cuando aplique) para mejorar su situación antes o después de la compra/préstamo.
        {alternatives_prompt}
        {incompatible_prompt}
        """
        gemini_data = llm_provider.generate_structured(
            LLM_SYSTEM, prompt, gemini_schema=GeminiResponse, timeout=20
        )
        if not gemini_data:
            return analysis_result

        if "suggestion_text" in gemini_data:
            analysis_result["suggestion_text"] = gemini_data["suggestion_text"]
        if "action_steps" in gemini_data:
            analysis_result["gemini_action_plan"] = gemini_data["action_steps"]
        if "alternatives" in gemini_data:
            analysis_result["alternatives"] = gemini_data["alternatives"]
        # Only override fallback data if Gemini returns non-empty lists
        if "similar_products" in gemini_data and len(gemini_data["similar_products"]) > 0:
            analysis_result["similar_products"] = gemini_data["similar_products"]
        if "viable_alternatives" in gemini_data and len(gemini_data["viable_alternatives"]) > 0:
            analysis_result["viable_alternatives"] = gemini_data["viable_alternatives"]

        print(f"[LLM OK · {LLM_PROVIDER}] similar_products={len(gemini_data.get('similar_products', []))}, viable_alternatives={len(gemini_data.get('viable_alternatives', []))}")

    except Exception as e:
        print(f"[LLM ERROR · {LLM_PROVIDER}] enrich falló: {e}. Se usa la salida del motor determinista.")
        # Si falla, mantenemos el resultado original (fallbacks del motor)

    return analysis_result

# ─── Endpoints ──────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "service": "Credenza AI Service", "version": "3.0.0 (multi-LLM)", "llm_provider": LLM_PROVIDER}


@app.get("/health")
def health_check():
    return {"status": "healthy", "model_loaded": artifacts is not None, "llm_provider": LLM_PROVIDER}


@app.post("/profile/segment")
def segment_profile(body: SegmentRequest) -> Dict[str, Any]:
    try:
        user_features = build_user_dict_from_payload(body.perfil)
        import pandas as pd
        df = pd.DataFrame([user_features])
        from credenza_engine_backend_ready import SEGMENT_NUMERIC_FEATURES, SEGMENT_CATEGORICAL_FEATURES
        seg_ids, seg_names = predict_segment(df[SEGMENT_NUMERIC_FEATURES + SEGMENT_CATEGORICAL_FEATURES], artifacts["segmentation_artifacts"])
        
        dti = user_features.get("current_debt_payment_monthly", 0) / max(user_features.get("monthly_income_avg", 1), 1)
        score = 100 - (dti * 100) - (20 if user_features.get("emergency_fund_amount", 0) < 1000 else 0)
        score = max(0, min(100, score))

        return {
            "succeeded": True, 
            "data": {
                "segment_id": int(seg_ids[0]),
                "segment_name": seg_names[0],
                "profile_score": round(score, 2),
                "summary": f"Perfil clasificado como {seg_names[0]}."
            }
        }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))


@app.post("/product/recommend")
def recommend_product(body: RecommendationRequest) -> Dict[str, Any]:
    try:
        user_features = build_user_dict_from_payload(body.perfil)
        result = predict_recommendation(user_features, body.product, artifacts)
        result = enrich_with_gemini(result, body.perfil, body.product)
        return {"succeeded": True, "data": result}
    except Exception as ex:
        print(f"Error en recommend_product: {ex}")
        raise HTTPException(status_code=500, detail=str(ex))


