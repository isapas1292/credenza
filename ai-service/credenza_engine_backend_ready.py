from __future__ import annotations
import joblib
import numpy as np
import pandas as pd
import os
from typing import Any, Dict, Iterable, List, Optional, Tuple

import dr_market

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
    roc_auc_score,
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
    "free_cash_flow_current",
    "emergency_months",
    "liquid_savings",
    "job_stability_score",
    "budget_adherence_score",
    "income_volatility_score",
]

SEGMENT_CATEGORICAL_FEATURES = [
    "income_type",
    "financial_goal_priority",
]

CLASSIFIER_NUMERIC_FEATURES = [
    "dti_post",
    "free_cash_flow_post",
    "emergency_months",
    "liquid_savings",
    "job_stability_score",
    "budget_adherence_score",
    "income_volatility_score",
    "upfront_burden",
    "stress_ratio",
]

CLASSIFIER_CATEGORICAL_FEATURES = [
    "product_category",
    "income_type",
]

PRODUCT_CATEGORIES = [
    "laptop", "vehicle", "loan", "insurance", "home", "technology", "travel",
]

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
# MAPAS PARA COMPATIBILIDAD CON FRONTEND
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
# UTILIDADES DE NORMALIZACIÓN Y CÁLCULO
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

# ── Clasificación del propósito de la compra ────────────────────────────────
# Un bien esencial / herramienta de trabajo justifica más estirar el presupuesto
# que un gusto o lujo. Un producto de ocio que tensiona las finanzas no es
# prudente aunque "alcance".
PURPOSE_MAP = {
    # Esenciales / necesidad / herramienta
    "trabajo": "esencial", "reemplazo": "esencial", "vivir": "esencial",
    "inversión": "esencial", "inversion": "esencial", "salud": "esencial",
    "estudio": "esencial", "educación": "esencial", "educacion": "esencial",
    "negocio": "esencial", "necesidad": "esencial",
    "familiar": "esencial",                                  # vehículo: uso familiar
    "vida": "esencial", "vehículo": "esencial", "vehiculo": "esencial",
    "bienes": "esencial",                                    # seguro: proteger bienes
    "consolidar": "esencial", "emergencia": "esencial",      # préstamo
    # Intermedio
    "mejora": "mejora", "actualización": "mejora", "actualizacion": "mejora",
    # Ocio / lujo / discrecional
    "entretenimiento": "ocio", "diversión": "ocio", "diversion": "ocio",
    "lujo": "ocio", "ocio": "ocio", "regalo": "ocio", "capricho": "ocio", "hobby": "ocio",
    "personal": "ocio",                                      # préstamo: gasto personal
}

PURPOSE_LABEL = {"esencial": "una necesidad", "mejora": "una mejora", "ocio": "un gusto o entretenimiento"}

def classify_purpose(value: Any) -> str:
    raw = _normalize_text(value)
    return PURPOSE_MAP.get(raw, "mejora")  # neutral por defecto

# Vida útil declarada -> meses (límite superior aproximado)
LIFESPAN_MONTHS = {"1-2": 24, "3-5": 60, "5+": 120}

def lifespan_to_months(value: Any) -> Optional[int]:
    return LIFESPAN_MONTHS.get(_normalize_text(value))

# ============================================================
# LÓGICA DE NEGOCIO Y FEATURE ENGINEERING
# ============================================================

def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    
    # Aseguramos que existan las columnas básicas para evitar KeyErrors
    for col in ["current_debt_payment_monthly", "monthly_income_avg", "fixed_expenses_monthly", 
                "variable_expenses_monthly_avg", "emergency_fund_amount", "essential_expenses_monthly",
                "estimated_installment_monthly", "down_payment", "liquid_savings",
                "maintenance_cost_monthly", "insurance_cost_monthly", "product_price"]:
        if col not in df.columns:
            df[col] = 0.0
            
    if "product_category" not in df.columns:
        df["product_category"] = "technology"

    # Estimar costos ocultos si no se proporcionaron
    is_vehicle = df["product_category"].str.lower() == "vehicle"
    is_home = df["product_category"].str.lower() == "home"
    is_insurance = df["product_category"].str.lower() == "insurance"

    # Vehículo: ~0.5% mant, ~0.5% seguro mensual si no viene del usuario
    df.loc[is_vehicle & (df["maintenance_cost_monthly"] == 0), "maintenance_cost_monthly"] = df["product_price"] * 0.005
    df.loc[is_vehicle & (df["insurance_cost_monthly"] == 0), "insurance_cost_monthly"] = df["product_price"] * 0.005
    
    # Hogar: ~0.1% mant
    df.loc[is_home & (df["maintenance_cost_monthly"] == 0), "maintenance_cost_monthly"] = df["product_price"] * 0.001

    # Features actuales
    df["dti_current"] = df["current_debt_payment_monthly"] / df["monthly_income_avg"].replace(0, EPS)
    df["free_cash_flow_current"] = df["monthly_income_avg"] - df["fixed_expenses_monthly"] - df["variable_expenses_monthly_avg"] - df["current_debt_payment_monthly"]
    df["emergency_months"] = df["emergency_fund_amount"] / df["essential_expenses_monthly"].replace(0, EPS)
    
    # Features post-compra
    # El seguro no suma al DTI porque es un gasto mensual fijo, no una deuda
    df["dti_post"] = np.where(
        is_insurance,
        df["current_debt_payment_monthly"] / df["monthly_income_avg"].replace(0, EPS),
        (df["current_debt_payment_monthly"] + df["estimated_installment_monthly"]) / df["monthly_income_avg"].replace(0, EPS)
    )
    
    df["free_cash_flow_post"] = df["free_cash_flow_current"] - df["estimated_installment_monthly"] - df["maintenance_cost_monthly"] - df["insurance_cost_monthly"]
    
    df["upfront_burden"] = df["down_payment"] / df["liquid_savings"].replace(0, EPS)
    df["liquidity_after_down_payment"] = df["liquid_savings"] - df["down_payment"]
    df["stress_ratio"] = df["estimated_installment_monthly"] / df["free_cash_flow_current"].apply(lambda x: max(x, EPS))
    
    return df

def risk_band_from_row(row: Dict[str, Any]) -> int:
    # Lógica de reglas básica para determinar banda de riesgo
    fcf_post = row["free_cash_flow_post"]
    dti_post = row["dti_post"]
    em = row["emergency_months"]
    
    if fcf_post < 0 or dti_post > 0.65:
        return 0 # No recomendable
    if dti_post > 0.50 or em < 1:
        return 1 # Riesgo alto
    if dti_post > 0.40 or em < 3:
        return 2 # Viable con ajustes
    return 3 # Viable saludable

def primary_reason_from_row(row: Dict[str, Any]) -> str:
    if row["free_cash_flow_post"] < 0:
        return "flujo de caja negativo"
    if row["dti_post"] > 0.55:
        return "sobreendeudamiento"
    if row["emergency_months"] < 1:
        return "falta de reserva de emergencia"
    if row["upfront_burden"] > 0.85:
        return "descapitalización excesiva"
    return "estabilidad general"

def viable_from_risk_band(band: int) -> bool:
    return band >= 2

def band_from_score(score: float) -> int:
    """Deriva la banda de riesgo a partir del score final unificado.
    Mantiene coherencia total entre el % mostrado, la viabilidad y los textos."""
    if score < 0.25:
        return 0  # No recomendable
    if score < 0.45:
        return 1  # Riesgo alto
    if score < 0.65:
        return 2  # Viable con ajustes
    return 3      # Viable saludable

def label_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df["label_risk_band"] = df.apply(risk_band_from_row, axis=1)
    df["label_viable"] = df["label_risk_band"].apply(viable_from_risk_band)
    df["label_primary_reason"] = df.apply(primary_reason_from_row, axis=1)
    return df

# ============================================================
# ENTRENAMIENTO Y PIPELINES (BASADO EN EL SNIPPET DEL USUARIO)
# ============================================================

def _sample_user_values(rng):
    # Generar diversos perfiles de ingreso
    profile_type = rng.choice(["low_income", "middle_class", "high_income", "over_indebted", "high_liquidity_low_income"])
    
    if profile_type == "low_income":
        income = rng.uniform(15000, 35000)
        fixed = income * rng.uniform(0.4, 0.6)
        debt = income * rng.uniform(0.1, 0.5)
        liquid = income * rng.uniform(0.0, 1.0)
    elif profile_type == "high_income":
        income = rng.uniform(120000, 350000)
        fixed = income * rng.uniform(0.15, 0.3)
        debt = income * rng.uniform(0.0, 0.2)
        liquid = income * rng.uniform(2.0, 10.0)
    elif profile_type == "over_indebted":
        income = rng.uniform(30000, 150000)
        fixed = income * rng.uniform(0.3, 0.5)
        debt = income * rng.uniform(0.45, 0.8) # Alta deuda
        liquid = income * rng.uniform(0.0, 0.5)
    elif profile_type == "high_liquidity_low_income":
        income = rng.uniform(20000, 40000)
        fixed = income * rng.uniform(0.3, 0.4)
        debt = 0.0
        liquid = rng.uniform(150000, 500000) # Ahorros altos por herencia, etc.
    else: # middle_class
        income = rng.uniform(35000, 120000)
        fixed = income * rng.uniform(0.25, 0.4)
        debt = income * rng.uniform(0.1, 0.4)
        liquid = income * rng.uniform(0.5, 3.0)

    variable = income * rng.uniform(0.1, 0.25)
    essential = fixed * 0.85
    
    return {
        "monthly_income_avg": income,
        "fixed_expenses_monthly": fixed,
        "variable_expenses_monthly_avg": variable,
        "current_debt_payment_monthly": debt,
        "essential_expenses_monthly": essential,
        "liquid_savings": liquid,
        "emergency_fund_amount": liquid * rng.uniform(0.2, 0.8), # Parte de la liquidez es emergencia
        "job_stability_score": rng.uniform(0.3, 0.98),
        "budget_adherence_score": rng.uniform(0.3, 0.95),
        "income_volatility_score": rng.uniform(0.05, 0.6),
        "income_type": rng.choice(["fixed", "variable", "mixed"]),
        "financial_goal_priority": rng.choice(["liquidity", "growth", "balanced"]),
        "dependents_count": rng.integers(0, 5)
    }

def _sample_product_values(rng, category):
    price = rng.uniform(10000, 1500000)
    down_payment = price * rng.uniform(0.1, 0.3)
    financed = price - down_payment
    term = rng.choice([12, 24, 36, 48, 60, 72])
    rate = rng.uniform(0.08, 0.25)
    
    # Pago mensual simple
    monthly_rate = rate / 12
    if monthly_rate > 0:
        installment = financed * (monthly_rate / (1 - (1 + monthly_rate) ** (-term)))
    else:
        installment = financed / term
        
    return {
        "product_category": category,
        "product_price": price,
        "down_payment": down_payment,
        "financed_amount": financed,
        "term_months": term,
        "interest_rate": rate,
        "estimated_installment_monthly": installment,
        "maintenance_cost_monthly": price * 0.001,
        "insurance_cost_monthly": price * 0.0005,
    }

def generate_synthetic_dataset(rows: int = 50000, options_per_user: int = 3) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_STATE)
    total_users = max(rows // max(options_per_user, 1), 1)

    records = []
    for user_id in range(total_users):
        user_data = _sample_user_values(rng)
        selected_categories = rng.choice(PRODUCT_CATEGORIES, size=options_per_user, replace=True)

        for category in selected_categories:
            option_data = _sample_product_values(rng, str(category))
            records.append({"user_id": user_id, **user_data, **option_data})

    df = pd.DataFrame(records)
    df = add_engineered_features(df)
    df = label_dataframe(df)
    return df

def _build_preprocessor(numeric_features, categorical_features):
    numeric_pipeline = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    categorical_pipeline = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    return ColumnTransformer(transformers=[
        ("num", numeric_pipeline, list(numeric_features)),
        ("cat", categorical_pipeline, list(categorical_features)),
    ])

def choose_best_k(x_transformed, candidate_values=None):
    candidate_values = candidate_values or [4, 5, 6]
    best_k = candidate_values[0]
    best_score = -1.0

    if x_transformed.shape[0] > 3000:
        rng = np.random.default_rng(RANDOM_STATE)
        sample_idx = rng.choice(x_transformed.shape[0], size=3000, replace=False)
        x_for_eval = x_transformed[sample_idx]
    else:
        x_for_eval = x_transformed

    for k in candidate_values:
        model = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=10)
        clusters = model.fit_predict(x_for_eval)
        score = silhouette_score(x_for_eval, clusters)
        if score > best_score:
            best_k = k
            best_score = score
    return best_k

def _cluster_health_score(summary_row):
    return (
        2.0 * summary_row["free_cash_flow_current"]
        + 1.5 * summary_row["emergency_months"]
        + 1.0 * summary_row["liquid_savings"]
        + 1.0 * summary_row["job_stability_score"]
        + 0.5 * summary_row["budget_adherence_score"]
        - 2.5 * summary_row["dti_current"]
        - 1.5 * summary_row["income_volatility_score"]
    )

def build_segment_metadata(df, cluster_col="segment_id"):
    cols = ["dti_current", "free_cash_flow_current", "emergency_months", "liquid_savings", "job_stability_score", "budget_adherence_score", "income_volatility_score"]
    grouped = df.groupby(cluster_col)[cols].mean().reset_index()
    grouped["health_score"] = grouped.apply(_cluster_health_score, axis=1)
    grouped = grouped.sort_values("health_score").reset_index(drop=True)

    cluster_to_name = {}
    ordered_ids = grouped[cluster_col].tolist()
    default_names = list(SEGMENT_NAME_BY_SCORE.values())

    for index, cluster_id in enumerate(ordered_ids):
        cluster_to_name[int(cluster_id)] = default_names[min(index, len(default_names) - 1)]

    return {
        "cluster_to_name": cluster_to_name,
        "summary": grouped.to_dict(orient="records"),
        "segment_features": SEGMENT_NUMERIC_FEATURES,
    }

def train_segmentation(df: pd.DataFrame):
    preprocessor = _build_preprocessor(SEGMENT_NUMERIC_FEATURES, SEGMENT_CATEGORICAL_FEATURES)
    x_transformed = preprocessor.fit_transform(df)
    best_k = choose_best_k(x_transformed)
    model = KMeans(n_clusters=best_k, random_state=RANDOM_STATE, n_init=20)
    cluster_ids = model.fit_predict(x_transformed)

    df_with_clusters = df.copy()
    df_with_clusters["segment_id"] = cluster_ids
    metadata = build_segment_metadata(df_with_clusters)

    return {"preprocessor": preprocessor, "model": model, "metadata": metadata}

def train_viability_classifier(df: pd.DataFrame):
    x = df.drop(columns=["label_viable", "label_risk_band", "label_primary_reason", "user_id"], errors="ignore")
    y = df["label_viable"].astype(int)

    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y)
    preprocessor = _build_preprocessor(CLASSIFIER_NUMERIC_FEATURES, CLASSIFIER_CATEGORICAL_FEATURES)

    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("classifier", LogisticRegression(max_iter=1500, class_weight="balanced", random_state=RANDOM_STATE))
    ])
    pipeline.fit(x_train, y_train)

    y_pred = pipeline.predict(x_test)
    metrics = {"accuracy": float(accuracy_score(y_test, y_pred))}
    return {"model": pipeline, "metrics": metrics}

def train_full_pipeline(rows=50000):
    dataset = generate_synthetic_dataset(rows=rows)
    segmentation_artifacts = train_segmentation(dataset)
    classifier_artifacts = train_viability_classifier(dataset)
    return {
        "segmentation_artifacts": segmentation_artifacts,
        "classifier_artifacts": classifier_artifacts,
        "training_columns": dataset.columns.tolist()
    }

# ============================================================
# PREDICCIÓN Y EXPLICACIÓN
# ============================================================

def predict_segment(df: pd.DataFrame, seg_arts: dict) -> Tuple[List[int], List[str]]:
    x_transformed = seg_arts["preprocessor"].transform(df)
    ids = seg_arts["model"].predict(x_transformed)
    names = [seg_arts["metadata"]["cluster_to_name"].get(int(i), "desconocido") for i in ids]
    return ids.tolist(), names

STABLE_SEGMENT_ID_BY_NAME = {
    name: segment_id + 1 for segment_id, name in SEGMENT_NAME_BY_SCORE.items()
}

def stable_segment_id(segment_name: str) -> int:
    """Return a business ID that does not depend on the internal KMeans cluster."""
    return STABLE_SEGMENT_ID_BY_NAME.get(segment_name, 0)

def calculate_profile_score(engineered_record: Dict[str, Any]) -> float:
    """Score integral de salud financiera (0-100), independiente del producto."""
    income = max(float(engineered_record.get("monthly_income_avg", 0)), 1.0)
    fcf_ratio = float(engineered_record.get("free_cash_flow_current", 0)) / income
    dti = max(float(engineered_record.get("dti_current", 0)), 0.0)
    emergency_months = max(float(engineered_record.get("emergency_months", 0)), 0.0)
    stability = float(engineered_record.get("job_stability_score", 0.0))
    adherence = float(engineered_record.get("budget_adherence_score", 0.0))
    volatility = float(engineered_record.get("income_volatility_score", 1.0))

    # Flujo libre: 0 puntos en déficit, máximo al conservar 40%+ del ingreso.
    cash_flow_score = min(max(fcf_ratio / 0.40, 0.0), 1.0) * 30
    # Endeudamiento: máximo sin deuda; llega a cero al alcanzar 60% de DTI.
    debt_score = (1.0 - min(dti / 0.60, 1.0)) * 25
    # Fondo de emergencia: meta saludable de 6 meses.
    emergency_score = min(emergency_months / 6.0, 1.0) * 20
    stability_score = min(max(stability, 0.0), 1.0) * 10
    adherence_score = min(max(adherence, 0.0), 1.0) * 10
    volatility_score = (1.0 - min(max(volatility, 0.0), 1.0)) * 5

    return round(min(max(
        cash_flow_score + debt_score + emergency_score
        + stability_score + adherence_score + volatility_score,
        0.0,
    ), 100.0), 2)

def build_profile_summary(segment_name: str, engineered_record: Dict[str, Any], score: float) -> str:
    fcf = float(engineered_record.get("free_cash_flow_current", 0))
    dti = float(engineered_record.get("dti_current", 0)) * 100
    emergency = float(engineered_record.get("emergency_months", 0))
    return (
        f"Perfil {segment_name} con salud financiera de {score:.0f}/100. "
        f"Flujo libre mensual RD${fcf:,.0f}, endeudamiento {dti:.0f}% "
        f"y fondo de emergencia de {emergency:.1f} meses."
    )

def classify_financial_profile(user_dict: Dict[str, Any], seg_arts: dict) -> Dict[str, Any]:
    """Clasifica el perfil una vez y devuelve un contrato listo para persistir."""
    df_engineered = add_engineered_features(pd.DataFrame([user_dict]))
    engineered_record = df_engineered.iloc[0].to_dict()
    income = max(float(engineered_record.get("monthly_income_avg", 0)), 1.0)
    fcf_ratio = float(engineered_record.get("free_cash_flow_current", 0)) / income
    dti = float(engineered_record.get("dti_current", 0))
    emergency = float(engineered_record.get("emergency_months", 0))
    income_type = engineered_record.get("income_type", "mixed")

    # Segmentos de negocio deterministas y explicables. El modelo de clusters
    # queda reservado para experimentación; nunca define IDs persistidos.
    if dti >= 0.50 or fcf_ratio <= 0:
        segment_name = SEGMENT_NAME_BY_SCORE[0]
    elif income_type == "variable" and emergency < 4:
        segment_name = SEGMENT_NAME_BY_SCORE[2]
    elif fcf_ratio < 0.15 or emergency < 2:
        segment_name = SEGMENT_NAME_BY_SCORE[1]
    elif fcf_ratio >= 0.30 and emergency >= 4 and dti <= 0.25:
        segment_name = SEGMENT_NAME_BY_SCORE[4]
    else:
        segment_name = SEGMENT_NAME_BY_SCORE[3]

    score = calculate_profile_score(engineered_record)
    return {
        "segment_id": stable_segment_id(segment_name),
        "segment_name": segment_name,
        "profile_score": score,
        "summary": build_profile_summary(segment_name, engineered_record, score),
    }

def predict_viability(df: pd.DataFrame, class_arts: dict) -> Tuple[List[int], List[float]]:
    probs = class_arts["model"].predict_proba(df)[:, 1]
    preds = (probs >= 0.5).astype(int)
    return preds.tolist(), probs.tolist()

def compute_recommendation_score(viability_prob, engineered_record, category="technology", preference_match=0.8):
    """
    Score governed by financial reality. The ML probability adjusts within
    bands set by hard financial fundamentals — it can never override them.
    """
    income = max(float(engineered_record["monthly_income_avg"]), 1.0)
    free_post = float(engineered_record["free_cash_flow_post"])
    dti_post = float(engineered_record["dti_post"])
    months = float(engineered_record["emergency_months"])
    stress = float(engineered_record["stress_ratio"])
    upfront = float(engineered_record.get("upfront_burden", 0))

    # ── Hard reality caps ──────────────────────────────────────
    # These are non-negotiable ceilings based on financial fundamentals.
    if free_post < 0:
        hard_cap = 0.15  # Negative cash flow = not viable
    elif category == "home":
        # Las hipotecas toleran un mayor DTI
        if dti_post > 0.65:
            hard_cap = 0.25
        elif dti_post > 0.55:
            hard_cap = 0.40
        elif dti_post > 0.45:
            hard_cap = 0.60
        elif stress > 0.85:
            hard_cap = 0.55
        elif months < 1 and free_post < income * 0.10:
            hard_cap = 0.50
        else:
            hard_cap = 1.0
    elif category in ["technology", "laptop", "travel"]:
        # Bienes de consumo/experiencias son más riesgosos si se financian
        if dti_post > 0.50:
            hard_cap = 0.25
        elif dti_post > 0.40:
            hard_cap = 0.40
        elif dti_post > 0.35:
            hard_cap = 0.60
        elif stress > 0.70:
            hard_cap = 0.55
        elif months < 1 and free_post < income * 0.15:
            hard_cap = 0.50
        else:
            hard_cap = 1.0
    else:
        # Default (vehicle, loan, insurance)
        if dti_post > 0.60:
            hard_cap = 0.25  # Severe over-indebtedness
        elif dti_post > 0.50:
            hard_cap = 0.40  # Dangerous debt level
        elif dti_post > 0.40:
            hard_cap = 0.60  # Tight but manageable
        elif stress > 0.80:
            hard_cap = 0.55  # New payment eats most free cash
        elif months < 1 and free_post < income * 0.15:
            hard_cap = 0.50  # No safety net and tight
        else:
            hard_cap = 1.0   # No hard cap — user is in good shape

    # ── Component scores (0-1 each) ───────────────────────────
    # Budget fit: how comfortably the new payment fits in the budget
    budget_fit = clamp(free_post / max(income * 0.30, 1.0))
    
    # DTI health: how far the user is from the danger zone
    dti_health = clamp(1.0 - (dti_post / 0.55))
    
    # Emergency preservation: how much safety net remains
    emergency_score = clamp(months / 6.0)
    
    # Stress ratio: what % of free cash the new payment consumes
    stress_score = clamp(1.0 - stress)

    # ── Weighted composite ─────────────────────────────────────
    raw_score = (
        0.30 * budget_fit +
        0.25 * dti_health +
        0.20 * stress_score +
        0.15 * emergency_score +
        0.10 * clamp(viability_prob)  # ML is just a small signal, not the driver
    )

    # Apply the hard cap
    final_score = min(raw_score, hard_cap)
    return round(final_score, 4)

def build_explanation_details(feat: Dict[str, Any], segment_name: str = "", product_data: dict = None) -> Tuple[List[str], List[str]]:
    """Generate explanation details and action plan using the user's REAL numbers and segment."""
    details = []
    action_plan = []
    
    income = feat.get("monthly_income_avg", 0)
    fcf_current = feat.get("free_cash_flow_current", 0)
    fcf_post = feat.get("free_cash_flow_post", 0)
    dti_post = feat.get("dti_post", 0)
    dti_current = feat.get("dti_current", 0)
    em_months = feat.get("emergency_months", 0)
    stress = feat.get("stress_ratio", 0)
    installment = feat.get("estimated_installment_monthly", 0)
    upfront = feat.get("upfront_burden", 0)
    
    payment_type = ""
    product_name = ""
    if product_data:
        payment_type = product_data.get("payment_type", product_data.get("payment_method", ""))
        product_name = product_data.get("name", "el producto")

    # ── Core financial diagnosis with real numbers ──────────────
    category = normalize_category(product_data.get("product_category", "technology")) if product_data else "technology"
    is_home = category == "home"
    is_insurance = category == "insurance"

    if fcf_post < 0:
        deficit = abs(fcf_post)
        details.append(f"Con esta compra, tu flujo mensual quedaría en RD${fcf_post:,.0f}, es decir, un déficit de RD${deficit:,.0f} cada mes. No podrías cubrir tus gastos.")
        action_plan.append(f"Para que esta compra sea viable necesitas generar al menos RD${deficit:,.0f} más de ingreso mensual, o reducir tus gastos fijos en esa cantidad.")
    elif stress > 0.70:
        pct = stress * 100
        details.append(f"La cuota de RD${installment:,.0f}/mes consumiría el {pct:.0f}% de tu flujo libre actual (RD${fcf_current:,.0f}). Eso te deja muy poco margen para imprevistos.")
        action_plan.append(f"Considera un plazo más largo para bajar la cuota mensual, o busca un producto más económico que no supere el 35% de tu flujo libre (máximo RD${fcf_current * 0.35:,.0f}/mes).")
    elif fcf_post < income * 0.10:
        details.append(f"Después de la compra te quedarían solo RD${fcf_post:,.0f}/mes de flujo libre, menos del 10% de tus ingresos. Cualquier imprevisto podría desbalancearte.")
    
    if is_insurance:
        # Insurance doesn't increase DTI, just focus on FCF
        pass
    elif is_home:
        if dti_post > 0.65:
            pct = dti_post * 100
            details.append(f"Tu nivel de endeudamiento llegaría al {pct:.0f}% de tus ingresos. Incluso para una hipoteca, esto es excesivo y muy riesgoso.")
            action_plan.append(f"Antes de asumir este compromiso, trabaja en reducir tus deudas actuales. Tu endeudamiento actual ya es {dti_current*100:.0f}%.")
        elif dti_post > 0.45:
            pct = dti_post * 100
            details.append(f"Tu endeudamiento post-compra sería {pct:.0f}%. Es aceptable para un préstamo hipotecario, pero requerirá disciplina mensual.")
    else:
        if dti_post > 0.55:
            pct = dti_post * 100
            details.append(f"Tu nivel de endeudamiento llegaría al {pct:.0f}% de tus ingresos. El máximo recomendado es 40%.")
            action_plan.append(f"Antes de asumir esta deuda, trabaja en reducir tus compromisos actuales. Tu DTI actual ya es {dti_current*100:.0f}%.")
        elif dti_post > 0.40:
            pct = dti_post * 100
            details.append(f"Tu endeudamiento post-compra sería {pct:.0f}%, por encima del ideal de 35% pero aún manejable con disciplina.")
    
    if em_months < 1:
        details.append(f"Tu fondo de emergencia cubre menos de 1 mes de gastos. Si ocurre un imprevisto, no tendrías respaldo.")
        action_plan.append(f"Construye un fondo de emergencia de al menos 3 meses antes de comprometerte con pagos nuevos. Necesitas ahorrar aproximadamente RD${feat.get('essential_expenses_monthly', 0) * 3:,.0f}.")
    elif em_months < 3:
        details.append(f"Tu fondo de emergencia cubre {em_months:.1f} meses. Es limitado pero funcional.")
        action_plan.append("Después de la compra, prioriza llevar tu fondo de emergencia a 3-6 meses de gastos esenciales.")
    
    if upfront > 0.85:
        details.append("El pago inicial consumiría casi toda tu liquidez disponible, dejándote sin reservas.")
        action_plan.append("Busca opciones con un pago inicial menor (10-20%) para conservar tu liquidez como colchón de seguridad.")

    # ── Segment-specific advice ────────────────────────────────
    # Solo se añade el consejo cautelar del segmento si ESTA compra no es
    # claramente sana; de lo contrario contradiría un veredicto favorable.
    purchase_is_healthy = (
        fcf_post >= income * 0.10
        and (is_insurance or dti_post <= 0.40)
        and em_months >= 2
    )
    seg = segment_name.lower()
    if purchase_is_healthy:
        if ("variable" in seg or "incertidumbre" in seg):
            action_plan.append("Como tus ingresos son variables, mantén una reserva extra para cubrir el compromiso en meses de bajos ingresos.")
    elif "sobreendeudado" in seg:
        action_plan.insert(0, "Tu perfil indica sobreendeudamiento. Lo más inteligente es saldar deudas existentes antes de asumir una nueva obligación financiera.")
    elif "ajustado" in seg:
        if not any("fondo de emergencia" in a for a in action_plan):
            action_plan.append("Tu perfil es ajustado pero recuperable. Enfoca los próximos 3 meses en fortalecer tus ahorros antes de comprometerte con esta compra.")
    elif "variable" in seg or "incertidumbre" in seg:
        action_plan.append("Como tus ingresos son variables, asegúrate de tener reservas para cubrir las cuotas en meses de bajos ingresos.")

    # ── Payment method specific feedback ───────────────────────
    if payment_type.lower() in ["contado", ""]:
        price = product_data.get("price", 0) if product_data else 0
        liquid = feat.get("liquid_savings", 0)
        if price > liquid * 0.8:
            details.append(f"Pagar al contado (RD${price:,.0f}) consumiría más del 80% de tu liquidez (RD${liquid:,.0f}). Es riesgoso descapitalizarte así.")
            action_plan.append(f"En tu caso, financiar a cuotas sería más prudente para conservar liquidez. Una cuota de 12 meses sería aproximadamente RD${price/12:,.0f}/mes.")
        elif price <= liquid * 0.5:
            details.append("Tienes suficiente liquidez para pagar al contado sin descapitalizarte. Es la opción más eficiente porque evitas intereses.")

    # ── Good scenario ──────────────────────────────────────────
    if not details:
        details.append(f"La compra es financieramente sostenible. Te quedarían RD${fcf_post:,.0f}/mes de flujo libre y tu endeudamiento se mantendría en {dti_post*100:.0f}%.")

    # ── Garantizar siempre al menos un paso de acción coherente ──
    if not action_plan:
        if fcf_post >= income * 0.10 and dti_post <= 0.40 and em_months >= 3:
            action_plan.append("Estás en buena posición. Procede con la compra manteniendo tu disciplina de ahorro y tu fondo de emergencia.")
        else:
            action_plan.append("Antes de comprometerte, separa al menos un 10% de tu ingreso para reforzar tu fondo de emergencia y revisa que la cuota no supere el 35% de tu flujo libre.")

    return details, action_plan

def build_explanation(risk_band, reason, feat, segment_name="", product_data=None):
    details, _ = build_explanation_details(feat, segment_name, product_data)
    base = {0: "No recomendable", 1: "Riesgo alto", 2: "Viable con ajustes", 3: "Viable saludable"}.get(risk_band, "")
    return f"{base}: {details[0]}"

# ============================================================
# INTERFAZ PARA main.py
# ============================================================

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

def _derive_budget_adherence(payload: Dict[str, Any]) -> float:
    """Derive budget_adherence_score from frontend behavioral questions.
    Uses expenseTracking and bigPurchaseHabit from preferences."""
    preferences = payload.get("preferences", {})
    
    # expenseTracking: how disciplined the user is with tracking expenses
    tracking = _normalize_text(preferences.get("expenseTracking", ""))
    tracking_scores = {
        "estricto": 0.95,    # Lleva registro puntual
        "mental": 0.75,      # Presupuesto mental
        "laxo": 0.50,        # Intenta pero falla
        "ninguno": 0.30,     # No lleva registro
    }
    tracking_score = tracking_scores.get(tracking, 0.65)
    
    # bigPurchaseHabit: how the user handles big purchases
    habit = _normalize_text(preferences.get("bigPurchaseHabit", ""))
    habit_scores = {
        "ahorrar el 100%": 0.95,              # Very disciplined saver
        "financiamiento inteligente": 0.80,    # Smart about financing
        "buscar ofertas": 0.70,                # Patient, waits for deals
        "crédito inmediato": 0.40,             # Impulsive buyer
    }
    habit_score = habit_scores.get(habit, 0.65)
    
    # Weighted average: expense tracking matters more for day-to-day discipline
    return round(tracking_score * 0.6 + habit_score * 0.4, 2)

def build_user_dict_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Mapeo de campos del wizard de Angular / BD a los nombres de features internos
    finances = payload.get("finances", payload)
    personal = payload.get("personal", payload)
    goals = payload.get("goals", {})
    
    base_income = round(_num(_first(finances, ["monthlyIncome", "ingresoMensualPrincipal", "monthly_income_avg"]), 0), 2)
    # La ganancia extra (ingresos adicionales) suma al poder adquisitivo real.
    extra_income = round(_num(_first(finances, ["extraIncome", "ingresoExtra", "extra_income"]), 0), 2)
    income = round(base_income + extra_income, 2)
    fixed = round(_num(_first(finances, ["fixedExpenses", "gastosFijosMensuales", "fixed_expenses_monthly"]), 0), 2)
    variable = round(_num(_first(finances, ["variableExpenses", "gastosVariablesMensuales", "variable_expenses_monthly_avg"]), 0), 2)
    debt = round(_num(_first(finances, ["activeDebts", "compromisosDeudasActivas", "current_debt_payment_monthly"]), 0), 2)
    essential = round(max(fixed * 0.85, 5000), 2)
    
    em_months = round(_num(_first(finances, ["emergencyFundMonths", "mesesFondoEmergencia", "emergency_months"]), 0), 2)
    liquid = round(_num(_first(finances, ["liquidSavings", "ahorroLiquido", "liquid_savings"]), em_months * essential), 2)
    
    savings_capacity = round(_num(_first(finances, ["monthlySavingsCapacity", "capacidadAhorroMensual"]), 0), 2)
    
    situacion = _first(personal, ["employmentType", "situacionLaboral", "income_type"], "mixed")
    income_type = normalize_income_type(situacion)
    
    stability = 0.85 if income_type == "fixed" else 0.55 if income_type == "variable" else 0.70
    volatility = 0.12 if income_type == "fixed" else 0.35 if income_type == "variable" else 0.22

    # Derive budget_adherence_score from frontend behavioral data
    budget_adherence = _derive_budget_adherence(payload)
    
    # Derive financial_goal_priority from frontend goal
    main_goal = _normalize_text(_first(goals, ["mainGoal", "objetivoPrincipal"], "balanced"))
    financial_goal = normalize_financial_goal(main_goal)

    return {
        "monthly_income_avg": income,
        "fixed_expenses_monthly": fixed,
        "variable_expenses_monthly_avg": variable,
        "current_debt_payment_monthly": debt,
        "essential_expenses_monthly": essential,
        "liquid_savings": liquid,
        "emergency_fund_amount": round(em_months * essential, 2),
        "job_stability_score": stability,
        "budget_adherence_score": budget_adherence,
        "income_volatility_score": volatility,
        "income_type": income_type,
        "financial_goal_priority": financial_goal,
        "dependents_count": _int(_first(personal, ["dependents", "dependientes"], 0)),
        "monthly_savings_capacity": savings_capacity
    }

def find_optimal_term(user_dict: dict, product_price: float, down_payment: float, annual_rate: float, category: str = "technology") -> int:
    """Busca el plazo que mejor se adapte al flujo libre del usuario."""
    fcf = max(user_dict.get("free_cash_flow_current", 0), 100)
    financed = max(product_price - down_payment, 0)
    
    if financed <= 0: return 0
    
    # Probamos plazos comunes según la categoría
    if category == "home":
        candidate_terms = [120, 180, 240, 360]
    elif category == "vehicle":
        candidate_terms = [36, 48, 60, 72, 84]
    else:
        candidate_terms = [6, 12, 18, 24, 36, 48, 60]
        
    best_term = candidate_terms[-1]
    
    for term in candidate_terms:
        installment = monthly_payment(financed, annual_rate, term)
        # El plazo óptimo es el más corto donde la cuota sea < 30% del flujo libre
        if installment <= (fcf * 0.35):
            return term
            
    return best_term

def compute_contado_penalty(liquid: float, price: float, savings_capacity: float,
                            fcf_current: float, budget_adherence: float,
                            liquidity_impact: float, emergency_after: float) -> float:
    """Penalización de realismo para el pago al contado.
    Ahorrar mucho tiempo, baja disciplina o descapitalizarse hacen que 'contado'
    no sea tan ideal aunque el ML lo puntúe alto (lo evalúa con cuota 0)."""
    penalty = 0.0
    if liquid < price:
        effective_savings = savings_capacity if savings_capacity > 0 else max(fcf_current * 0.30, 0)
        if effective_savings <= 0:
            penalty = 0.45
        else:
            adjusted_months = (price / effective_savings) * (1.0 / max(budget_adherence, 0.3))
            if adjusted_months > 24:
                penalty = 0.40
            elif adjusted_months > 12:
                penalty = 0.25
            elif adjusted_months > 6:
                penalty = 0.15
            elif adjusted_months > 2:
                penalty = 0.10  # incluso ahorrar pocos meses retrasa la compra
            else:
                penalty = 0.05
            if budget_adherence < 0.5:
                penalty += 0.10
    else:
        # Tiene el dinero, pero pagar al contado INMOVILIZA liquidez. Aplicamos
        # un costo de oportunidad continuo proporcional a cuánto ahorro consume,
        # para que el contado no gane SIEMPRE solo por evaluarse con cuota 0:
        # si la compra es pequeña vs sus ahorros, casi no penaliza; si consume
        # buena parte, el financiamiento barato puede ser mejor (conservar caja).
        penalty = clamp(liquidity_impact, 0.0, 1.0) * 0.24
        if emergency_after < 1:
            penalty += 0.12  # quedarse casi sin colchón pesa más
    return penalty


def generate_scenarios(user_dict: dict, product_data: dict, artifacts: dict) -> List[dict]:
    """
    Genera escenarios genuinos basados en el segmento y la realidad financiera del usuario.
    Cada escenario calcula su propio score y métricas reales.
    """
    price = _num(product_data.get("price", 0))
    down_payment = _num(product_data.get("down_payment", 0))
    rate = _num(product_data.get("interest_rate", 0.18))
    
    income = user_dict.get("monthly_income_avg", 1)
    fcf = user_dict.get("monthly_income_avg", 0) - user_dict.get("fixed_expenses_monthly", 0) - user_dict.get("variable_expenses_monthly_avg", 0) - user_dict.get("current_debt_payment_monthly", 0)
    liquid = user_dict.get("liquid_savings", 0)
    
    scenarios = []
    budget_adherence = user_dict.get("budget_adherence_score", 0.65)
    savings_capacity = user_dict.get("monthly_savings_capacity", 0)
    essential = user_dict.get("essential_expenses_monthly", 5000)
    category = normalize_category(product_data.get("product_category", "technology"))

    # ── Caso especial: SEGURO ──────────────────────────────────
    # Un seguro es una prima mensual recurrente, no un bien que se financia
    # a plazos ni que se paga "al contado". Solo existe un escenario: la prima.
    if category == "insurance":
        premium = price  # el "precio" del seguro es la prima mensual
        pct = (premium / max(fcf, 1)) * 100 if fcf > 0 else None
        if fcf <= 0:
            ins_desc = (f"Prima mensual de RD${premium:,.0f}. Actualmente tus gastos igualan o superan "
                        f"tus ingresos, por lo que asumir una prima fija adicional no es sostenible ahora.")
        elif pct > 60:
            ins_desc = (f"Prima mensual de RD${premium:,.0f} ({pct:.0f}% de tu flujo libre). Es una carga alta "
                        f"para tu presupuesto actual.")
        elif pct > 35:
            ins_desc = (f"Prima mensual de RD${premium:,.0f} ({pct:.0f}% de tu flujo libre). Ajustada pero "
                        f"manejable si controlas tus gastos variables.")
        else:
            ins_desc = (f"Prima mensual de RD${premium:,.0f} ({pct:.0f}% de tu flujo libre). Cómoda y "
                        f"sostenible para tu presupuesto.")
        ins_scenario = {
            "type": "seguro",
            "name": "Prima mensual",
            "term": 1,
            "installment": round(premium, 2),
            "down_payment": 0,
            "description": ins_desc,
        }
        temp_prod = product_data.copy()
        temp_prod["estimated_installment_monthly"] = premium
        temp_prod["down_payment"] = 0
        temp_prod["term_months"] = 1
        res = predict_recommendation_base(user_dict, temp_prod, artifacts, product_data)
        res["scenario_details"] = ins_scenario
        return [res]

    # 1. Escenario Contado — realistically evaluated
    # Calculate how many months user needs to save to afford it
    # Use declared savings capacity if available, otherwise estimate from FCF
    effective_savings_rate = savings_capacity if savings_capacity > 0 else max(fcf * 0.30, 0)
    months_to_save = price / max(effective_savings_rate, 1)
    
    # How much of their savings does this consume?
    liquidity_impact = price / max(liquid, 1)  # >1 means they can't afford it from savings
    
    # Emergency fund remaining after purchase
    emergency_after_purchase = (liquid - price) / max(essential, 1)
    
    # Build a realistic "virtual installment" for contado:
    # This represents the monthly saving effort needed. The ML model uses
    # installment to compute stress_ratio and dti_post — with 0 it thinks 
    # contado is free. Instead, we simulate the saving burden.
    if liquid >= price:
        # User has the cash — but still loses liquidity
        virtual_installment = 0  # No monthly burden since they already have the money
        
        if liquidity_impact > 0.85:
            contado_desc = (f"Puedes pagar al contado (RD${price:,.0f}), pero consumirías el {liquidity_impact*100:.0f}% "
                          f"de tus ahorros (RD${liquid:,.0f}). Te quedarían solo RD${liquid - price:,.0f} de reserva, "
                          f"equivalente a {emergency_after_purchase:.1f} meses de gastos esenciales. Es riesgoso descapitalizarte así.")
        elif liquidity_impact > 0.60:
            contado_desc = (f"Puedes pagar al contado. Te quedarían RD${liquid - price:,.0f} de reserva "
                          f"({emergency_after_purchase:.1f} meses de gastos esenciales). Viable, pero ajustado.")
        else:
            contado_desc = (f"Tienes liquidez suficiente (RD${liquid:,.0f}). Pagar al contado te ahorra intereses "
                          f"y te quedarían RD${liquid - price:,.0f} de reserva ({emergency_after_purchase:.1f} meses).")
    else:
        # User does NOT have the cash — needs to save
        virtual_installment = 0  # No aplicamos cuota irreal al ML para no dañar FCF/DTI
        
        # Adjust months_to_save by discipline: undisciplined people take longer
        discipline_factor = 1.0 / max(budget_adherence, 0.3)  # Lower adherence = longer time
        adjusted_months = months_to_save * discipline_factor
        
        if adjusted_months > 24:
            contado_desc = (f"No es realista pagar al contado. Necesitarías ahorrar RD${effective_savings_rate:,.0f}/mes "
                          f"durante {adjusted_months:.0f} meses ({adjusted_months/12:.1f} años). "
                          f"Con tu nivel de disciplina financiera, el financiamiento es una mejor opción.")
        elif adjusted_months > 6:
            contado_desc = (f"Pagar al contado requeriría ahorrar RD${effective_savings_rate:,.0f}/mes "
                          f"durante ~{adjusted_months:.0f} meses. Es un compromiso largo que requiere disciplina constante.")
        else:
            contado_desc = (f"Podrías juntar el monto en ~{adjusted_months:.0f} meses ahorrando RD${effective_savings_rate:,.0f}/mes. "
                          f"Es factible si mantienes la disciplina.")
    
    scenarios.append({
        "type": "contado",
        "name": "Pago al contado",
        "term": 0,
        "installment": round(virtual_installment, 2),
        "down_payment": price,
        "description": contado_desc,
        "months_to_save": round(months_to_save, 1),
        "liquidity_impact": round(liquidity_impact, 2),
        "emergency_after": round(emergency_after_purchase, 1),
        "budget_adherence": budget_adherence
    })
    
    # 2. Escenarios de financiamiento — varios plazos DISTINTOS para comparar,
    #    cada uno con su cuota real (amortizada) e intereses totales. Antes solo
    #    se generaban 2 y podían quedar duplicados (ambos a 60 meses).
    financed = max(price - down_payment, 0)
    opt_term = find_optimal_term(user_dict, price, down_payment, rate, category)

    if category == "home":
        candidate_terms = [120, 180, 240, 360]
    elif category == "vehicle":
        candidate_terms = [24, 36, 48, 60, 72]
    elif category == "loan":
        candidate_terms = [12, 24, 36, 48, 60]
    else:
        candidate_terms = [6, 12, 18, 24, 36]

    # Mostrar un RANGO real (más corto, intermedio, óptimo y más largo) para que
    # el usuario compare "cuota alta/menos interés" vs "cuota baja/más interés".
    mid = candidate_terms[len(candidate_terms) // 2]
    key_terms = {candidate_terms[0], mid, candidate_terms[-1]}
    if opt_term:
        key_terms.add(opt_term)
    terms = sorted(t for t in key_terms if t and t > 0)[:4]

    for term in terms:
        installment = monthly_payment(financed, rate, term)
        if installment <= 0:
            continue
        pct = (installment / max(fcf, 1)) * 100
        total_interest = max(installment * term + down_payment - price, 0)
        is_opt = (term == opt_term)
        if is_opt:
            note = "Plazo equilibrado: cuota manejable sin comprometer más del 35% de tu capacidad."
        elif term == terms[0]:
            note = "Plazo corto: cuota más alta, pero pagas menos intereses."
        elif term == terms[-1]:
            note = "Plazo largo: la cuota más baja, pero pagas más intereses en total."
        else:
            note = "Opción intermedia entre cuota y costo total."
        scenarios.append({
            "type": f"fin_{term}",
            "name": f"Financiamiento a {term} meses",
            "term": term,
            "installment": installment,
            "down_payment": down_payment,
            "total_interest": round(total_interest, 2),
            "description": (f"Cuota de RD${installment:,.0f}/mes ({pct:.0f}% de tu flujo libre). "
                            f"{note} Intereses totales ~RD${total_interest:,.0f}."),
        })

    # ── Evaluate each scenario through the prediction engine ────
    results = []
    for sc in scenarios:
        temp_prod = product_data.copy()
        temp_prod["estimated_installment_monthly"] = sc["installment"]
        temp_prod["down_payment"] = sc["down_payment"]
        temp_prod["term_months"] = sc["term"]

        res = predict_recommendation_base(user_dict, temp_prod, artifacts, product_data)
        if sc.get("type") == "contado":
            # El contado se evalúa con cuota 0 (score inflado). Penalizamos el
            # costo de oportunidad/realismo para que no gane SIEMPRE.
            pen = compute_contado_penalty(
                liquid, price, savings_capacity, fcf, budget_adherence,
                sc.get("liquidity_impact", price / max(liquid, 1)),
                sc.get("emergency_after", 0),
            )
            res["recommendation_score"] = max(round(res["recommendation_score"] - pen, 4), 0.05)
        else:
            # Penalizar el INTERÉS TOTAL: a mayor interés (plazos largos), peor.
            # Así el "mejor" no es siempre el plazo más largo y el contado (sin
            # interés) queda competitivo. Trade-off real cuota ↔ costo total.
            interest_ratio = sc.get("total_interest", 0) / max(price, 1)
            res["recommendation_score"] = max(round(res["recommendation_score"] - interest_ratio * 0.55, 4), 0.05)
        res["scenario_details"] = sc
        results.append(res)

    return results

def predict_recommendation_base(user_dict: dict, option_dict: dict, artifacts: dict, original_product: dict = None) -> dict:
    """Función base de predicción para un solo escenario. Now passes segment and product data through."""
    # 1. Normalizar categoría
    option_dict["product_category"] = normalize_category(option_dict.get("product_category"))
    
    # 2. Unir y calcular features
    combined = {**user_dict, **option_dict}
    df_engineered = add_engineered_features(pd.DataFrame([combined]))
    engineered_record = df_engineered.iloc[0].to_dict()
    
    # 3. Predicción de viabilidad. El segmento persistido se recibe desde la
    # tabla SegmentosFinancierosUsuario; no se recalcula para cada producto.
    viab_preds, viab_probs = predict_viability(df_engineered[CLASSIFIER_NUMERIC_FEATURES + CLASSIFIER_CATEGORICAL_FEATURES], artifacts["classifier_artifacts"])
    
    category = normalize_category(option_dict.get("product_category", "technology"))
    
    risk_band = risk_band_from_row(engineered_record)
    reason = primary_reason_from_row(engineered_record)
    score = compute_recommendation_score(viab_probs[0], engineered_record, category)
    
    segment_name = user_dict.get("persisted_segment_name", "")
    prod_for_explanation = original_product or option_dict
    
    details, action_plan = build_explanation_details(engineered_record, segment_name, prod_for_explanation)
    
    return {
        "viability_probability": round(viab_probs[0], 4),
        "viable": bool(viable_from_risk_band(risk_band)),
        "risk_band": risk_band,
        "risk_band_name": RISK_BAND_NAMES[risk_band],
        "primary_reason": reason,
        "recommendation_score": score,
        "segment_name": segment_name,
        "explanation": build_explanation(risk_band, reason, engineered_record, segment_name, prod_for_explanation),
        "explanation_details": details,
        "action_plan": action_plan,
        "metrics": {
            "dti_current": round(engineered_record.get("dti_current", 0), 4),
            "dti_post": round(engineered_record["dti_post"], 4),
            "stress_ratio": round(engineered_record["stress_ratio"], 4),
            "fcf_current": round(engineered_record.get("free_cash_flow_current", 0), 2),
            "fcf_post": round(engineered_record["free_cash_flow_post"], 2),
            "installment": round(engineered_record.get("estimated_installment_monthly", 0), 2),
            "emergency_months": round(engineered_record.get("emergency_months", 0), 1)
        }
    }

def predict_recommendation(user_dict: dict, option_dict: dict, artifacts: dict) -> dict:
    """
    Predicción principal. Genuinely analyzes the user's chosen payment method 
    against their real financial situation and segment.
    """
    chosen_method = option_dict.get("payment_method", "cuotas")
    payment_type = option_dict.get("payment_type", "Financiado")
    user_term = _int(option_dict.get("term_months", 12), 12)
    price = _num(option_dict.get("price", 0))
    
    # ── Calculate user's real free cash flow BEFORE the purchase ────
    fcf_current = (
        user_dict.get("monthly_income_avg", 0)
        - user_dict.get("fixed_expenses_monthly", 0)
        - user_dict.get("variable_expenses_monthly_avg", 0)
        - user_dict.get("current_debt_payment_monthly", 0)
    )
    user_dict["free_cash_flow_current"] = round(fcf_current, 2)
    income = user_dict.get("monthly_income_avg", 1)
    liquid = user_dict.get("liquid_savings", 0)
    budget_adherence = user_dict.get("budget_adherence_score", 0.65)
    savings_capacity = user_dict.get("monthly_savings_capacity", 0)
    
    # ── Generate all possible scenarios ────────────────────────
    all_scenarios = generate_scenarios(user_dict, option_dict, artifacts)
    
    # ── Find the best scenario by score ────────────────────────
    best_overall = max(all_scenarios, key=lambda x: x["recommendation_score"])

    category = normalize_category(option_dict.get("product_category", "technology"))
    is_insurance = category == "insurance"
    # Déficit real: el usuario ya gasta igual o más de lo que ingresa.
    in_deficit = fcf_current <= 0
    deficit_amount = abs(fcf_current)

    # Seguro: el flujo no contempla "contado", siempre es prima mensual.
    if is_insurance:
        chosen_method = "cuotas"

    def _pct_phrase(pct: float) -> str:
        """Evita mostrar porcentajes absurdos (p. ej. 5857%) cuando la cuota
        supera con creces el flujo libre; usa fraseo cualitativo."""
        if pct > 100:
            veces = pct / 100.0
            if veces >= 2:
                return f"más de {veces:.0f} veces tu flujo libre disponible"
            return "más del 100% de tu flujo libre disponible"
        return f"el {pct:.0f}% de tu flujo libre"

    # ── Analyze what the USER specifically chose ───────────────
    if chosen_method == "contado":
        # El escenario contado ya viene con la penalización de realismo aplicada
        # en generate_scenarios (tiempo de ahorro, descapitalización, disciplina),
        # por lo que su score ya es coherente y comparable con los demás.
        user_choice = next((s for s in all_scenarios if s["scenario_details"]["type"] == "contado"), all_scenarios[0])

    else:
        # Build the user's specific scenario.
        # La cuota se calcula con la tasa REAL del producto (sistema francés),
        # no precio/plazo: ignorar el interés subestimaba la carga del usuario.
        user_down = _num(option_dict.get("down_payment", 0))
        user_rate_choice = _num(option_dict.get("interest_rate", 0))
        financed_choice = max(price - user_down, 0)
        if is_insurance:
            user_installment = price  # la "prima" mensual es el precio declarado
        elif user_rate_choice > 0:
            user_installment = monthly_payment(financed_choice, user_rate_choice, user_term)
        else:
            user_installment = financed_choice / max(user_term, 1)
        temp_prod = option_dict.copy()
        temp_prod["estimated_installment_monthly"] = user_installment
        temp_prod["down_payment"] = user_down
        temp_prod["term_months"] = user_term

        user_choice = predict_recommendation_base(user_dict, temp_prod, artifacts, option_dict)
        if is_insurance:
            sc_name = "Prima mensual"
            if in_deficit:
                sc_desc = (f"Prima de RD${user_installment:,.0f}/mes. Tu presupuesto ya está en déficit, "
                           f"por lo que asumir esta prima fija no es sostenible ahora.")
            else:
                user_pct = (user_installment / fcf_current) * 100
                sc_desc = f"Prima de RD${user_installment:,.0f}/mes, equivalente a {_pct_phrase(user_pct)} actual."
        else:
            sc_name = f"Tu elección: {payment_type} a {user_term} meses"
            if in_deficit:
                sc_desc = (f"Tu plan: cuota de RD${user_installment:,.0f}/mes. Hoy gastas RD${deficit_amount:,.0f} más "
                           f"de lo que ingresas, así que esta cuota agravaría tu déficit.")
            else:
                user_pct = (user_installment / fcf_current) * 100
                sc_desc = (f"Tu plan: cuota de RD${user_installment:,.0f}/mes, que representaría "
                           f"{_pct_phrase(user_pct)} actual.")
        user_choice["scenario_details"] = {
            "type": "usuario",
            "name": sc_name,
            "term": user_term,
            "installment": round(user_installment, 2),
            "down_payment": 0,
            "description": sc_desc,
        }

    # ── Ajuste por PROPÓSITO de la compra ──────────────────────────
    # El mismo producto puede ser viable como herramienta de trabajo y NO
    # serlo como puro entretenimiento (un lujo que tensiona el presupuesto).
    segment_name = user_choice.get("segment_name", "")
    user_score = user_choice["recommendation_score"]
    purpose_class = classify_purpose(option_dict.get("purpose"))
    _m = user_choice.get("metrics", {})
    _fcf_post = _m.get("fcf_post", 0)
    _em = _m.get("emergency_months", 0)
    _stress = _m.get("stress_ratio", 0)
    purpose_note = ""
    if not in_deficit and not is_insurance:
        if purpose_class == "ocio":
            strained = (_em < 1) or (_fcf_post < income * 0.15) or (_stress > 0.45)
            tight = (_em < 3) or (_fcf_post < income * 0.25)
            if strained:
                user_score = max(user_score - 0.18, 0.05)
                purpose_note = ("Además, es una compra de entretenimiento (un gusto, no una necesidad): "
                                "comprometer tu margen o tu fondo de emergencia por un lujo no es prudente. "
                                "Si fuera una herramienta de trabajo, la decisión sería más justificable.")
            elif tight:
                user_score = max(user_score - 0.08, 0.05)
                purpose_note = ("Recuerda que es un gasto de entretenimiento: asegúrate de que no te reste "
                                "capacidad para metas más importantes.")
        elif purpose_class == "esencial":
            # Un bien esencial / de trabajo justifica algo más de esfuerzo.
            user_score = min(user_score + 0.06, 1.0)
            purpose_note = "Al ser una necesidad o herramienta para tu día a día, la inversión se justifica mejor que un gasto discrecional."

    # ── Vida útil vs plazo de financiamiento ───────────────────────
    lifespan_warning = ""
    _life_m = lifespan_to_months(option_dict.get("lifespan"))
    if chosen_method != "contado" and not is_insurance and _life_m and user_term > _life_m:
        lifespan_warning = (f"Ojo: planeas financiarlo a {user_term} meses, pero su vida útil es de ~{_life_m // 12} años. "
                            f"Estarías pagando por algo que podría quedar obsoleto antes de terminar de pagarlo; "
                            f"acorta el plazo o elige una opción más duradera.")

    user_score = round(user_score, 4)
    user_choice["recommendation_score"] = user_score
    user_choice["purpose_class"] = purpose_class

    # ── Unificar banda de riesgo y viabilidad con el score final ──
    # Coherencia total entre el % mostrado, el veredicto de viabilidad
    # y el texto de la sugerencia, para TODOS los métodos de pago.
    final_band = band_from_score(user_score)
    user_choice["risk_band"] = final_band
    user_choice["risk_band_name"] = RISK_BAND_NAMES[final_band]
    user_choice["viable"] = viable_from_risk_band(final_band)
    best_score = best_overall["recommendation_score"]
    
    # ── Build a GENUINE suggestion_text ────────────────────────
    suggestion_parts = []
    
    # 1. Evaluate the user's chosen method
    if chosen_method == "contado":
        effective_savings = savings_capacity if savings_capacity > 0 else max(fcf_current * 0.30, 0)

        if liquid >= price * 1.5:
            if user_score < 0.5:
                # Tiene liquidez de sobra, pero su perfil general es delicado:
                # el contado es preferible a financiar para no sumar deuda nueva.
                suggestion_parts.append(f"Dado tu nivel de endeudamiento, pagar al contado es preferible a financiar, porque evitas sumar una nueva deuda. Tienes RD${liquid:,.0f} en ahorros frente a un precio de RD${price:,.0f}, así que conservarías reserva.")
            else:
                suggestion_parts.append(f"Pagar al contado es una buena opción en tu caso: tienes RD${liquid:,.0f} en ahorros y el producto cuesta RD${price:,.0f}, por lo que te quedaría una reserva sólida.")
        elif liquid >= price:
            remaining = liquid - price
            essential_exp = user_dict.get("essential_expenses_monthly", 5000)
            months_covered = remaining / max(essential_exp, 1)

            if months_covered < 2:
                suggestion_parts.append(f"Puedes pagar al contado, pero te quedarían solo RD${remaining:,.0f} de reserva ({months_covered:.1f} meses de gastos esenciales). Esto es arriesgado — cualquier imprevisto te dejaría sin respaldo. Considera financiar al menos una parte.")
            else:
                suggestion_parts.append(f"Puedes pagar al contado. Te quedarían RD${remaining:,.0f} de reserva ({months_covered:.1f} meses de gastos esenciales). Viable si no esperas imprevistos grandes.")
        elif in_deficit or effective_savings <= 0:
            # No hay flujo libre para ahorrar: pagar al contado no es factible
            suggestion_parts.append(f"No es viable pagar al contado: tus ahorros (RD${liquid:,.0f}) no cubren el precio (RD${price:,.0f}) y actualmente no te queda flujo libre para ahorrar. Primero necesitas equilibrar tu presupuesto reduciendo gastos o aumentando ingresos.")
        else:
            # User doesn't have enough savings but has some saving capacity
            months_needed = (price / effective_savings) * (1.0 / max(budget_adherence, 0.3))

            if months_needed > 60:
                suggestion_parts.append(f"Pagar al contado no es realista: con tu capacidad de ahorro actual (RD${effective_savings:,.0f}/mes) tardarías más de 5 años en juntar el monto. El financiamiento es una opción mucho más práctica.")
            elif budget_adherence < 0.5:
                suggestion_parts.append(f"No es recomendable pagar al contado. Tus ahorros (RD${liquid:,.0f}) no cubren el precio (RD${price:,.0f}), y por tu perfil de control de gastos necesitarías ~{months_needed:.0f} meses ahorrando RD${effective_savings:,.0f}/mes. El financiamiento en cuotas fijas te da más estructura y disciplina.")
            elif months_needed > 12:
                suggestion_parts.append(f"No cuentas con liquidez suficiente para pagar al contado. Necesitarías ~{months_needed:.0f} meses ({months_needed/12:.1f} años) ahorrando RD${effective_savings:,.0f}/mes. Financiar sería mucho más práctico.")
            else:
                suggestion_parts.append(f"Tus ahorros actuales (RD${liquid:,.0f}) no cubren el precio (RD${price:,.0f}). Necesitarías ~{months_needed:.0f} meses ahorrando. Es factible si mantienes disciplina, pero financiar podría ser más cómodo.")
    else:
        user_installment = user_choice["scenario_details"].get("installment", 0)

        if in_deficit:
            if is_insurance:
                suggestion_parts.append(f"La prima mensual de RD${user_installment:,.0f} no es sostenible: hoy gastas RD${deficit_amount:,.0f} más de lo que ingresas cada mes. Primero equilibra tu presupuesto.")
            else:
                suggestion_parts.append(f"Esta cuota de RD${user_installment:,.0f}/mes no es viable: tu presupuesto ya está en déficit de RD${deficit_amount:,.0f}/mes (gastas más de lo que ingresas). Antes de cualquier compra necesitas equilibrar tus finanzas.")
        else:
            user_pct = (user_installment / fcf_current) * 100
            concepto = "La prima mensual" if is_insurance else f"La cuota de RD${user_installment:,.0f}/mes a {user_term} meses"
            monto = f"de RD${user_installment:,.0f} " if is_insurance else ""
            # El tono lo decide el SCORE final, no solo el % de la cuota, para
            # que el mensaje sea coherente con el veredicto de viabilidad.
            if user_score < 0.45 or user_pct > 60:
                suggestion_parts.append(f"{concepto} {monto}consumiría {_pct_phrase(user_pct)} (RD${fcf_current:,.0f}). Es una carga demasiado alta para tu presupuesto.".replace("  ", " "))
            elif user_score < 0.65 or user_pct > 35:
                suggestion_parts.append(f"{concepto} {monto}representa {_pct_phrase(user_pct)}. Es ajustado; procede con cautela y cuida tus gastos variables.".replace("  ", " "))
            else:
                suggestion_parts.append(f"{concepto} {monto}es cómoda para tu presupuesto ({user_pct:.0f}% de tu flujo libre).".replace("  ", " "))

    # 2. Compare with the best option if different
    if user_score < best_score - 0.08:
        best_sc = best_overall["scenario_details"]
        if best_sc["type"] == "contado":
            # Only recommend contado if it's genuinely good
            contado_sc = best_sc
            if contado_sc.get("liquidity_impact", 1) < 0.6:
                suggestion_parts.append(f"Sin embargo, la mejor opción para ti sería pagar al contado para evitar intereses.")
            # Don't recommend contado if liquidity impact is high
        elif best_sc.get("installment", 0) > 0:
            best_inst = best_sc.get("installment", 0)
            suggestion_parts.append(f"Te recomendamos considerar {best_sc['name']} (cuota de RD${best_inst:,.0f}/mes) que se adapta mejor a tu perfil financiero.")
    elif user_score >= 0.65:
        suggestion_parts.append("Tu elección se alinea bien con tu capacidad financiera.")
    
    # 3. Segment context (only if score is not excellent)
    if user_score < 0.65:
        if "sobreendeudado" in segment_name.lower():
            suggestion_parts.append("Tu perfil financiero muestra sobreendeudamiento. Prioriza reducir deudas antes de nuevos compromisos.")
        elif "ajustado" in segment_name.lower():
            suggestion_parts.append("Tu presupuesto es ajustado. Procede solo si la compra es una necesidad.")
    
    # 4. Discipline warning for users with low budget adherence (solo en la
    #    zona "viable con ajustes": si no es viable ya se le dijo lo importante)
    if budget_adherence < 0.5 and chosen_method != "contado" and not is_insurance and 0.45 <= user_score < 0.65:
        suggestion_parts.append("Tu perfil indica que podrías beneficiarte de cuotas fijas automáticas en lugar de depender del ahorro voluntario.")

    # 5. Contexto de propósito (necesidad vs lujo) y vida útil vs plazo
    if purpose_note:
        suggestion_parts.append(purpose_note)
    if lifespan_warning:
        suggestion_parts.append(lifespan_warning)

    suggestion_text = " ".join(suggestion_parts)

    # ── Alternatives ───────────────────────────────────────────
    alternatives = generate_alternatives(user_dict, option_dict)

    result = {
        "chosen_analysis": user_choice,
        "best_option": best_overall,
        "all_scenarios": all_scenarios,
        "alternatives": alternatives,
        "is_optimal": user_score >= best_score - 0.05,
        "suggestion_text": suggestion_text,
        "segment_name": segment_name
    }

    # ── Comparación de tasa contra el mercado dominicano ───────────
    # Para productos financiados con tasa de interés (préstamo, vehículo,
    # hipoteca): detecta si el usuario paga de más y propone entidades RD
    # con tasas referenciales más bajas, calculando el ahorro real.
    rate_category = {"loan": "loan", "vehicle": "vehicle", "home": "home"}.get(category)
    user_rate = _num(option_dict.get("interest_rate", 0))
    if rate_category and chosen_method != "contado" and user_rate > 0:
        down = _num(option_dict.get("down_payment", 0))
        financed = max(price - down, 0) or price
        rate_term = user_term if user_term and user_term > 1 else 36
        rate_analysis = dr_market.compare_loan_rate(rate_category, user_rate, financed, rate_term)
        if rate_analysis:
            result["rate_analysis"] = rate_analysis
            # Si la tasa está alta, reforzamos el texto de sugerencia con el dato.
            if rate_analysis["verdict"] == "alta" and rate_analysis["potential_monthly_savings"] > 0:
                result["suggestion_text"] += (
                    f" Tu tasa de {rate_analysis['user_rate_pct']:.0f}% está por encima del mercado dominicano "
                    f"(típica ~{rate_analysis['market_typical_pct']:.0f}%). Negociando o cambiando de entidad podrías "
                    f"bajar la cuota hasta ~RD${rate_analysis['best_reference_installment']:,.0f}/mes y ahorrar cerca de "
                    f"RD${rate_analysis['potential_total_savings']:,.0f} en intereses durante el plazo."
                )

    # Mostrar productos similares y alternativas de otra categoría cuando la
    # compra NO es viable. Se usa el mismo veredicto de viabilidad para que
    # nunca aparezcan alternativas "de rescate" en una compra aprobada.
    if not user_choice["viable"]:
        result["similar_products"] = generate_similar_products_fallback(user_dict, option_dict)
        result["viable_alternatives"] = generate_viable_alternatives_fallback(option_dict, user_dict)

    return result


def generate_alternatives(user_dict: dict, product_data: dict) -> List[dict]:
    """Genera alternativas basadas en lo que el usuario realmente puede pagar."""
    price = _num(product_data.get("price", 50000))
    product_name = product_data.get("name", "Producto")
    
    fcf = (
        user_dict.get("monthly_income_avg", 0)
        - user_dict.get("fixed_expenses_monthly", 0)
        - user_dict.get("variable_expenses_monthly_avg", 0)
        - user_dict.get("current_debt_payment_monthly", 0)
    )
    
    category = normalize_category(product_data.get("product_category", "technology"))

    # ── Caso especial: PRÉSTAMO → opciones de financiamiento reales en RD ──
    # No tiene sentido un "préstamo premium": lo valioso es comparar entidades
    # y tasas. Mostramos instituciones dominicanas con tasa referencial más baja.
    if category == "loan":
        user_rate = _num(product_data.get("interest_rate", 0))
        term = _int(product_data.get("term_months", 36), 36) or 36
        financed = max(price - _num(product_data.get("down_payment", 0)), 0) or price
        alts = []
        providers = dr_market.LOAN_PROVIDERS.get("loan", [])
        # Si el usuario tiene tasa, priorizar las entidades más baratas que la suya
        ranked = sorted(providers, key=lambda p: (p["rate"][0] + p["rate"][1]) / 2)
        for p in ranked[:3]:
            lo, hi = p["rate"]
            est = monthly_payment(financed, (lo + hi) / 2, term)
            saving = ""
            if user_rate > 0:
                user_inst = monthly_payment(financed, user_rate, term)
                if user_inst - est > 50:
                    saving = f" Ahorrarías ~RD${(user_inst - est) * term:,.0f} en el plazo frente a tu tasa de {user_rate*100:.0f}%."
            alts.append({
                "name": f"{p['name']} ({p['type']})",
                "price": f"Tasa ref. {lo*100:.0f}%–{hi*100:.0f}% anual",
                "desc": f"Cuota estimada ~RD${est:,.0f}/mes a {term} meses. {p['note']}{saving}",
                "payment": f"Financiamiento a {term} meses",
            })
        return alts

    # ── Caso especial: SEGURO → niveles de prima mensual, no financiamiento ──
    if category == "insurance":
        return [
            {
                "name": "Cobertura Básica",
                "price": f"RD${price * 0.60:,.0f}/mes aprox",
                "desc": "Cubre lo esencial con una prima más baja. Ideal si el presupuesto es ajustado.",
                "payment": "Pago mensual continuo",
            },
            {
                "name": "Cobertura Intermedia (Mejor Valor)",
                "price": f"RD${price:,.0f}/mes aprox",
                "desc": "Balance entre cobertura y costo, con deducibles razonables.",
                "payment": "Pago mensual continuo",
            },
            {
                "name": "Cobertura Amplia / Premium",
                "price": f"RD${price * 1.40:,.0f}/mes aprox",
                "desc": "Mayor cobertura y menores deducibles, con una prima mensual más alta.",
                "payment": "Pago mensual continuo",
            },
        ]

    # Calculate what the user can actually afford at 30% of FCF over 12 months
    max_affordable_price = max(fcf * 0.30, 0) * 12
    # eco_price siempre positivo y por debajo del precio original; si la
    # capacidad es muy baja igual mostramos una opción claramente más barata.
    if max_affordable_price >= price * 0.40:
        eco_price = min(price * 0.60, max_affordable_price)
    else:
        eco_price = price * 0.50
    eco_price = max(eco_price, price * 0.30)
    smart_price = price * 0.80
    premium_price = price * 1.20

    if category == "home":
        eco_term = 240
        smart_term = 360
    elif category == "vehicle":
        eco_term = 60
        smart_term = 72
    else:
        eco_term = 12
        smart_term = 18
    
    eco_installment = monthly_payment(eco_price, 0.15, eco_term)
    smart_installment = monthly_payment(smart_price, 0.15, smart_term)
    prem_term = find_optimal_term(user_dict, premium_price, premium_price * 0.2, 0.18, category)

    # Use generic distinct names for alternatives rather than just suffixing
    eco_name = "Opción de Entrada / Económica"
    smart_name = "Opción Intermedia (Mejor Valor)"
    prem_name = "Opción Premium / Profesional"
    
    if category == "laptop":
        eco_name = "Laptop Básica (ej. HP Stream, Acer Aspire 3)"
        smart_name = "Laptop Intermedia (ej. MacBook Air, Dell XPS 13)"
        prem_name = "Estación de Trabajo (ej. MacBook Pro M-Max, ThinkPad P)"
    elif category == "vehicle":
        eco_name = "Vehículo Usado Compacto"
        smart_name = "Vehículo Seminuevo Eficiente"
        prem_name = "Vehículo Nuevo SUV / Sedán"
    elif category == "home":
        eco_name = "Apartamento Pequeño / Periferia"
        smart_name = "Vivienda Estándar"
        prem_name = "Residencia Premium"
    elif category == "smartphone" or category == "technology":
        eco_name = "Dispositivo de Gama de Entrada"
        smart_name = "Dispositivo de Gama Media-Alta"
        prem_name = "Dispositivo de Gama Premium (Pro/Ultra)"
    
    alternatives = [
        {
            "name": f"{eco_name} vs {product_name}",
            "price": f"RD${eco_price:,.0f} aprox",
            "desc": f"Cuota de RD${eco_installment:,.0f}/mes a {eco_term} meses. Cumple lo básico.",
            "payment": f"Financiamiento a {eco_term} meses"
        },
        {
            "name": f"{smart_name}",
            "price": f"RD${smart_price:,.0f} aprox",
            "desc": f"Cuota de RD${smart_installment:,.0f}/mes a {smart_term} meses. Mejor balance entre calidad y asequibilidad.",
            "payment": f"Financiamiento a {smart_term} meses"
        },
        {
            "name": f"{prem_name} superior a {product_name}",
            "price": f"RD${premium_price:,.0f} aprox",
            "desc": f"Mayor durabilidad y rendimiento, pero la cuota mensual será más alta. Plazo sugerido: {prem_term} meses.",
            "payment": f"Financiamiento a {prem_term} meses"
        }
    ]
    
    return alternatives

def generate_similar_products_fallback(user_dict: dict, product_data: dict) -> List[dict]:
    """
    Genera productos similares accesibles cuando la compra no es viable.
    Precios reales en USD de fuentes oficiales (Amazon, Best Buy, fabricantes).
    """
    category = normalize_category(product_data.get("product_category", "technology"))
    purpose = product_data.get("purpose", "uso general")

    fcf = max(
        user_dict.get("monthly_income_avg", 0)
        - user_dict.get("fixed_expenses_monthly", 0)
        - user_dict.get("variable_expenses_monthly_avg", 0)
        - user_dict.get("current_debt_payment_monthly", 0),
        1
    )
    max_monthly_usd = (fcf * 0.30) / 60  # approx DOP to USD at ~60 DOP/USD

    # Real prices (USD) from official sources — Amazon, Best Buy, brand sites
    # Sources: amazon.com, bestbuy.com, samsung.com, lenovo.com, hp.com, motorola.com, xiaomi.com
    CATEGORY_EXAMPLES = {
        "laptop": [
            # lenovo.com / amazon.com — Lenovo IdeaPad 1i ~$249
            ("Lenovo IdeaPad 1i (15.6\")", 249,
             "Intel N100, 8GB RAM, 256GB SSD. Perfecta para navegar, documentos y videollamadas.",
             "lenovo.com / amazon.com"),
            # hp.com / bestbuy.com — HP 15-fd0083wm ~$329
            ("HP Laptop 15 (15.6\")", 329,
             "Intel Core i3-1315U, 8GB RAM, 256GB SSD. Ligera y eficiente para productividad diaria.",
             "hp.com / bestbuy.com"),
            # amazon.com — Acer Aspire 3 ~$399
            ("Acer Aspire 3 (15.6\")", 399,
             "AMD Ryzen 5 7520U, 8GB RAM, 512GB SSD. Excelente balance rendimiento-precio.",
             "amazon.com / acer.com"),
        ],
        "technology": [
            # samsung.com / bestbuy.com — Galaxy A16 ~$199
            ("Samsung Galaxy A16 5G", 199,
             "6.7\" Super AMOLED, 4GB RAM, 128GB, batería 5000mAh. Sólido para uso diario.",
             "samsung.com / bestbuy.com"),
            # motorola.com — Moto G Power 5G (2024) ~$249
            ("Motorola Moto G Power 5G (2024)", 249,
             "6.7\" FHD+, 8GB RAM, 256GB, batería 6000mAh con carga rápida.",
             "motorola.com / amazon.com"),
            # amazon.com — Xiaomi Redmi Note 13 ~$299
            ("Xiaomi Redmi Note 13 Pro 4G", 299,
             "6.67\" AMOLED 120Hz, 8GB RAM, 256GB, cámara 200MP. Excelente relación calidad-precio.",
             "amazon.com / mi.com"),
        ],
        "vehicle": [
            # Precios de mercado RD/Latam — motocicletas nuevas en dealers
            ("Honda CB125F 2024", 1_890,
             "Motor 125cc, consumo ~2.2L/100km, ideal para ciudad. Garantía oficial Honda.",
             "hondamotors.com / dealer Honda RD"),
            ("Yamaha YBR 125 2024", 2_100,
             "Motor 125cc SOHC, frenos de disco, cómoda para trayectos urbanos y carretera.",
             "yamaha-motor.com / dealer Yamaha RD"),
            ("Kia Picanto Usado 2019", 8_500,
             "1.0L, 5 puertas, A/C, bajo consumo de combustible. Ideal para uso urbano diario.",
             "carroya.com / clasificados RD"),
        ],
        "home": [
            # bestbuy.com / homedepot.com
            ("LG Refrigerator 20 cu ft (LRFCS2503S)", 798,
             "French door, 20 pies cúbicos, No Frost, eficiencia energética A+.",
             "lg.com / bestbuy.com"),
            ("Samsung Washing Machine WA40A3005AW", 499,
             "Lavadora 4.0 cu ft, carga superior, 700 RPM. Bajo consumo de agua y energía.",
             "samsung.com / bestbuy.com"),
            ("LG Dual Inverter A/C 12,000 BTU", 499,
             "Split aire acondicionado 12,000 BTU, Inverter, eficiencia Energy Star.",
             "lg.com / homedepot.com"),
        ],
        "insurance": [
            ("Seguro de Vida Término 20 años", 25,  # per month USD
             "Cobertura $100,000 USD. Prima fija mensual para adulto saludable de 30 años.",
             "policygenius.com / ARS local"),
            ("Seguro Médico Plan Básico ARS", 45,
             "Cobertura ambulatoria y hospitalaria básica. Consultas, emergencias y laboratorios.",
             "ARS locales República Dominicana"),
            ("Seguro de Accidentes Personales", 15,
             "Cobertura por invalidez y accidentes. Prima mensual muy accesible.",
             "seguros locales RD"),
        ],
        "loan": [
            ("Préstamo Cooperativa (monto moderado)", 2_000,
             "Tasa ~18% anual vs ~28% banco. Cuotas flexibles, menos requisitos documentales.",
             "cooperativas RD"),
            ("Préstamo Personal Banco (monto reducido)", 1_500,
             "Monto ajustado a tu capacidad. Plazo 12-24 meses para mantener cuota manejable.",
             "banco local RD"),
            ("Línea de Crédito Revolvente", 1_000,
             "Acceso a fondos cuando necesites. Pagas solo lo que usas.",
             "entidad financiera local"),
        ],
        "travel": [
            ("Paquete Playa Bávaro todo incluido (3 noches)", 180,
             "Hotel 4★, comidas incluidas, traslado desde Santo Domingo. Temporada baja.",
             "trivago.com / despegar.com"),
            ("Vuelo + Hotel Punta Cana (4 noches)", 350,
             "Vuelo doméstico + hotel 3★. Mejor precio reservando con 30 días de anticipación.",
             "despegar.com / booking.com"),
            ("Crucero Caribe Royal Caribbean (3 noches)", 499,
             "Desde Miami, incluye alimentos a bordo, entretenimiento y paradas en islas.",
             "royalcaribbean.com"),
        ],
    }

    examples = CATEGORY_EXAMPLES.get(category, CATEGORY_EXAMPLES["technology"])
    result = []
    for item in examples:
        name, price_usd, desc, source = item
        monthly_usd = price_usd / 12
        result.append({
            "name": name,
            "price": f"${price_usd:,} USD",
            "desc": desc,
            "why_fits": (
                f"Precio ~${price_usd:,} USD (aprox. ~RD${price_usd * 60:,.0f}). "
                f"Cuota estimada ~${monthly_usd:.0f} USD/mes a 12 meses. "
                f"Fuente de referencia: {source}."
            )
        })
    return result


def generate_viable_alternatives_fallback(product_data: dict, user_dict: dict) -> List[dict]:
    """
    Genera alternativas de OTRA categoría que cumplen el mismo propósito.
    Precios reales en USD de fuentes oficiales.
    """
    category = normalize_category(product_data.get("product_category", "technology"))
    purpose = product_data.get("purpose", "uso general")

    # Real cross-category alternatives with fixed USD prices
    # Sources: amazon.com, samsung.com, lenovo.com, bestbuy.com, royalcaribbean.com, etc.
    CROSS_CATEGORY = {
        "laptop": [
            # samsung.com / amazon.com — Galaxy Tab S6 Lite + keyboard ~$299 bundle
            ("Samsung Galaxy Tab S6 Lite + Teclado S Pen", "Tablet", 299,
             "Pantalla 10.4\" TFT, 4GB RAM, 128GB, S Pen incluido. Compatible con apps de oficina y estudio.",
             f"Para {purpose}, esta tablet cubre el 80% de las tareas a menos de la mitad del precio. Samsung.com ~$299 USD."),
            # bestbuy.com — Acer Chromebook Spin 314 ~$299
            ("Acer Chromebook 314 (2024)", "Chromebook", 299,
             "Intel N100, 4GB RAM, 64GB eMMC, 14\" pantalla. Google Workspace completo, 10h batería.",
             f"Ideal para {purpose} con acceso a internet. Precio bestbuy.com ~$299 USD, 40% menos que una laptop Windows."),
        ],
        "vehicle": [
            # Honda PCX 160 — precio dealer oficial LATAM ~$3,200
            ("Honda PCX 160 2024", "Scooter", 3_200,
             "Motor 160cc, ABS, llanta tubeless, compartimiento bajo asiento. Consumo ~3L/100km.",
             f"Para {purpose} en ciudad, la PCX 160 cuesta 70-80% menos que un carro y con menos gastos fijos (seguro, mantenimiento)."),
            # amazon.com — bicicleta eléctrica Himiway ~$899
            ("Himiway Escape Bicicleta Eléctrica", "E-Bike", 899,
             "Motor 500W, batería 48V 14Ah, autonomía 60km. Sin placa ni seguro requerido.",
             f"Si {purpose} es en área urbana, una e-bike elimina el gasto en gasolina y seguro. Himiway.com ~$899 USD."),
        ],
        "technology": [
            # amazon.com — Samsung Galaxy Tab A9+ ~$219
            ("Samsung Galaxy Tab A9+ 5G", "Tablet", 219,
             "11\" LCD, 8GB RAM, 128GB, Wi-Fi 6 + 5G opcional. Ideal para streaming, redes y ofimática.",
             f"Para {purpose}, la Tab A9+ cumple la función a ~$219 USD (amazon.com), significativamente menos que un smartphone flagship."),
            # lenovo.com — IdeaPad Flex 3i Chromebook ~$329
            ("Lenovo IdeaPad Flex 3i Chromebook", "Chromebook", 329,
             "Intel N100, 4GB RAM, 128GB eMMC, táctil plegable 2-en-1, 10h batería.",
             f"Para {purpose} que requiere productividad, este Chromebook 2-en-1 ofrece más versatilidad. Lenovo.com ~$329 USD."),
        ],
        "home": [
            # homedepot.com — Refurbished appliances
            ("Electrodoméstico Certificado Reacondicionado", "Reacondicionado", 299,
             "Mismo modelo en excelente estado, revisado por técnicos y con garantía de 6-12 meses.",
             f"Para {purpose}, un electrodoméstico reacondicionado certificado funciona igual. Precio 30-50% menor. homedepot.com / bestbuy.com."),
            # rent-to-own estimates
            ("Renta mensual del electrodoméstico", "Renta", 45,
             "Alquiler mensual sin enganche. Opción en empresas como Rent-A-Center (~$45/mes estimado).",
             f"Si {purpose} es temporal o incierto, rentar evita la deuda. Rentacenter.com desde ~$45/mes."),
        ],
        "loan": [
            ("Préstamo Cooperativa (mejor tasa)", "Cooperativa", 1_500,
             "Cooperativas en RD ofrecen tasas 18-22% anual vs 28-35% de bancos comerciales.",
             f"Para {purpose}, una cooperativa es la opción de menor costo. Apegrd.org — directorio de cooperativas en RD."),
            ("Ahorro previo planificado", "Ahorro", 0,
             "Ahorrar el monto requerido en 6-12 meses antes de endeudarse. Costo de intereses: $0.",
             f"Para {purpose}, ahorrar primero evita pagar hasta 30% más en intereses. La opción más inteligente financieramente."),
        ],
        "travel": [
            # despegar.com — paquetes locales RD
            ("Paquete Cabarete o Samaná (3 noches)", "Turismo local", 150,
             "Hotel boutique + desayuno incluido en playa nacional. Traslado desde SD ~$30 adicional.",
             f"Para {purpose} de descanso, los destinos locales ofrecen experiencia similar. Despegar.com desde ~$150 USD."),
            # royalcaribbean.com — deals
            ("Crucero Perfect Day Bahamas (2 noches)", "Crucero", 199,
             "Royal Caribbean, salida desde Miami. Incluye alimentos y entretenimiento a bordo.",
             f"Diferir {purpose} 3-4 meses y reservar con anticipación. Royalcaribbean.com desde ~$199 USD en temporada baja."),
        ],
        "insurance": [
            # policygenius.com estimates
            ("Seguro de Vida Término 10 años", "Seguro de vida", 20,
             "Prima ~$20 USD/mes para adulto de 30 años, cobertura $100,000 USD. Cotizar en policygenius.com.",
             f"Para protección básica de {purpose}, el seguro de vida término tiene la prima más baja. Policygenius.com desde ~$20/mes."),
            ("ARS Plan básico SEMMA o equivalente", "Seguro médico", 35,
             "Plan de salud básico en RD con cobertura ambulatoria y hospitalaria.",
             f"Antes de contratar seguro privado para {purpose}, verifica si califica para planes subsidiados o el de tu empleador. Desde ~RD$2,000/mes."),
        ],
    }

    examples = CROSS_CATEGORY.get(category, CROSS_CATEGORY["technology"])
    result = []
    for item in examples:
        name, alt_category, price_usd, desc, why = item
        price_str = f"${price_usd:,} USD/mes" if alt_category in ("Seguro de vida", "Seguro médico", "Renta") else f"${price_usd:,} USD"
        result.append({
            "name": name,
            "category": alt_category,
            "price": price_str,
            "desc": desc,
            "why_better": why,
        })
    return result

def load_or_train_artifacts(path: str) -> dict:
    if os.path.exists(path):
        try:
            return joblib.load(path)
        except:
            pass
    print("Entrenando pipeline completo con más registros...")
    arts = train_full_pipeline(50000)
    joblib.dump(arts, path)
    return arts
