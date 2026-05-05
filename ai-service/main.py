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
)

app = FastAPI(title="Credenza AI Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ARTIFACTS_PATH = os.path.join(os.path.dirname(__file__), "credenza_artifacts.joblib")
artifacts = load_or_train_artifacts(ARTIFACTS_PATH)


# ─── Schema ─────────────────────────────────────────────────

class SegmentRequest(BaseModel):
    """
    Acepta directamente el objeto `perfil` guardado en la BD
    (estructura del wizard de Angular).
    """
    perfil: Dict[str, Any]


# ─── Endpoints ──────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "service": "Credenza AI Service", "version": "2.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "model_loaded": artifacts is not None}


@app.post("/profile/segment")
def segment_profile(body: SegmentRequest) -> Dict[str, Any]:
    """
    Recibe el JSON del perfil del usuario y devuelve:
      - segment_id
      - segment_name
      - profile_score
      - summary
    """
    try:
        user_features = build_user_dict_from_payload(body.perfil)
        result = predict_segment(user_features, artifacts)
        return {"succeeded": True, "data": result}
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))
