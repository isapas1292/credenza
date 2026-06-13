# -*- coding: utf-8 -*-
"""
Base de conocimiento del mercado financiero de República Dominicana.

Contiene tasas y proveedores REFERENCIALES (rangos típicos de mercado) usados
para:
  1. Comparar la tasa que ingresa el usuario contra el mercado y detectar si
     está pagando de más (préstamos, vehículo, hipoteca).
  2. Anclar (grounding) a la IA generativa: se le pasan estas instituciones y
     rangos para que NO invente cifras.

IMPORTANTE: son rangos referenciales de mercado, no ofertas en firme. La capa de
presentación siempre debe indicar "tasas referenciales, verificar con la entidad".
Mantener este archivo actualizado es parte del mantenimiento del producto.

Última revisión de rangos: 2025.
"""
from __future__ import annotations
from typing import Dict, List, Optional

# ── Tasas anuales (APR) referenciales por tipo de financiamiento ────────────
# (min, max) en proporción anual. Fuentes: tarifarios públicos de la banca
# dominicana, asociaciones de ahorros y préstamos y cooperativas.
RATE_BANDS = {
    "loan": {  # préstamo de consumo / personal en DOP
        "market_low": 0.16,
        "market_typical": 0.22,
        "market_high": 0.30,
    },
    "vehicle": {  # préstamo de vehículo
        "market_low": 0.12,
        "market_typical": 0.15,
        "market_high": 0.19,
    },
    "home": {  # préstamo hipotecario en DOP
        "market_low": 0.095,
        "market_typical": 0.115,
        "market_high": 0.135,
    },
    "credit_card": {  # referencia: tarjetas de crédito (muy alto)
        "market_low": 0.45,
        "market_typical": 0.55,
        "market_high": 0.65,
    },
}

# ── Instituciones por tipo de producto (para grounding de la IA) ────────────
# rate = (min, max) APR referencial de esa institución para ese producto.
LOAN_PROVIDERS = {
    "loan": [
        {"name": "Cooperativa (p. ej. Coop-Herrera, Vega Real, Maimón)", "type": "Cooperativa",
         "rate": (0.14, 0.20), "note": "Suele ofrecer la tasa más baja y menos requisitos; requiere ser socio."},
        {"name": "Asociación Popular (APAP)", "type": "Asociación",
         "rate": (0.17, 0.24), "note": "Préstamos de consumo con plazos flexibles."},
        {"name": "Banco Popular Dominicano", "type": "Banco",
         "rate": (0.18, 0.26), "note": "Desembolso rápido si eres cliente nómina."},
        {"name": "Banreservas", "type": "Banco",
         "rate": (0.16, 0.24), "note": "Tasas preferenciales para empleados públicos y nómina."},
        {"name": "Banco BHD", "type": "Banco",
         "rate": (0.18, 0.27), "note": "Préstamos personales con seguro de saldo opcional."},
        {"name": "Banco Santa Cruz", "type": "Banco",
         "rate": (0.18, 0.27), "note": "Alternativa competitiva para montos medianos."},
        {"name": "Asociación Cibao (ACAP)", "type": "Asociación",
         "rate": (0.16, 0.22), "note": "Tasas competitivas en consumo, fuerte en la región norte."},
        {"name": "Banco Caribe", "type": "Banco",
         "rate": (0.18, 0.26), "note": "Préstamos personales con aprobación ágil."},
    ],
    "vehicle": [
        {"name": "Banreservas - Préstamo Vehículo", "type": "Banco",
         "rate": (0.12, 0.16), "note": "Tasas competitivas y plazos hasta 72 meses."},
        {"name": "Banco Popular - Auto", "type": "Banco",
         "rate": (0.13, 0.17), "note": "Preaprobación en concesionarios aliados."},
        {"name": "Banco BHD - Vehículo", "type": "Banco",
         "rate": (0.13, 0.18), "note": "Incluye opciones para vehículos usados certificados."},
        {"name": "Asociación Cibao (ACAP)", "type": "Asociación",
         "rate": (0.13, 0.17), "note": "Buena opción en la región norte (Cibao)."},
        {"name": "Scotiabank - Préstamo de Auto", "type": "Banco",
         "rate": (0.13, 0.18), "note": "Financiamiento para vehículos nuevos y usados de concesionario."},
    ],
    "home": [
        {"name": "Asociación Popular (APAP) - Hipotecario", "type": "Asociación",
         "rate": (0.095, 0.12), "note": "Líder en préstamos hipotecarios, plazos hasta 30 años."},
        {"name": "Asociación Cibao (ACAP) - Hipotecario", "type": "Asociación",
         "rate": (0.10, 0.125), "note": "Competitiva en el Cibao; financia hasta 80-90%."},
        {"name": "Asociación La Nacional (ALNAP)", "type": "Asociación",
         "rate": (0.10, 0.13), "note": "Programas para primera vivienda."},
        {"name": "Banreservas - Hipotecario / Bono Vivienda", "type": "Banco",
         "rate": (0.09, 0.12), "note": "Acceso a planes estatales (Fideicomiso, Bono ITBIS) para primera vivienda."},
        {"name": "Banco Popular - Hipotecario", "type": "Banco",
         "rate": (0.10, 0.125), "note": "Financiamiento para vivienda nueva y usada."},
    ],
}

# ── Aseguradoras y ARS por tipo de cobertura ────────────────────────────────
INSURERS = {
    "vida": ["Seguros Universal", "Mapfre BHD Seguros", "Seguros Reservas", "La Colonial", "Banesco Seguros"],
    "vehiculo": ["Seguros Universal", "Mapfre BHD Seguros", "Seguros Reservas", "La Colonial", "Banco Caribe Seguros"],
    "salud": ["ARS Humano", "ARS Universal", "ARS Senasa", "Mapfre Salud ARS", "ARS Palic (Seguros Universal)"],
    "general": ["Seguros Universal", "Mapfre BHD Seguros", "Seguros Reservas", "La Colonial", "Humano Seguros"],
}

USD_DOP = 60.0  # tasa de cambio referencial para mostrar equivalencias
LAST_REVIEWED = "2025"  # actualizar al revisar tasas/instituciones


def monthly_payment(financed: float, annual_rate: float, term_months: int) -> float:
    """Cuota fija (sistema francés)."""
    financed = max(float(financed or 0), 0.0)
    annual_rate = max(float(annual_rate or 0), 0.0)
    term_months = int(term_months or 0)
    if financed <= 0 or term_months <= 0:
        return 0.0
    r = annual_rate / 12.0
    if r <= 0:
        return round(financed / term_months, 2)
    return round(financed * (r / (1 - (1 + r) ** (-term_months))), 2)


def classify_rate(category: str, user_rate: Optional[float]) -> Optional[str]:
    """Clasifica la tasa del usuario: 'baja' | 'mercado' | 'alta' | None."""
    band = RATE_BANDS.get(category)
    if band is None or user_rate is None or user_rate <= 0:
        return None
    if user_rate <= band["market_low"] * 1.02:
        return "baja"
    if user_rate <= band["market_typical"] * 1.05:
        return "mercado"
    return "alta"


def compare_loan_rate(category: str, user_rate: Optional[float], financed_amount: float,
                      term_months: int) -> Optional[dict]:
    """
    Compara la tasa del usuario con el mercado RD y, si está alta, propone
    instituciones con tasas referenciales más bajas y calcula el ahorro.

    Devuelve None si la categoría no es financiable por tasa o no hay tasa.
    """
    if category not in RATE_BANDS or category == "credit_card":
        return None
    if not user_rate or user_rate <= 0 or financed_amount <= 0 or term_months <= 0:
        return None

    band = RATE_BANDS[category]
    verdict = classify_rate(category, user_rate)
    user_installment = monthly_payment(financed_amount, user_rate, term_months)
    user_total_interest = round(user_installment * term_months - financed_amount, 2)

    providers = []
    for p in LOAN_PROVIDERS.get(category, []):
        lo, hi = p["rate"]
        # Solo proponer si su rango es claramente mejor que la tasa del usuario
        if hi < user_rate - 0.01 or lo < user_rate - 0.02:
            avg_rate = (lo + hi) / 2
            est_installment = monthly_payment(financed_amount, avg_rate, term_months)
            providers.append({
                "name": p["name"],
                "type": p["type"],
                "avg_rate": avg_rate,
                "rate_range": f"{lo*100:.0f}%–{hi*100:.0f}% anual",
                "est_installment": est_installment,
                "monthly_saving_vs_user": round(max(user_installment - est_installment, 0), 2),
                "note": p["note"],
            })
    providers.sort(key=lambda x: x["est_installment"])

    # La "mejor tasa alcanzable" se ancla a la tasa REALISTA (promedio) de la
    # entidad más barata disponible, no al piso teórico del mercado, para que el
    # ahorro mostrado sea creíble y atribuible a una institución concreta.
    if providers:
        best_rate = providers[0]["avg_rate"]
        best_installment = providers[0]["est_installment"]
    else:
        best_rate = band["market_low"]
        best_installment = monthly_payment(financed_amount, best_rate, term_months)
    monthly_savings = round(max(user_installment - best_installment, 0), 2)
    total_savings = round(monthly_savings * term_months, 2)
    # No exponemos el campo interno avg_rate en la respuesta.
    for p in providers:
        p.pop("avg_rate", None)

    return {
        "category": category,
        "user_rate_pct": round(user_rate * 100, 2),
        "market_low_pct": round(band["market_low"] * 100, 2),
        "market_typical_pct": round(band["market_typical"] * 100, 2),
        "market_high_pct": round(band["market_high"] * 100, 2),
        "verdict": verdict,  # 'baja' | 'mercado' | 'alta'
        "user_installment": user_installment,
        "user_total_interest": user_total_interest,
        "best_reference_rate_pct": round(best_rate * 100, 2),
        "best_reference_installment": best_installment,
        "potential_monthly_savings": monthly_savings,
        "potential_total_savings": total_savings,
        "better_providers": providers[:4],
        "disclaimer": "Tasas referenciales de mercado; confirma la oferta final con cada entidad.",
    }


def market_reference_for_prompt(category: str) -> str:
    """
    Devuelve un bloque de texto compacto con instituciones y rangos de tasa
    para anclar (grounding) a la IA generativa y evitar que invente cifras.
    """
    lines = []
    if category in LOAN_PROVIDERS:
        band = RATE_BANDS.get(category, {})
        if band:
            lines.append(
                f"Rango de tasa de mercado en RD para {category}: "
                f"{band['market_low']*100:.0f}% (baja) – {band['market_typical']*100:.0f}% (típica) – "
                f"{band['market_high']*100:.0f}% (alta) anual."
            )
        lines.append("Instituciones de referencia y sus rangos de tasa anual:")
        for p in LOAN_PROVIDERS[category]:
            lo, hi = p["rate"]
            lines.append(f"  - {p['name']} ({p['type']}): {lo*100:.0f}%–{hi*100:.0f}%. {p['note']}")
    if category == "insurance":
        lines.append("Aseguradoras/ARS de referencia en RD:")
        lines.append(f"  - Vida: {', '.join(INSURERS['vida'])}.")
        lines.append(f"  - Vehículo: {', '.join(INSURERS['vehiculo'])}.")
        lines.append(f"  - Salud (ARS): {', '.join(INSURERS['salud'])}.")
    return "\n".join(lines)
