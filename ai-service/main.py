import os
import json
from typing import Any, Dict, Optional
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

# ─── Schemas ────────────────────────────────────────────────

class SegmentRequest(BaseModel):
    perfil: Dict[str, Any]

class RecommendationRequest(BaseModel):
    perfil: Dict[str, Any]
    product: Dict[str, Any]

# Configuración de Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash')
else:
    model = None

def enrich_with_gemini(analysis_result: dict, perfil: dict, product: dict) -> dict:
    """Usa Gemini para mejorar las explicaciones y las alternativas con productos reales."""
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
        - Perfil Financiero: {json.dumps(perfil)}
        - Análisis Técnico de Viabilidad: {json.dumps(analysis_result['chosen_analysis'])}

        TAREA:
        1. Genera un 'suggestion_text': Un párrafo empático que resuma si la compra es segura o si hay un riesgo real, dando un consejo práctico (máximo 4 líneas).
        2. Genera 3 'alternativas' REALES de productos:
           - Deben ser MODELOS ESPECÍFICOS (ej. si busca Laptop, sugiere modelos como 'Dell Vostro 3400' o 'MacBook Air M1').
           - Alternativa 1 (Ahorro): Un modelo que cueste un 30-40% menos pero cumpla la función.
           - Alternativa 2 (Inversión): Un modelo premium o de mayor durabilidad (20% más caro).
           - Alternativa 3 (Smart): Un modelo de generación anterior o 'Certified Refurbished'.

        Responde ÚNICAMENTE en JSON con esta estructura:
        {{
            "suggestion_text": "...",
            "alternatives": [
                {{"name": "Modelo Específico", "price": "RD$...", "desc": "...", "payment": "Plan sugerido..."}},
                ...
            ]
        }}
        """
        response = model.generate_content(prompt)
        # Limpiar la respuesta por si Gemini incluye markdown
        text = response.text.strip().replace("```json", "").replace("```", "")
        gemini_data = json.loads(text)
        
        if "suggestion_text" in gemini_data:
            analysis_result["suggestion_text"] = gemini_data["suggestion_text"]
        if "alternatives" in gemini_data:
            analysis_result["alternatives"] = gemini_data["alternatives"]
        
    except Exception as e:
        print(f"Error enriqueciendo con Gemini: {e}")
        
    return analysis_result

# ─── Endpoints ──────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "service": "Credenza AI Service", "version": "2.1.0", "gemini_active": model is not None}


@app.get("/health")
def health_check():
    return {"status": "healthy", "model_loaded": artifacts is not None, "gemini_active": model is not None}


@app.post("/profile/segment")
def segment_profile(body: SegmentRequest) -> Dict[str, Any]:
    # ... (sin cambios)
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
    """
    Analiza la viabilidad de un producto para un perfil de usuario.
    """
    try:
        user_features = build_user_dict_from_payload(body.perfil)
        result = predict_recommendation(user_features, body.product, artifacts)
        
        # Enriquecer con Gemini si está disponible
        result = enrich_with_gemini(result, body.perfil, body.product)
        
        return {"succeeded": True, "data": result}
    except Exception as ex:
        print(f"Error en recommend_product: {ex}")
        raise HTTPException(status_code=500, detail=str(ex))
