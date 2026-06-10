import os
import json
from typing import Any, Dict, List
import typing_extensions as typing
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

from credenza_engine_backend_ready import (
    build_user_dict_from_payload,
    load_or_train_artifacts,
    predict_segment,
    predict_recommendation
)

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

# Configuración de Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.5-flash') # Usando el modelo con 20 peticiones diarias gratuitas
else:
    model = None

def enrich_with_gemini(analysis_result: dict, perfil: dict, product: dict) -> dict:
    """Usa Gemini con Structured Outputs para evitar parse errors."""
    if not model:
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

    # Determine if the purchase is incompatible
    chosen = analysis_result.get('chosen_analysis', {})
    rec_score = chosen.get('recommendation_score', 1.0)
    is_incompatible = rec_score < 0.50

    try:
        # Build the incompatible-only section of the prompt
        incompatible_prompt = ""
        if is_incompatible:
            finances = perfil.get('finances', perfil)
            monthly_income = float(finances.get('monthlyIncome', finances.get('monthly_income_avg', 0)) or 0)
            fixed_exp = float(finances.get('fixedExpenses', finances.get('fixed_expenses_monthly', 0)) or 0)
            debts = float(finances.get('activeDebts', finances.get('current_debt_payment_monthly', 0)) or 0)
            free_cash = monthly_income - fixed_exp - debts
            max_affordable_monthly = max(free_cash * 0.30, 0)
            max_affordable_12m = max_affordable_monthly * 12

            incompatible_prompt = f"""
        
        IMPORTANTE — LA COMPRA NO ES VIABLE PARA ESTE USUARIO (score: {rec_score:.0%}).
        Su flujo libre mensual es aproximadamente RD${free_cash:,.0f} y puede pagar máximo RD${max_affordable_monthly:,.0f}/mes en cuotas.
        El precio máximo que puede costear a 12 meses es aproximadamente RD${max_affordable_12m:,.0f} (o aprox. ${max_affordable_12m/60:,.0f} USD).

        4. Provee EXACTAMENTE 3 `similar_products`: Productos REALES del mercado actual que son del MISMO tipo que "{product_name}" (categoría "{category}") pero que el usuario SÍ puede costear (precio menor a ${max_affordable_12m/60:,.0f} USD).
           Para cada uno incluye:
           - `name`: Nombre REAL del producto (marca y modelo específico)
           - `price`: Precio fijo REAL en formato "$XXX USD" (tomado de Amazon, Best Buy, tienda oficial, etc.)
           - `desc`: Una oración describiendo las especificaciones clave del producto
           - `why_fits`: Por qué este producto se ajusta al presupuesto. DEBES incluir la fuente del precio (ej. "Precio Amazon: $XXX USD").

        5. Provee EXACTAMENTE 2 `viable_alternatives`: Productos REALES de una CATEGORÍA DIFERENTE a "{category}" que podrían cumplir el mismo propósito ("{purpose}") de manera más accesible.
           Por ejemplo, si quiere una laptop para trabajar pero no puede pagarla, sugerir una tablet con teclado o un Chromebook. Si quiere un carro, sugerir una moto o transporte alternativo.
           Para cada uno incluye:
           - `name`: Nombre REAL del producto
           - `category`: La categoría del producto alternativo
           - `price`: Precio fijo REAL en formato "$XXX USD"
           - `desc`: Qué es y sus especificaciones clave
           - `why_better`: Por qué esta alternativa es más viable y cómo cumple su propósito. Incluye la fuente (ej. "Precio Best Buy: $XXX USD").
            """
        else:
            incompatible_prompt = """
        
        4. Para `similar_products`: Devuelve una lista VACÍA [] porque la compra sí es viable.
        5. Para `viable_alternatives`: Devuelve una lista VACÍA [] porque la compra sí es viable.
            """

        if category.lower() == "préstamo":
            alternatives_prompt = f"""
        3. Provee EXACTAMENTE 3 `alternatives` que son opciones de entidades financieras o bancos REALES en el país del usuario (ej. República Dominicana: Banco Popular, Banreservas, BHD, Asociación Popular, etc.) que ofrezcan préstamos personales.
           - Evalúa si la tasa que el usuario ingresó (o la tasa estándar calculada de {product_data.get('interest_rate', 0.18)*100:.1f}%) es competitiva con el mercado actual.
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
        - Método de pago sugerido o elegido por el sistema: {json.dumps(chosen.get('scenario_details', {}))}
        - Perfil Financiero completo: {json.dumps(perfil)}
        - Análisis Técnico de Viabilidad: {json.dumps(chosen)}

        TAREA:
        1. Escribe un `suggestion_text`: Un párrafo de 2-4 líneas que resuma si la compra o préstamo es viable o no. DEBES leer la manera en que el usuario quiere hacer la transacción y decirle directamente por qué le conviene o no basándote en cómo gasta actualmente (sus ingresos vs gastos fijos/variables). Menciona su propósito ("{purpose}") y cómo se alinea o no con eso. Si es un préstamo, enfócate en la carga de la cuota mensual.
        2. Escribe `action_steps`: Una lista de 2 a 3 pasos concretos y accionables para mejorar su situación antes o después de la compra/préstamo.
        {alternatives_prompt}
        {incompatible_prompt}
        """
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=GeminiResponse
            ),
            request_options={"timeout": 15}
        )
        
        gemini_data = json.loads(response.text)
        
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

        print(f"[Gemini OK] similar_products={len(gemini_data.get('similar_products', []))}, viable_alternatives={len(gemini_data.get('viable_alternatives', []))}")
            
    except Exception as e:
        import traceback
        print(f"[Gemini ERROR] enrich_with_gemini falló: {e}")
        print(traceback.format_exc())
        # Si falla, mantenemos el resultado original (incluyendo fallbacks del motor)
        
    return analysis_result

# ─── Endpoints ──────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "service": "Credenza AI Service", "version": "2.2.0 (Structured Outputs)", "gemini_active": model is not None}


@app.get("/health")
def health_check():
    return {"status": "healthy", "model_loaded": artifacts is not None, "gemini_active": model is not None}


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


