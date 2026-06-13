import json
import random
import sys
from credenza_engine_backend_ready import build_user_dict_from_payload, predict_recommendation, load_or_train_artifacts

artifacts = load_or_train_artifacts("credenza_artifacts.joblib")

categories = ["laptop", "vehicle", "loan", "insurance", "home", "travel"]

def generate_random_user():
    income = random.randint(20000, 200000)
    fixed_ratio = random.uniform(0.2, 0.6)
    debt_ratio = random.uniform(0.0, 0.5)
    
    fixed = income * fixed_ratio
    debt = income * debt_ratio
    variable = income * 0.15
    liquid = random.randint(0, int(income * 10))
    em_months = random.randint(0, 6)
    
    return {
        "finances": {
            "monthlyIncome": income,
            "fixedExpenses": fixed,
            "variableExpenses": variable,
            "activeDebts": debt,
            "emergencyFundMonths": em_months,
            "liquidSavings": liquid,
            "monthlySavingsCapacity": max(income - fixed - variable - debt, 0) * 0.5
        },
        "personal": {
            "employmentType": random.choice(["fixed", "variable", "mixed"]),
            "dependents": random.randint(0, 4)
        },
        "goals": {
            "mainGoal": random.choice(["liquidity", "growth", "balanced"])
        },
        "preferences": {
            "expenseTracking": random.choice(["estricto", "mental", "laxo", "ninguno"]),
            "bigPurchaseHabit": random.choice(["ahorrar el 100%", "financiamiento inteligente", "crédito inmediato"])
        }
    }

def generate_product(category, user_income):
    price_ranges = {
        "laptop": (20000, 150000),
        "vehicle": (300000, 2000000),
        "loan": (50000, 1000000),
        "insurance": (1000, 10000),
        "home": (2000000, 10000000),
        "travel": (30000, 150000)
    }
    
    min_p, max_p = price_ranges[category]
    price = random.randint(min_p, max_p)
    
    if category == "insurance":
        term = 1
        down = 0
        rate = 0
        method = "cuotas"
        payment_type = "Pago mensual"
    else:
        term = random.choice([12, 24, 36, 48, 60])
        down = price * random.uniform(0.1, 0.3)
        rate = random.uniform(0.10, 0.25)
        method = random.choice(["cuotas", "contado"])
        payment_type = "Financiado" if method == "cuotas" else "Contado"
        
    return {
        "name": f"Test {category.capitalize()}",
        "product_category": category,
        "price": price,
        "down_payment": down,
        "term_months": term,
        "interest_rate": rate,
        "payment_method": method,
        "payment_type": payment_type,
        "purpose": f"Uso para {category}"
    }

results_summary = {}

for cat in categories:
    results_summary[cat] = []
    print(f"--- Running tests for {cat} ---")
    for i in range(10):
        raw_user = generate_random_user()
        product = generate_product(cat, raw_user["finances"]["monthlyIncome"])
        user_dict = build_user_dict_from_payload(raw_user)
        
        res = predict_recommendation(user_dict, product, artifacts)
        
        score = res["chosen_analysis"]["recommendation_score"]
        is_viable = res["chosen_analysis"]["viable"]
        fcf_post = res["chosen_analysis"]["metrics"]["fcf_post"]
        dti_post = res["chosen_analysis"]["metrics"]["dti_post"]
        text = res["suggestion_text"]
        
        results_summary[cat].append({
            "test_id": i+1,
            "income": user_dict["monthly_income_avg"],
            "dti_current": user_dict["current_debt_payment_monthly"] / user_dict["monthly_income_avg"],
            "price": product["price"],
            "score": score,
            "viable": is_viable,
            "dti_post": dti_post,
            "fcf_post": fcf_post,
            "text": text,
            "explanations": res["chosen_analysis"]["explanation_details"]
        })

with open("test_results.json", "w", encoding="utf-8") as f:
    json.dump(results_summary, f, indent=2, ensure_ascii=False)
print("Tests done. Wrote test_results.json")
