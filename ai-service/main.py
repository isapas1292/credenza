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

class GeminiResponse(typing.TypedDict):
    suggestion_text: str
    action_steps: List[str]
    alternatives: List[Alternative]

# Configuración de Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.5-flash') # Usando el modelo optimizado
else:
    model = None

def enrich_with_gemini(analysis_result: dict, perfil: dict, product: dict) -> dict:
    """Usa Gemini con Structured Outputs para evitar parse errors."""
    if not model:
        return analysis_result

    product_name = product.get('name', 'el producto')
    category = product.get('product_category', 'tecnología')
    price = product.get('price', 0)

    try:
        prompt = f"""
        Como experto financiero dominicano y asesor de compras, analiza este caso:
        
        CONTEXTO:
        - El usuario quiere: {product_name} ({category})
        - Precio original: RD${price:,.2f}
        - Método de pago sugerido o elegido: {json.dumps(analysis_result['chosen_analysis']['scenario_details'])}
        - Perfil Financiero: {json.dumps(perfil)}
        - Análisis Técnico de Viabilidad: {json.dumps(analysis_result['chosen_analysis'])}

        TAREA:
        1. Escribe un `suggestion_text`: Un párrafo de 2-4 líneas que resuma si la compra es viable o no. DEBES leer la manera en que el usuario quiere hacer la compra (el método de pago, contado o cuotas) y decirle directamente por qué le conviene o no basándote en cómo gasta actualmente (sus ingresos vs gastos fijos/variables). Por ejemplo: "Lo mejor es comprar de esta manera porque tus gastos fijos ya son altos" o "Ese método está perfecto ya que tienes flujo libre suficiente".
        2. Escribe `action_steps`: Una lista de 2 a 3 pasos concretos y accionables para mejorar su situación antes o después de la compra.
        3. Provee 3 `alternativas` REALES de productos similares con nombres de modelos reales en el mercado actual (Opción Ahorro, Opción Smart, Opción Premium), ajustadas a su perfil.
        """
        
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=GeminiResponse
            )
        )
        
        gemini_data = json.loads(response.text)
        
        if "suggestion_text" in gemini_data:
            analysis_result["suggestion_text"] = gemini_data["suggestion_text"]
        if "action_steps" in gemini_data:
            analysis_result["gemini_action_plan"] = gemini_data["action_steps"]
        if "alternatives" in gemini_data:
            analysis_result["alternatives"] = gemini_data["alternatives"]
            
    except Exception as e:
        print(f"Error enriqueciendo con Gemini: {e}")
        # Si falla, mantenemos el resultado original sin colapsar el backend
        
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
