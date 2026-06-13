# -*- coding: utf-8 -*-
import json, copy
import numpy as np
from credenza_engine_backend_ready import build_user_dict_from_payload, predict_recommendation, load_or_train_artifacts
arts = load_or_train_artifacts("credenza_artifacts.joblib")
cats=["laptop","vehicle","loan","insurance","home","travel","technology"]
rng=np.random.default_rng(7)
total=0; fails=0
for cat in cats:
    for k in range(8):  # 8 usuarios distintos por categoria
        inc=int(rng.integers(20000,250000))
        u=build_user_dict_from_payload({"finances":{"monthlyIncome":inc,"fixedExpenses":inc*0.35,
            "variableExpenses":inc*0.15,"activeDebts":inc*float(rng.uniform(0,0.4)),"emergencyFundMonths":int(rng.integers(0,6)),
            "liquidSavings":int(rng.integers(0,inc*8)),"monthlySavingsCapacity":inc*0.2},
            "personal":{"employmentType":str(rng.choice(["fixed","variable","mixed"])),"dependents":2},
            "goals":{"mainGoal":"balanced"},"preferences":{"expenseTracking":"mental","bigPurchaseHabit":"financiamiento inteligente"}})
        for method in (["cuotas"] if cat=="insurance" else ["cuotas","contado"]):
            price=int(rng.integers(*{"laptop":(20000,150000),"vehicle":(300000,2000000),"loan":(50000,1000000),
                "insurance":(1000,12000),"home":(2000000,10000000),"travel":(30000,150000),"technology":(15000,120000)}[cat]))
            p={"name":cat,"product_category":cat,"price":price,"down_payment":0 if method=="contado" else price*0.15,
               "term_months":1 if cat=="insurance" else 48,"interest_rate":0 if cat=="insurance" else 0.18,
               "payment_method":method,"payment_type":"Contado" if method=="contado" else "Financiado","purpose":"x"}
            refs=[json.dumps(predict_recommendation(copy.deepcopy(u),copy.deepcopy(p),arts),sort_keys=True,default=str) for _ in range(5)]
            total+=1
            if len(set(refs))!=1: fails+=1; print("FAIL",cat,method,price)
print(f"\nMismo-usuario x5 -> casos={total} fallos_determinismo={fails}")
print("OK: TODOS los usuarios producen resultado idEntico al repetirse." if fails==0 else "HAY NO-DETERMINISMO")
