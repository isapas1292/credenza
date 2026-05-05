from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
import os

from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    silhouette_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


RANDOM_STATE = 42
EPS = 1e-6

# ============================================================
# FEATURES DEL MOTOR
# ============================================================

SEGMENT_NUMERIC_FEATURES = [
    "dti_current",
    "expense_ratio",
    "free_cash_flow_current",
    "emergency_months",
    "liquid_savings",
    "income_volatility_score",
    "dependents_count",
    "high_impact_purchase_frequency",
    "budget_adherence_score",
    "job_stability_score",
]

SEGMENT_CATEGORICAL_FEATURES = [
    "income_type",
    "financial_goal_priority",
]

PRODUCT_CATEGORIES = [
    "laptop", "vehicle", "loan", "insurance", "home", "technology", "travel",
]

INCOME_TYPES = ["fixed", "variable", "mixed"]
GOALS = ["liquidity", "growth", "balanced"]
AGE_RANGES = ["18_24", "25_34", "35_44", "45_54", "55_plus"]

RISK_BAND_NAMES = {
    0: "no recomendable",
    1: "riesgo alto",
    2: "viable con ajustes",
    3: "viable saludable",
}

SEGMENT_NAME_BY_SCORE = {
    0: "sobreendeudado",
    1: "ajustado pero recuperable",
    2: "ingreso variable / alta incertidumbre",
    3: "estable y conservador",
    4: "estable con capacidad de expansión",
}

# ============================================================
# MAPAS PARA NO TOCAR EL FRONTEND
# ============================================================

CATEGORY_MAP = {
    "laptop": "laptop", "computadora": "laptop", "macbook": "laptop",
    "vehículo": "vehicle", "vehiculo": "vehicle", "vehicle": "vehicle",
    "carro": "vehicle", "auto": "vehicle",
    "seguro": "insurance", "insurance": "insurance",
    "préstamo": "loan", "prestamo": "loan", "loan": "loan",
    "hogar": "home", "home": "home", "appliance": "home",
    "electrodoméstico": "home", "electrodomestico": "home",
    "tecnología": "technology", "tecnologia": "technology",
    "technology": "technology", "smartphone": "technology", "celular": "technology",
    "travel": "travel", "viaje": "travel",
}

INCOME_TYPE_MAP = {
    "fixed": "fixed", "fijo": "fixed", "empleado/a": "fixed", "empleado": "fixed",
    "variable": "variable", "independiente": "variable",
    "desempleado/a": "variable", "desempleado": "variable",
    "estudiante": "variable",
    "mixed": "mixed", "mixto": "mixed",
    "pensionado/a": "mixed", "pensionado": "mixed",
}

GOAL_MAP = {
    "liquidity": "liquidity", "liquidez": "liquidity",
    "reducir deudas": "liquidity", "organizar mi presupuesto": "liquidity",
    "ahorrar más": "liquidity", "ahorrar mas": "liquidity",
    "growth": "growth", "crecimiento": "growth", "empezar a invertir": "growth",
    "balanced": "balanced", "balanceado": "balanced",
    "comprar mejor": "balanced", "tomar decisiones con menos riesgo": "balanced",
}

RISK_TOLERANCE_TO_SCORE = {
    "conservador": 0.72, "moderado": 0.84, "agresivo": 0.78,
}


# ============================================================
# UTILIDADES GENERALES
# ============================================================

def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _first(payload: Dict[str, Any], keys: Iterable[str], default: Any = None) -> Any:
    for key in keys:
        if key in payload and payload[key] not in (None, ""):
            return payload[key]
    return default


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return int(default)
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    return max(min(float(value), max_value), min_value)


def normalize_category(value: Any) -> str:
    raw = _normalize_text(value)
    return CATEGORY_MAP.get(raw, raw if raw in PRODUCT_CATEGORIES else "technology")


def normalize_income_type(value: Any) -> str:
    raw = _normalize_text(value)
    return INCOME_TYPE_MAP.get(raw, "mixed")


def normalize_financial_goal(value: Any) -> str:
    raw = _normalize_text(value)
    return GOAL_MAP.get(raw, "balanced")


def age_to_range(age: Any) -> str:
    age_value = _int(age, 35)
    if 18 <= age_value <= 24:
        return "18_24"
    if 25 <= age_value <= 34:
        return "25_34"
    if 35 <= age_value <= 44:
        return "35_44"
    if 45 <= age_value <= 54:
        return "45_54"
    return "55_plus"


def monthly_payment(financed_amount: float, annual_rate: float, term_months: int) -> float:
    financed_amount = max(_num(financed_amount), 0.0)
    annual_rate = max(_num(annual_rate), 0.0)
    term_months = max(_int(term_months), 0)
    if financed_amount <= 0 or term_months <= 0:
        return 0.0
    monthly_rate = annual_rate / 12.0
    if monthly_rate <= 0:
        return round(financed_amount / term_months, 2)
    payment = financed_amount * (monthly_rate / (1 - (1 + monthly_rate) ** (-term_months)))
    return round(payment, 2)


# ============================================================
# CONVERSIÓN DESDE BD / FRONTEND AL INPUT DEL MOTOR
# ============================================================

def build_user_dict_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Acepta el perfil JSON del usuario (campo Perfil de la tabla Usuarios)
    y devuelve el dict listo para el motor de segmentación.
    """
    # El payload puede venir anidado (desde el wizard de Angular)
    # o plano (desde vistas de BD).
    finances = payload.get("finances", payload)
    preferences = payload.get("preferences", payload)
    personal = payload.get("personal", payload)
    goals = payload.get("goals", payload)

    income_main = _num(_first(finances, [
        "monthlyIncome", "ingresoMensualPrincipal", "IngresoMensualPrincipal",
    ], 0))
    income_extra = _num(_first(finances, [
        "extraIncome", "ingresosExtra", "IngresosExtra",
    ], 0))
    monthly_income_avg = income_main + income_extra

    fixed = _num(_first(finances, ["fixedExpenses", "gastosFijosMensuales", "GastosFijosMensuales"], 0))
    variable = _num(_first(finances, ["variableExpenses", "gastosVariablesMensuales", "GastosVariablesMensuales"], 0))
    debt_payment = _num(_first(finances, ["activeDebts", "compromisosDeudasActivas", "CompromisosDeudasActivas"], 0))
    savings = _num(_first(finances, ["monthlySavingsCapacity", "capacidadAhorroMensual", "CapacidadAhorroMensual"],
                          max(monthly_income_avg - fixed - variable - debt_payment, 0)))
    emergency_months_val = _num(_first(finances, ["emergencyFundMonths", "mesesFondoEmergencia", "MesesFondoEmergencia"], 0))
    essential = max(fixed, 5000)
    liquid_savings = emergency_months_val * essential

    situacion_laboral = _first(personal, ["employmentType", "situacionLaboral", "SituacionLaboral"], "mixed")
    income_type = normalize_income_type(situacion_laboral)

    if income_type == "fixed":
        default_volatility, default_stability = 0.12, 0.85
    elif income_type == "variable":
        default_volatility, default_stability = 0.35, 0.55
    else:
        default_volatility, default_stability = 0.22, 0.70

    risk_raw = _normalize_text(_first(preferences, ["riskTolerance", "toleranciaRiesgo", "ToleranciéRiesgo"], "moderado"))
    budget_adherence = RISK_TOLERANCE_TO_SCORE.get(risk_raw, 0.72)

    financial_goal = normalize_financial_goal(_first(goals, [
        "mainGoal", "objetivoPrincipal", "ObjetivoPrincipal",
    ], "balanced"))

    free_cash_flow = monthly_income_avg - fixed - variable - debt_payment
    dti = debt_payment / max(monthly_income_avg, EPS)
    expense_ratio = (fixed + variable) / max(monthly_income_avg, EPS)
    dependents = _int(_first(personal, ["dependents", "dependientes", "Dependientes"], 0))

    return {
        "dti_current": clamp(dti, 0.0, 5.0),
        "expense_ratio": clamp(expense_ratio, 0.0, 5.0),
        "free_cash_flow_current": free_cash_flow,
        "emergency_months": emergency_months_val,
        "liquid_savings": liquid_savings,
        "income_volatility_score": clamp(default_volatility),
        "dependents_count": dependents,
        "high_impact_purchase_frequency": clamp(0.30),
        "budget_adherence_score": clamp(budget_adherence),
        "job_stability_score": clamp(default_stability),
        "income_type": income_type,
        "financial_goal_priority": financial_goal,
    }


# ============================================================
# GENERACIÓN DE DATOS SINTÉTICOS
# ============================================================

def _generate_training_data(n: int = 4000) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_STATE)
    income_type_choices = rng.choice(INCOME_TYPES, n)
    goal_choices = rng.choice(GOALS, n)

    dti = rng.uniform(0.0, 0.85, n)
    expense_ratio = rng.uniform(0.20, 0.90, n)
    fcf = rng.uniform(-15000, 80000, n)
    em = rng.uniform(0, 12, n)
    ls = em * rng.uniform(3000, 25000, n)
    ivs = rng.uniform(0.08, 0.85, n)
    dep = rng.integers(0, 6, n).astype(float)
    hipf = rng.uniform(0.10, 0.90, n)
    bas = rng.uniform(0.20, 0.95, n)
    jss = rng.uniform(0.20, 0.95, n)

    return pd.DataFrame({
        "dti_current": dti,
        "expense_ratio": expense_ratio,
        "free_cash_flow_current": fcf,
        "emergency_months": em,
        "liquid_savings": ls,
        "income_volatility_score": ivs,
        "dependents_count": dep,
        "high_impact_purchase_frequency": hipf,
        "budget_adherence_score": bas,
        "job_stability_score": jss,
        "income_type": income_type_choices,
        "financial_goal_priority": goal_choices,
    })


# ============================================================
# PIPELINE DE SEGMENTACIÓN
# ============================================================

def _build_segment_pipeline() -> Pipeline:
    numeric_transformer = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    categorical_transformer = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    preprocessor = ColumnTransformer([
        ("num", numeric_transformer, SEGMENT_NUMERIC_FEATURES),
        ("cat", categorical_transformer, SEGMENT_CATEGORICAL_FEATURES),
    ])
    return Pipeline([
        ("preprocessor", preprocessor),
        ("kmeans", KMeans(n_clusters=5, random_state=RANDOM_STATE, n_init=15)),
    ])


def _train_segmentation_model() -> Pipeline:
    print("Entrenando modelo de segmentación...")
    df = _generate_training_data(4000)
    pipeline = _build_segment_pipeline()
    pipeline.fit(df[SEGMENT_NUMERIC_FEATURES + SEGMENT_CATEGORICAL_FEATURES])
    print("Modelo de segmentación entrenado.")
    return pipeline


# ============================================================
# CARGAR O ENTRENAR ARTEFACTOS
# ============================================================

def load_or_train_artifacts(path: str) -> dict:
    """Carga el modelo si existe; si no, lo entrena y lo guarda."""
    if os.path.exists(path):
        try:
            arts = joblib.load(path)
            if "segmentation_pipeline" in arts:
                print(f"Artefactos cargados desde: {path}")
                return arts
        except Exception as e:
            print(f"Error cargando artefactos ({e}). Reentrenando...")

    pipeline = _train_segmentation_model()
    arts = {
        "segmentation_pipeline": pipeline,
        "segment_names": SEGMENT_NAME_BY_SCORE,
    }
    joblib.dump(arts, path)
    print(f"Artefactos guardados en: {path}")
    return arts


# ============================================================
# PREDICCIÓN DE SEGMENTO
# ============================================================

def predict_segment(user_features: Dict[str, Any], artifacts: dict) -> dict:
    """
    Recibe el dict de features ya construido y devuelve:
      segment_id, segment_name, profile_score, summary
    """
    pipeline: Pipeline = artifacts["segmentation_pipeline"]
    segment_names: dict = artifacts["segment_names"]

    df = pd.DataFrame([user_features])
    cluster_id = int(pipeline.predict(df[SEGMENT_NUMERIC_FEATURES + SEGMENT_CATEGORICAL_FEATURES])[0])
    segment_name = segment_names.get(cluster_id, "sin clasificar")

    # Profile score heurístico (0-100)
    fcf = user_features.get("free_cash_flow_current", 0)
    dti = user_features.get("dti_current", 0.5)
    em = user_features.get("emergency_months", 0)
    bas = user_features.get("budget_adherence_score", 0.5)

    score = 100
    if dti > 0.50: score -= 25
    elif dti > 0.35: score -= 15
    elif dti > 0.20: score -= 5
    if fcf < 0: score -= 25
    if em < 1: score -= 20
    elif em < 3: score -= 10
    score += int(bas * 5)
    score = max(0, min(100, score))

    summaries = {
        "sobreendeudado": "Tu perfil muestra presión financiera alta. Estabiliza deudas antes de asumir nuevos compromisos.",
        "ajustado pero recuperable": "Tienes margen limitado, pero puede mejorar con control de gastos y mayor fondo de emergencia.",
        "ingreso variable / alta incertidumbre": "Tus ingresos presentan incertidumbre. Prioriza liquidez y evita compromisos largos.",
        "estable y conservador": "Tu perfil es estable y prudente. Puedes evaluar compromisos moderados cuidando la liquidez.",
        "estable con capacidad de expansión": "Tienes buena capacidad financiera. Puedes considerar nuevas compras o inversiones con planificación.",
    }

    return {
        "segment_id": cluster_id,
        "segment_name": segment_name,
        "profile_score": score,
        "summary": summaries.get(segment_name, "Perfil clasificado correctamente."),
    }


if __name__ == "__main__":
    arts = load_or_train_artifacts("credenza_artifacts.joblib")
    print("Motor listo.")
