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
    classify_financial_profile,
    load_or_train_artifacts,
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
    segment: Dict[str, Any]

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
    "Nunca inventes tasas, precios ni instituciones: usa solo los datos verificados y la referencia de mercado que se te entreguen. "
    "Personaliza SIEMPRE: ancla cada oración en los números, el propósito y el segmento específicos de ESTE usuario "
    "(cita sus cifras reales). Evita frases plantilla que servirían para cualquier persona; dos usuarios distintos "
    "deben recibir textos claramente distintos."
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
    chosen_sc = chosen.get('scenario_details', {})
    chosen_type = chosen_sc.get('type', '')  # 'contado' | 'usuario' | 'seguro'
    purpose_class = chosen.get('purpose_class', '')
    metodo_txt = 'pago al CONTADO' if chosen_type == 'contado' else ('prima mensual de seguro' if chosen_type == 'seguro' else 'FINANCIAMIENTO a plazos')
    proposito_guia = {
        'esencial': 'es una necesidad/herramienta — el gasto se justifica más',
        'ocio': 'es un gusto/entretenimiento (LUJO) — solo conviene si NO compromete su margen ni su fondo de emergencia',
        'mejora': 'es una mejora — punto intermedio',
    }.get(purpose_class, 'propósito general')
    grounding_prompt = f"""
        DATOS VERIFICADOS DEL MOTOR (úsalos como fuente de verdad; NO los contradigas):
        - Veredicto de viabilidad: {'VIABLE' if chosen.get('viable') else 'NO VIABLE'} (score {rec_score:.0%}, banda: {chosen.get('risk_band_name','')}).
        - Flujo libre actual: RD${metrics.get('fcf_current', 0):,.0f}/mes; flujo tras la compra: RD${metrics.get('fcf_post', 0):,.0f}/mes.
        - Endeudamiento (DTI) tras la compra: {metrics.get('dti_post', 0)*100:.0f}%; cuota estimada: RD${metrics.get('installment', 0):,.0f}/mes.
        - Fondo de emergencia: {metrics.get('emergency_months', 0):.1f} meses de gastos.
        - Segmento del usuario: {analysis_result.get('segment_name','')}.
        - Método elegido por el usuario: {metodo_txt}.
        - Propósito: "{purpose}" → {proposito_guia}. Vida útil declarada: {lifespan}. Horizonte de decisión del usuario en su perfil.
        {f"- COMPARACIÓN DE TASA: el usuario paga {rate_analysis['user_rate_pct']:.0f}% anual (mercado RD típico ~{rate_analysis['market_typical_pct']:.0f}%, mínimo ~{rate_analysis['market_low_pct']:.0f}%). Veredicto: tasa {rate_analysis['verdict']}. Cambiando de entidad podría bajar la cuota a ~RD${rate_analysis['best_reference_installment']:,.0f}/mes y ahorrar ~RD${rate_analysis['potential_total_savings']:,.0f} en el plazo." if rate_analysis else ""}

        REFERENCIA DE MERCADO DOMINICANO (usa SOLO estas instituciones/tasas; si citas tasas o bancos, deben venir de aquí):
        {market_ref if market_ref else '(sin referencia específica para esta categoría; usa marcas/productos reales y conocidos del mercado, sin inventar precios exactos)'}

        CRITERIO DE PROPÓSITO Y TIEMPO (CLAVE para el suggestion_text — razona sobre esto, no solo los números):
        - Juzga si el PROPÓSITO justifica el gasto: una necesidad/herramienta de trabajo justifica estirar el presupuesto; un gusto/entretenimiento que comprometa su margen o su fondo de emergencia es un LUJO que NO conviene aunque "alcance". Dilo con claridad y empatía.
        - Si el método es CONTADO: explica el TIEMPO y esfuerzo de ahorro que implica (cuántos meses) y cómo afecta su liquidez/colchón; si ya tiene el dinero, evalúa la descapitalización.
        - Si es FINANCIADO: enfócate en la carga de la cuota; si el plazo de pago supera la vida útil del producto, adviértele que pagaría por algo ya obsoleto.

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
        monthly_income += float(finances.get('extraIncome', 0) or 0)  # ganancia extra
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
           - `payment`: el método de pago MÁS REALISTA para ESTE usuario según el PRECIO de esa alternativa y su flujo libre (RD${free_cash:,.0f}/mes). Si la puede pagar al contado con sus ahorros, dilo; si no, indica el plazo CONCRETO cuya cuota cabe en su presupuesto. Debe VARIAR entre las 3 (no pongas el mismo plazo en todas): la económica suele ser contado o plazo corto, la premium un plazo más largo.
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
        1. Escribe un `suggestion_text`: Un párrafo de 3-5 líneas, en segunda persona y tono cercano, que resuma si la compra es viable o no PARA ESTE usuario. REGLAS OBLIGATORIAS:
           - Cita AL MENOS 2-3 cifras reales de SU caso (su flujo libre RD${metrics.get('fcf_post', 0):,.0f}/mes tras la compra, su cuota RD${metrics.get('installment', 0):,.0f}, su DTI {metrics.get('dti_post', 0)*100:.0f}%, su fondo de emergencia de {metrics.get('emergency_months', 0):.0f} meses). Sin cifras concretas el texto no sirve porque valdría para cualquiera.
           - NO empieces con frases plantilla ("Considerando tu flujo libre...", "Basándonos en tu situación..."); arranca con el veredicto concreto y sus números. Dos usuarios distintos deben leer textos claramente distintos.
           - Razona con el CRITERIO DE PROPÓSITO Y TIEMPO de arriba: cómo influye el método elegido (contado = esfuerzo/tiempo de ahorro; financiado = carga de la cuota y plazo vs vida útil) y si el propósito ("{purpose}") justifica el gasto o lo vuelve un lujo evitable.
           - No contradigas el veredicto del motor. Si es un préstamo con tasa "alta", dile cuánto ahorraría cambiando de entidad.
        2. Escribe `action_steps`: 2 a 3 pasos MUY específicos para ESTE usuario. REGLAS OBLIGATORIAS:
           - Cada paso DEBE citar al menos una CIFRA REAL de su caso: su flujo libre (RD${metrics.get('fcf_post', 0):,.0f}/mes), su fondo de emergencia actual ({metrics.get('emergency_months', 0):.0f} meses) y cuánto le falta para llegar a 3, el monto exacto que debe ahorrar/recortar, la cuota (RD${metrics.get('installment', 0):,.0f}), su tasa, etc.
           - PROHIBIDO dar consejos genéricos sin número ("revisa tus gastos", "evalúa tus finanzas regularmente", "considera diversificar ingresos"): esos no sirven porque valen para cualquiera. Si no tiene un número, no es un paso válido.
           - Usa como BASE estos pasos que ya calculó el motor con sus números reales (mejóralos y personalízalos, NO los hagas más vagos ni les quites las cifras): {json.dumps(chosen.get('action_plan', []), ensure_ascii=False)}
           - Adapta cada paso al método elegido ({chosen.get('scenario_details', {}).get('name','')}) y al propósito ("{purpose}").
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
        segment = classify_financial_profile(user_features, artifacts["segmentation_artifacts"])
        return {"succeeded": True, "data": segment}
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))


@app.post("/product/recommend")
def recommend_product(body: RecommendationRequest) -> Dict[str, Any]:
    try:
        user_features = build_user_dict_from_payload(body.perfil)
        segment_name = body.segment.get("segment_name") or body.segment.get("SegmentName")
        if not segment_name:
            raise HTTPException(status_code=422, detail="Se requiere el segmento financiero persistido del usuario.")
        user_features["persisted_segment_name"] = segment_name
        user_features["persisted_segment_id"] = body.segment.get("segment_id", body.segment.get("SegmentId"))
        user_features["persisted_profile_score"] = body.segment.get("profile_score", body.segment.get("ProfileScore"))
        result = predict_recommendation(user_features, body.product, artifacts)
        result["profile_segment"] = {
            "segment_id": user_features["persisted_segment_id"],
            "segment_name": segment_name,
            "profile_score": user_features["persisted_profile_score"],
        }
        result = enrich_with_gemini(result, body.perfil, body.product)
        return {"succeeded": True, "data": result}
    except Exception as ex:
        print(f"Error en recommend_product: {ex}")
        if isinstance(ex, HTTPException):
            raise ex
        raise HTTPException(status_code=500, detail=str(ex))


