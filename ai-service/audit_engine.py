# -*- coding: utf-8 -*-
"""
Auditoría exhaustiva del motor de análisis de producto.

- Genera arquetipos de usuario variados y reproducibles (seed).
- Por cada categoría corre >= 50 usuarios, ambos métodos de pago.
- Corre cada caso DOS veces para verificar determinismo (mismo usuario -> mismo resultado).
- Aplica INVARIANTES para detectar contradicciones lógicas / bugs en:
    * viabilidad
    * suggestion_text (sugerencias a seguir)
    * alternativas y formas alternativas de adquisición
Escribe audit_report.json con conteo de anomalías + muestras.
"""
import json
import math
import copy
import numpy as np
from collections import defaultdict, Counter

from credenza_engine_backend_ready import (
    build_user_dict_from_payload,
    predict_recommendation,
    load_or_train_artifacts,
)

artifacts = load_or_train_artifacts("credenza_artifacts.joblib")

CATEGORIES = ["laptop", "vehicle", "loan", "insurance", "home", "travel", "technology"]
USERS_PER_CATEGORY = 60  # >50, con arquetipos repetidos para diversidad

ARCHETYPES = [
    "low_income_tight",
    "middle_stable",
    "high_income_liquid",
    "over_indebted",
    "high_liquidity_low_income",
    "variable_uncertain",
    "no_emergency_fund",
    "undisciplined",
    "negative_cashflow",
    "wealthy_conservative",
]

PRICE_RANGES = {
    "laptop": (20000, 150000),
    "vehicle": (300000, 2000000),
    "loan": (50000, 1000000),
    "insurance": (1000, 12000),
    "home": (2000000, 10000000),
    "travel": (30000, 150000),
    "technology": (15000, 120000),
}


def make_user(rng, arch):
    if arch == "low_income_tight":
        income = rng.integers(18000, 35000)
        fixed = income * rng.uniform(0.45, 0.6)
        debt = income * rng.uniform(0.1, 0.3)
        liquid = income * rng.uniform(0.0, 1.0)
        em = rng.integers(0, 2)
    elif arch == "middle_stable":
        income = rng.integers(45000, 110000)
        fixed = income * rng.uniform(0.25, 0.4)
        debt = income * rng.uniform(0.05, 0.3)
        liquid = income * rng.uniform(1.0, 4.0)
        em = rng.integers(2, 6)
    elif arch == "high_income_liquid":
        income = rng.integers(130000, 350000)
        fixed = income * rng.uniform(0.15, 0.3)
        debt = income * rng.uniform(0.0, 0.2)
        liquid = income * rng.uniform(3.0, 10.0)
        em = rng.integers(4, 6)
    elif arch == "over_indebted":
        income = rng.integers(35000, 150000)
        fixed = income * rng.uniform(0.3, 0.5)
        debt = income * rng.uniform(0.45, 0.75)
        liquid = income * rng.uniform(0.0, 0.6)
        em = rng.integers(0, 2)
    elif arch == "high_liquidity_low_income":
        income = rng.integers(20000, 40000)
        fixed = income * rng.uniform(0.3, 0.45)
        debt = 0.0
        liquid = rng.integers(150000, 600000)
        em = rng.integers(3, 6)
    elif arch == "variable_uncertain":
        income = rng.integers(30000, 120000)
        fixed = income * rng.uniform(0.3, 0.45)
        debt = income * rng.uniform(0.1, 0.4)
        liquid = income * rng.uniform(0.5, 2.0)
        em = rng.integers(0, 3)
    elif arch == "no_emergency_fund":
        income = rng.integers(40000, 120000)
        fixed = income * rng.uniform(0.3, 0.45)
        debt = income * rng.uniform(0.1, 0.35)
        liquid = income * rng.uniform(0.0, 0.3)
        em = 0
    elif arch == "undisciplined":
        income = rng.integers(40000, 130000)
        fixed = income * rng.uniform(0.35, 0.5)
        debt = income * rng.uniform(0.2, 0.45)
        liquid = income * rng.uniform(0.1, 0.8)
        em = rng.integers(0, 2)
    elif arch == "negative_cashflow":
        income = rng.integers(25000, 80000)
        fixed = income * rng.uniform(0.55, 0.75)
        debt = income * rng.uniform(0.25, 0.45)
        liquid = income * rng.uniform(0.0, 1.0)
        em = rng.integers(0, 2)
    else:  # wealthy_conservative
        income = rng.integers(150000, 500000)
        fixed = income * rng.uniform(0.12, 0.25)
        debt = 0.0
        liquid = income * rng.uniform(6.0, 15.0)
        em = rng.integers(5, 6)

    variable = income * rng.uniform(0.1, 0.2)
    if arch == "undisciplined":
        tracking = rng.choice(["laxo", "ninguno"])
        habit = "crédito inmediato"
    elif arch in ("wealthy_conservative", "high_income_liquid"):
        tracking = rng.choice(["estricto", "mental"])
        habit = rng.choice(["ahorrar el 100%", "financiamiento inteligente"])
    else:
        tracking = rng.choice(["estricto", "mental", "laxo", "ninguno"])
        habit = rng.choice(["ahorrar el 100%", "financiamiento inteligente", "crédito inmediato"])

    if arch == "variable_uncertain":
        emp = "variable"
    elif arch in ("low_income_tight", "middle_stable"):
        emp = rng.choice(["fixed", "mixed"])
    else:
        emp = rng.choice(["fixed", "variable", "mixed"])

    return {
        "finances": {
            "monthlyIncome": float(income),
            "fixedExpenses": float(fixed),
            "variableExpenses": float(variable),
            "activeDebts": float(debt),
            "emergencyFundMonths": int(em),
            "liquidSavings": float(liquid),
            "monthlySavingsCapacity": float(max(income - fixed - variable - debt, 0) * 0.5),
        },
        "personal": {"employmentType": str(emp), "dependents": int(rng.integers(0, 5))},
        "goals": {"mainGoal": str(rng.choice(["liquidity", "growth", "balanced"]))},
        "preferences": {"expenseTracking": str(tracking), "bigPurchaseHabit": str(habit)},
    }


def make_product(rng, category, income):
    min_p, max_p = PRICE_RANGES[category]
    # Mezcla precios relativos al ingreso y absolutos para cubrir casos
    if rng.random() < 0.5:
        price = int(rng.integers(min_p, max_p))
    else:
        mult = {"laptop": 1.5, "vehicle": 18, "loan": 8, "insurance": 0.08,
                "home": 80, "travel": 1.2, "technology": 1.2}[category]
        price = int(max(min_p, min(max_p, income * mult * rng.uniform(0.4, 1.6))))

    if category == "insurance":
        return {
            "name": f"Test {category}", "product_category": category, "price": price,
            "down_payment": 0, "term_months": 1, "interest_rate": 0,
            "payment_method": "cuotas", "payment_type": "Pago mensual", "purpose": f"Uso {category}",
        }
    method = str(rng.choice(["cuotas", "contado"]))
    return {
        "name": f"Test {category}", "product_category": category, "price": price,
        "down_payment": price * rng.uniform(0.1, 0.3),
        "term_months": int(rng.choice([12, 24, 36, 48, 60])),
        "interest_rate": rng.uniform(0.10, 0.25),
        "payment_method": method,
        "payment_type": "Financiado" if method == "cuotas" else "Contado",
        "purpose": f"Uso {category}",
    }


def has_bad_number(obj):
    if isinstance(obj, float):
        return math.isnan(obj) or math.isinf(obj)
    if isinstance(obj, dict):
        return any(has_bad_number(v) for v in obj.values())
    if isinstance(obj, list):
        return any(has_bad_number(v) for v in obj)
    return False


def check_invariants(res, product):
    """Devuelve lista de (codigo, detalle) de anomalías encontradas."""
    issues = []
    chosen = res["chosen_analysis"]
    score = chosen["recommendation_score"]
    viable = chosen["viable"]
    m = chosen["metrics"]
    text = res["suggestion_text"]
    method = product.get("payment_method", "cuotas")

    # 1. Score range
    if not (0.0 <= score <= 1.0):
        issues.append(("score_out_of_range", f"score={score}"))

    # 2. NaN/inf
    if has_bad_number(res):
        issues.append(("nan_or_inf", "resultado contiene NaN/inf"))

    # 3. viable True pero flujo post negativo
    if viable and m["fcf_post"] < 0 and method != "contado":
        issues.append(("viable_but_negative_fcf", f"fcf_post={m['fcf_post']}"))

    # 4. viable True pero score muy bajo (incoherencia banda vs score)
    if viable and score < 0.45:
        issues.append(("viable_but_low_score", f"score={score}, viable={viable}"))

    # 5. no viable pero score alto
    if (not viable) and score >= 0.65:
        issues.append(("not_viable_but_high_score", f"score={score}"))

    # 6. similar_products debe existir si y solo si la compra NO es viable
    has_similar = "similar_products" in res
    if has_similar and viable:
        issues.append(("similar_when_viable", f"score={score}, viable={viable}"))
    if (not has_similar) and (not viable):
        issues.append(("no_similar_when_not_viable", f"score={score}, viable={viable}"))

    # 7. Texto dice "cómoda/cómodo" pero score bajo
    low = text.lower()
    if ("cómoda" in low or "cómodo" in low or "se alinea bien" in low or "excelente en tu caso" in low) and score < 0.5:
        issues.append(("text_positive_but_low_score", f"score={score} :: {text[:120]}"))

    # 8. Porcentaje negativo en texto (flujo libre negativo mal manejado)
    if "-" in text and "%" in text:
        # buscar patrones "-NN%"
        import re
        for mm in re.findall(r"-\d+%", text):
            issues.append(("negative_percent_in_text", f"{mm} :: {text[:140]}"))
            break

    # 9. Reserva negativa mostrada como positiva o "RD$-"
    import re
    if re.search(r"RD\$-\d", text):
        issues.append(("negative_money_in_text", text[:140]))

    # 10. Alternativas con precio <= 0 o negativas
    for alt in res.get("alternatives", []):
        ptxt = str(alt.get("price", ""))
        nums = re.findall(r"-?\d[\d,]*", ptxt.replace(",", ""))
        if nums:
            val = float(re.sub(r"[^\d-]", "", nums[0]) or 0)
            if val <= 0:
                issues.append(("alt_nonpositive_price", f"{alt.get('name')} -> {ptxt}"))
                break

    # 11. Insurance no debería generar escenarios de financiamiento a largo plazo
    if product.get("product_category") == "insurance":
        for sc in res.get("all_scenarios", []):
            sd = sc.get("scenario_details", {})
            if sd.get("type") in ("sugerido", "largo_plazo") and sd.get("term", 0) > 1 and sd.get("installment", 0) > 0:
                issues.append(("insurance_has_financing", f"{sd.get('name')} term={sd.get('term')}"))
                break

    # 12. meses_para_ahorrar absurdo en texto (> 600)
    for mm in re.findall(r"(\d+)\s*meses", text):
        if int(mm) > 600:
            issues.append(("absurd_months_in_text", f"{mm} meses :: {text[:120]}"))
            break

    # 13. action_plan vacío
    if not chosen.get("action_plan"):
        issues.append(("empty_action_plan", "sin plan de acción"))

    # 14. suggestion_text vacío
    if not text.strip():
        issues.append(("empty_suggestion", "texto vacío"))

    # 15. viable_alternatives presente solo si la compra NO es viable
    if "viable_alternatives" in res and viable:
        issues.append(("viable_alts_when_ok", f"score={score}, viable={viable}"))

    return issues


def run():
    report = {"by_category": {}, "anomaly_totals": Counter(), "samples": defaultdict(list),
              "determinism_failures": 0, "total_cases": 0}
    seed_base = 20260610

    for cat in CATEGORIES:
        rng = np.random.default_rng(seed_base + hash(cat) % 10000)
        cat_issues = Counter()
        cases = 0
        viable_count = 0
        score_sum = 0.0
        for i in range(USERS_PER_CATEGORY):
            arch = ARCHETYPES[i % len(ARCHETYPES)]
            raw = make_user(rng, arch)
            income = raw["finances"]["monthlyIncome"]
            product = make_product(rng, cat, income)
            user_dict = build_user_dict_from_payload(raw)

            # Determinismo: correr dos veces (copias frescas)
            r1 = predict_recommendation(copy.deepcopy(user_dict), copy.deepcopy(product), artifacts)
            r2 = predict_recommendation(copy.deepcopy(user_dict), copy.deepcopy(product), artifacts)
            j1 = json.dumps(r1, sort_keys=True, ensure_ascii=False, default=str)
            j2 = json.dumps(r2, sort_keys=True, ensure_ascii=False, default=str)
            if j1 != j2:
                report["determinism_failures"] += 1
                cat_issues["determinism_fail"] += 1

            issues = check_invariants(r1, product)
            cases += 1
            report["total_cases"] += 1
            score_sum += r1["chosen_analysis"]["recommendation_score"]
            if r1["chosen_analysis"]["viable"]:
                viable_count += 1

            for code, detail in issues:
                cat_issues[code] += 1
                report["anomaly_totals"][code] += 1
                if len(report["samples"][code]) < 4:
                    report["samples"][code].append({
                        "category": cat, "archetype": arch,
                        "income": income, "price": product["price"],
                        "method": product.get("payment_method"),
                        "score": r1["chosen_analysis"]["recommendation_score"],
                        "viable": r1["chosen_analysis"]["viable"],
                        "fcf_current": r1["chosen_analysis"]["metrics"]["fcf_current"],
                        "fcf_post": r1["chosen_analysis"]["metrics"]["fcf_post"],
                        "detail": detail,
                        "suggestion_text": r1["suggestion_text"],
                    })

        report["by_category"][cat] = {
            "cases": cases,
            "viable_rate": round(viable_count / cases, 3),
            "avg_score": round(score_sum / cases, 3),
            "issues": dict(cat_issues),
        }

    report["anomaly_totals"] = dict(report["anomaly_totals"])
    report["samples"] = {k: v for k, v in report["samples"].items()}
    with open("audit_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)

    # Resumen por consola
    print(f"\n=== TOTAL CASES: {report['total_cases']} (x2 corridas determinismo) ===")
    print(f"Determinism failures: {report['determinism_failures']}")
    print("\n--- Anomalías totales ---")
    for code, n in sorted(report["anomaly_totals"].items(), key=lambda x: -x[1]):
        print(f"  {code}: {n}")
    print("\n--- Por categoría (viable_rate / avg_score) ---")
    for cat, d in report["by_category"].items():
        print(f"  {cat:12s} viable={d['viable_rate']:.2f} avg_score={d['avg_score']:.2f} issues={sum(d['issues'].values())}")


if __name__ == "__main__":
    run()
