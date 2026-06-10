# -*- coding: utf-8 -*-
"""
Capa de IA generativa multi-proveedor (provider-agnostic).

Permite usar alternativas GRATUITAS a Gemini sin cambiar el resto del código:
  - groq        → https://console.groq.com  (gratis, muy rápido, Llama 3.3 70B)
  - openrouter  → https://openrouter.ai      (modelos `:free`)
  - gemini      → Google AI Studio           (requiere facturación activa)

Configuración por `.env` (cualquiera de estas):
    LLM_PROVIDER=groq            # opcional; si se omite se autodetecta por la key presente
    GROQ_API_KEY=...
    OPENROUTER_API_KEY=...
    GEMINI_API_KEY=...
    LLM_MODEL=...                # opcional; override del modelo por defecto

Todos los proveedores OpenAI-compatibles (groq/openrouter) usan el mismo
endpoint /chat/completions con modo JSON. Si ninguno está configurado o todos
fallan, las funciones devuelven None y el motor degrada a su salida determinista.
"""
from __future__ import annotations
import os
import json
from typing import Optional, Dict, Any

import requests

# Proveedores OpenAI-compatibles (mismo formato de request/response).
OPENAI_COMPATIBLE = {
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "key_env": "GROQ_API_KEY",
        "default_model": "llama-3.3-70b-versatile",
    },
    "openrouter": {
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "key_env": "OPENROUTER_API_KEY",
        "default_model": "meta-llama/llama-3.3-70b-instruct:free",
    },
}

# Orden de autodetección cuando no se fija LLM_PROVIDER (gratis primero).
AUTODETECT_ORDER = ["groq", "openrouter", "gemini"]


def active_provider() -> Optional[str]:
    """Devuelve el nombre del proveedor a usar, o None si no hay ninguno configurado."""
    pref = os.getenv("LLM_PROVIDER", "").strip().lower()
    candidates = [pref] if pref else []
    candidates += [p for p in AUTODETECT_ORDER if p != pref]
    for name in candidates:
        if name in OPENAI_COMPATIBLE and os.getenv(OPENAI_COMPATIBLE[name]["key_env"]):
            return name
        if name == "gemini" and os.getenv("GEMINI_API_KEY"):
            return "gemini"
    return None


def _call_openai_compatible(name: str, system: str, user_prompt: str,
                            timeout: int = 20) -> Optional[Dict[str, Any]]:
    cfg = OPENAI_COMPATIBLE[name]
    key = os.getenv(cfg["key_env"])
    if not key:
        return None
    model = os.getenv("LLM_MODEL", cfg["default_model"])
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if name == "openrouter":
        # Headers recomendados por OpenRouter (opcionales pero buenos para ranking).
        headers["HTTP-Referer"] = os.getenv("APP_URL", "https://credenza.app")
        headers["X-Title"] = "Credenza"
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(cfg["url"], headers=headers, json=body, timeout=timeout)
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return json.loads(content)


def _call_gemini(system: str, user_prompt: str, response_schema=None,
                 timeout: int = 20) -> Optional[Dict[str, Any]]:
    try:
        import google.generativeai as genai
    except Exception:
        return None
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    genai.configure(api_key=key)
    model = genai.GenerativeModel(os.getenv("LLM_MODEL", "gemini-2.5-flash"))
    cfg_kwargs = {"response_mime_type": "application/json"}
    if response_schema is not None:
        cfg_kwargs["response_schema"] = response_schema
    response = model.generate_content(
        f"{system}\n\n{user_prompt}",
        generation_config=genai.GenerationConfig(**cfg_kwargs),
        request_options={"timeout": timeout},
    )
    return json.loads(response.text)


def generate_structured(system: str, user_prompt: str, gemini_schema=None,
                        timeout: int = 20) -> Optional[Dict[str, Any]]:
    """
    Genera un objeto JSON con el proveedor activo. Devuelve None si no hay
    proveedor configurado o si la llamada falla (el llamador debe degradar).
    """
    name = active_provider()
    if not name:
        return None
    if name in OPENAI_COMPATIBLE:
        return _call_openai_compatible(name, system, user_prompt, timeout=timeout)
    if name == "gemini":
        return _call_gemini(system, user_prompt, response_schema=gemini_schema, timeout=timeout)
    return None
