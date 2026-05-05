"""
main.py — Microservicio FastAPI Credenza AI Service
Ejecutar: python -m uvicorn main:app --reload --port 8001
"""

import os
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


# ─── Endpoints ──────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "service": "Credenza AI Service", "version": "2.1.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "model_loaded": artifacts is not None}


@app.post("/profile/segment")
def segment_profile(body: SegmentRequest) -> Dict[str, Any]:
    """
    Clasifica al usuario en un segmento financiero.
    """
    try:
        user_features = build_user_dict_from_payload(body.perfil)
        # Re-usamos predict_recommendation pero solo para el segmento si quisiéramos, 
        # o mantenemos una versión simplificada de predict_segment.
        # Por simplicidad, usamos la lógica de la respuesta de recomendación pero filtrada 
        # o una llamada directa si el motor lo permite.
        
        # En el nuevo motor, predict_recommendation hace todo. 
        # Pero si solo queremos el segmento:
        import pandas as pd
        df = pd.DataFrame([user_features])
        from credenza_engine_backend_ready import SEGMENT_NUMERIC_FEATURES, SEGMENT_CATEGORICAL_FEATURES
        
        seg_ids, seg_names = predict_segment(df[SEGMENT_NUMERIC_FEATURES + SEGMENT_CATEGORICAL_FEATURES], artifacts["segmentation_artifacts"])
        
        # Calculamos un profile score básico para mantener compatibilidad
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
        return {"succeeded": True, "data": result}
    except Exception as ex:
        print(f"Error en recommend_product: {ex}")
        raise HTTPException(status_code=500, detail=str(ex))
