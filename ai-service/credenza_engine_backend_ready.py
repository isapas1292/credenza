from __future__ import annotations
import joblib
import numpy as np
import pandas as pd
import os
from typing import Any, Dict, Iterable, List, Optional, Tuple

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

# ============================================================
# LÓGICA DE NEGOCIO Y FEATURE ENGINEERING
# ============================================================

def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    
    # Aseguramos que existan las columnas básicas para evitar KeyErrors
    for col in ["current_debt_payment_monthly", "monthly_income_avg", "fixed_expenses_monthly", 
                "variable_expenses_monthly_avg", "emergency_fund_amount", "essential_expenses_monthly",
                "estimated_installment_monthly", "down_payment", "liquid_savings",
                "maintenance_cost_monthly", "insurance_cost_monthly"]:
        if col not in df.columns:
            df[col] = 0.0

    # Features actuales
    df["dti_current"] = df["current_debt_payment_monthly"] / df["monthly_income_avg"].replace(0, EPS)
    df["free_cash_flow_current"] = df["monthly_income_avg"] - df["fixed_expenses_monthly"] - df["variable_expenses_monthly_avg"] - df["current_debt_payment_monthly"]
    df["emergency_months"] = df["emergency_fund_amount"] / df["essential_expenses_monthly"].replace(0, EPS)
    
    # Features post-compra
    df["dti_post"] = (df["current_debt_payment_monthly"] + df["estimated_installment_monthly"]) / df["monthly_income_avg"].replace(0, EPS)
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

def label_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df["label_risk_band"] = df.apply(risk_band_from_row, axis=1)
    df["label_viable"] = df["label_risk_band"].apply(viable_from_risk_band)
    df["label_primary_reason"] = df.apply(primary_reason_from_row, axis=1)
    return df

# ============================================================
# ENTRENAMIENTO Y PIPELINES (BASADO EN EL SNIPPET DEL USUARIO)
# ============================================================

def _sample_user_values(rng):
    income = rng.uniform(25000, 200000)
    fixed = income * rng.uniform(0.2, 0.45)
    variable = income * rng.uniform(0.1, 0.25)
    debt = income * rng.uniform(0.0, 0.4)
    essential = fixed * 0.85
    
    return {
        "monthly_income_avg": income,
        "fixed_expenses_monthly": fixed,
        "variable_expenses_monthly_avg": variable,
        "current_debt_payment_monthly": debt,
        "essential_expenses_monthly": essential,
        "liquid_savings": income * rng.uniform(0.5, 4.0),
        "emergency_fund_amount": income * rng.uniform(0.2, 3.0),
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

def generate_synthetic_dataset(rows: int = 6000, options_per_user: int = 3) -> pd.DataFrame:
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

def train_full_pipeline(rows=6000):
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

def predict_viability(df: pd.DataFrame, class_arts: dict) -> Tuple[List[int], List[float]]:
    probs = class_arts["model"].predict_proba(df)[:, 1]
    preds = (probs >= 0.5).astype(int)
    return preds.tolist(), probs.tolist()

def compute_recommendation_score(viability_prob, engineered_record, preference_match=0.8):
    income = max(float(engineered_record["monthly_income_avg"]), 1.0)
    free_post = float(engineered_record["free_cash_flow_post"])
    dti_post = float(engineered_record["dti_post"])
    months = float(engineered_record["emergency_months"])
    liq_after = float(engineered_record["liquidity_after_down_payment"])
    essential = max(float(engineered_record["essential_expenses_monthly"]), 1.0)

    budget_fit = clamp(0.6 * clamp(free_post / (0.25 * income)) + 0.4 * clamp(1 - (dti_post / 0.55)))
    emergency_pres = clamp(0.5 * clamp(months / 6.0) + 0.5 * clamp(liq_after / (3 * essential)))
    
    score = (0.45 * clamp(viability_prob) + 0.25 * budget_fit + 0.15 * emergency_pres + 0.15 * clamp(preference_match))
    return round(score, 4)

def build_explanation_details(feat: Dict[str, Any]) -> List[str]:
    details = []
    if feat["free_cash_flow_post"] < 0: details.append("La compra deja flujo mensual negativo.")
    if feat["dti_post"] > 0.55: details.append("El endeudamiento supera el umbral de seguridad.")
    elif feat["dti_post"] > 0.45: details.append("Presión alta sobre el ingreso.")
    if feat["emergency_months"] < 1: details.append("Fondo de emergencia crítico.")
    elif feat["emergency_months"] < 3: details.append("Reserva de emergencia limitada.")
    if feat["upfront_burden"] > 0.90: details.append("Consume casi toda la liquidez.")
    if feat["income_volatility_score"] > 0.60: details.append("Ingreso muy inestable.")
    if not details: details.append("La operación es financieramente sostenible.")
    return details

def build_explanation(risk_band, reason, feat):
    details = build_explanation_details(feat)
    base = {0: "No recomendable", 1: "Riesgo alto", 2: "Viable con ajustes", 3: "Viable saludable"}.get(risk_band, "")
    return f"{base}: {reason}. {details[0]}"

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

def build_user_dict_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Mapeo de campos del wizard de Angular / BD a los nombres de features internos
    finances = payload.get("finances", payload)
    personal = payload.get("personal", payload)
    
    income = _num(_first(finances, ["monthlyIncome", "ingresoMensualPrincipal", "monthly_income_avg"]), 0)
    fixed = _num(_first(finances, ["fixedExpenses", "gastosFijosMensuales", "fixed_expenses_monthly"]), 0)
    variable = _num(_first(finances, ["variableExpenses", "gastosVariablesMensuales", "variable_expenses_monthly_avg"]), 0)
    debt = _num(_first(finances, ["activeDebts", "compromisosDeudasActivas", "current_debt_payment_monthly"]), 0)
    essential = max(fixed * 0.85, 5000)
    
    em_months = _num(_first(finances, ["emergencyFundMonths", "mesesFondoEmergencia", "emergency_months"]), 0)
    liquid = _num(_first(finances, ["liquidSavings", "ahorroLiquido", "liquid_savings"]), em_months * essential)
    
    situacion = _first(personal, ["employmentType", "situacionLaboral", "income_type"], "mixed")
    income_type = normalize_income_type(situacion)
    
    stability = 0.85 if income_type == "fixed" else 0.55 if income_type == "variable" else 0.70
    volatility = 0.12 if income_type == "fixed" else 0.35 if income_type == "variable" else 0.22

    return {
        "monthly_income_avg": income,
        "fixed_expenses_monthly": fixed,
        "variable_expenses_monthly_avg": variable,
        "current_debt_payment_monthly": debt,
        "essential_expenses_monthly": essential,
        "liquid_savings": liquid,
        "emergency_fund_amount": em_months * essential,
        "job_stability_score": stability,
        "budget_adherence_score": 0.8,
        "income_volatility_score": volatility,
        "income_type": income_type,
        "financial_goal_priority": "balanced",
        "dependents_count": _int(_first(personal, ["dependents", "dependientes"], 0))
    }

def find_optimal_term(user_dict: dict, product_price: float, down_payment: float, annual_rate: float) -> int:
    """Busca el plazo que mejor se adapte al flujo libre del usuario."""
    fcf = max(user_dict.get("free_cash_flow_current", 0), 100)
    financed = max(product_price - down_payment, 0)
    
    if financed <= 0: return 0
    
    # Probamos plazos comunes
    candidate_terms = [6, 12, 18, 24, 36, 48, 60]
    best_term = candidate_terms[-1]
    
    for term in candidate_terms:
        installment = monthly_payment(financed, annual_rate, term)
        # El plazo óptimo es el más corto donde la cuota sea < 30% del flujo libre
        if installment <= (fcf * 0.35):
            return term
            
    return best_term

def generate_scenarios(user_dict: dict, product_data: dict, artifacts: dict) -> List[dict]:
    """Genera 3 escenarios: Contado, Crédito Sugerido y Crédito Largo Plazo."""
    price = _num(product_data.get("price", 0))
    down_payment = _num(product_data.get("down_payment", 0))
    rate = _num(product_data.get("interest_rate", 0.18))
    
    scenarios = []
    
    # 1. Escenario Contado
    scenarios.append({
        "type": "contado",
        "name": "Pago al contado",
        "term": 0,
        "installment": 0,
        "down_payment": price,
        "description": "La opción financieramente más inteligente, pagando 0 intereses."
    })
    
    # 2. Escenario Sugerido (Óptimo)
    opt_term = find_optimal_term(user_dict, price, down_payment, rate)
    scenarios.append({
        "type": "sugerido",
        "name": f"Financiamiento a {opt_term} meses",
        "term": opt_term,
        "installment": monthly_payment(price - down_payment, rate, opt_term),
        "down_payment": down_payment,
        "description": "Impacto mensual manejable, optimizando el pago de intereses."
    })
    
    # 3. Escenario Largo Plazo
    long_term = 48 if opt_term < 36 else 72
    scenarios.append({
        "type": "largo_plazo",
        "name": f"Financiamiento a {long_term} meses",
        "term": long_term,
        "installment": monthly_payment(price - down_payment, rate, long_term),
        "down_payment": down_payment,
        "description": "Cuota mínima, pero con mayor carga de intereses a largo plazo."
    })
    
    results = []
    for sc in scenarios:
        # Clonamos datos del producto con los valores del escenario
        temp_prod = product_data.copy()
        temp_prod["estimated_installment_monthly"] = sc["installment"]
        temp_prod["down_payment"] = sc["down_payment"]
        temp_prod["term_months"] = sc["term"]
        
        # Predecimos recomendación para este escenario específico
        res = predict_recommendation_base(user_dict, temp_prod, artifacts)
        res["scenario_details"] = sc
        results.append(res)
        
    return results

def predict_recommendation_base(user_dict: dict, option_dict: dict, artifacts: dict) -> dict:
    """Función base de predicción para un solo escenario."""
    # 1. Normalizar categoría
    option_dict["product_category"] = normalize_category(option_dict.get("product_category"))
    
    # 2. Unir y calcular features
    combined = {**user_dict, **option_dict}
    df_engineered = add_engineered_features(pd.DataFrame([combined]))
    engineered_record = df_engineered.iloc[0].to_dict()
    
    # 3. Predicciones
    seg_ids, seg_names = predict_segment(df_engineered[SEGMENT_NUMERIC_FEATURES + SEGMENT_CATEGORICAL_FEATURES], artifacts["segmentation_artifacts"])
    viab_preds, viab_probs = predict_viability(df_engineered[CLASSIFIER_NUMERIC_FEATURES + CLASSIFIER_CATEGORICAL_FEATURES], artifacts["classifier_artifacts"])
    
    risk_band = risk_band_from_row(engineered_record)
    reason = primary_reason_from_row(engineered_record)
    score = compute_recommendation_score(viab_probs[0], engineered_record, option_dict.get("preference_match_score", 0.8))
    
    return {
        "viability_probability": round(viab_probs[0], 4),
        "viable": bool(viable_from_risk_band(risk_band)),
        "risk_band": risk_band,
        "risk_band_name": RISK_BAND_NAMES[risk_band],
        "primary_reason": reason,
        "recommendation_score": score,
        "explanation": build_explanation(risk_band, reason, engineered_record),
        "explanation_details": build_explanation_details(engineered_record),
        "metrics": {
            "dti_post": round(engineered_record["dti_post"], 4),
            "stress_ratio": round(engineered_record["stress_ratio"], 4),
            "fcf_post": round(engineered_record["free_cash_flow_post"], 2)
        }
    }

def predict_recommendation(user_dict: dict, option_dict: dict, artifacts: dict) -> dict:
    """Predicción principal que incluye el análisis de escenarios."""
    # Determinamos el escenario elegido por el usuario
    chosen_method = option_dict.get("payment_method", "cuotas")
    
    # Generamos todos los escenarios posibles
    all_scenarios = generate_scenarios(user_dict, option_dict, artifacts)
    
    # Buscamos cuál es el "mejor" según el score
    best_overall = max(all_scenarios, key=lambda x: x["recommendation_score"])
    
    # Buscamos el que el usuario eligió originalmente (o el más parecido)
    user_choice = None
    if chosen_method == "contado":
        user_choice = next((s for s in all_scenarios if s["scenario_details"]["type"] == "contado"), all_scenarios[0])
    else:
        user_choice = predict_recommendation_base(user_dict, option_dict, artifacts)
        user_choice["scenario_details"] = {
            "type": "usuario",
            "name": f"Tu elección ({option_dict.get('term_months', 12)} meses)",
            "installment": option_dict.get("estimated_installment_monthly", 0),
            "description": "Basado en los términos que seleccionaste manualmente."
        }

    return {
        "chosen_analysis": user_choice,
        "best_option": best_overall,
        "all_scenarios": all_scenarios,
        "is_optimal": user_choice["recommendation_score"] >= best_overall["recommendation_score"] - 0.05,
        "suggestion_text": f"Nuestra recomendación ideal es {best_overall['scenario_details']['name']}." if user_choice["recommendation_score"] < best_overall["recommendation_score"] - 0.1 else "Tu elección es financieramente sólida."
    }

def load_or_train_artifacts(path: str) -> dict:
    if os.path.exists(path):
        try:
            return joblib.load(path)
        except:
            pass
    print("Entrenando pipeline completo...")
    arts = train_full_pipeline(6000)
    joblib.dump(arts, path)
    return arts
