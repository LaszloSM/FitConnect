"""Motor de BI sin LLM: funciones puras sobre agregados ya calculados.

Cada función recibe datos planos (listas/dicts) y devuelve resultados
explicables: el dueño del gym debe poder entender por qué un socio está en
riesgo o de dónde sale una proyección. Las consultas viven en report_data.py.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable

WEEKDAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
MESES_CORTOS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def peak_hours(checkin_times: Iterable[datetime]) -> dict:
    """Matriz día-de-semana × hora (hora Bogotá ya convertida) y los picos."""
    grid = [[0] * 24 for _ in range(7)]
    total = 0
    for ts in checkin_times:
        grid[ts.weekday()][ts.hour] += 1
        total += 1
    cells = [
        {"weekday": d, "weekday_label": WEEKDAYS_ES[d], "hour": h, "count": grid[d][h]}
        for d in range(7) for h in range(24)
    ]
    top = sorted((c for c in cells if c["count"] > 0), key=lambda c: -c["count"])[:5]
    by_hour = [sum(grid[d][h] for d in range(7)) for h in range(24)]
    by_weekday = [sum(grid[d]) for d in range(7)]
    busiest_hour = max(range(24), key=lambda h: by_hour[h]) if total else None
    busiest_day = max(range(7), key=lambda d: by_weekday[d]) if total else None
    return {
        "total": total,
        "cells": cells,
        "by_hour": [{"hour": h, "count": by_hour[h]} for h in range(24)],
        "by_weekday": [{"weekday": d, "label": WEEKDAYS_ES[d], "count": by_weekday[d]} for d in range(7)],
        "top": top,
        "busiest_hour": busiest_hour,
        "busiest_weekday": busiest_day,
    }


def revenue_forecast(
    today: date,
    month_to_date: float,
    daily_so_far: list[float],
    previous_months: list[float],
) -> dict:
    """Proyección del mes: ritmo diario del mes en curso (con lo que va) mezclado
    con el promedio de los últimos meses. Explicable, sin modelo."""
    days_in_month = (date(today.year + (today.month == 12), (today.month % 12) + 1, 1) - date(today.year, today.month, 1)).days
    elapsed = today.day
    remaining = days_in_month - elapsed
    pace = (month_to_date / elapsed) if elapsed else 0.0
    projection_pace = month_to_date + pace * remaining
    prev = [p for p in previous_months if p > 0]
    avg_prev = sum(prev) / len(prev) if prev else None
    if avg_prev is not None and elapsed < days_in_month:
        # Cuanto más temprano en el mes, más pesa el histórico
        w_hist = max(0.0, 1 - elapsed / days_in_month)
        projection = projection_pace * (1 - w_hist) + avg_prev * w_hist
    else:
        projection = projection_pace
    low = min(projection_pace, projection) * 0.9
    high = max(projection_pace, projection) * 1.1
    vs_prev_pct = round((projection - avg_prev) / avg_prev * 100, 1) if avg_prev else None
    return {
        "month_to_date": round(month_to_date, 2),
        "elapsed_days": elapsed,
        "days_in_month": days_in_month,
        "daily_pace": round(pace, 2),
        "projection": round(projection, 2),
        "projection_low": round(low, 2),
        "projection_high": round(high, 2),
        "avg_previous_months": round(avg_prev, 2) if avg_prev is not None else None,
        "vs_previous_pct": vs_prev_pct,
        "daily_so_far": [round(x, 2) for x in daily_so_far],
    }


def churn_score(
    *,
    today: date,
    days_since_last_visit: int | None,
    visits_last_30: int,
    visits_prev_30: int,
    membership_end: date | None,
    membership_status: str,
    days_overdue: int,
    renewals_count: int,
) -> tuple[int, list[str]]:
    """Puntaje 0-100 de riesgo de abandono por reglas ponderadas + razones legibles."""
    score = 0
    reasons: list[str] = []
    if days_since_last_visit is None:
        score += 35
        reasons.append("nunca ha venido")
    elif days_since_last_visit >= 21:
        score += 35
        reasons.append(f"{days_since_last_visit} días sin venir")
    elif days_since_last_visit >= 10:
        score += 20
        reasons.append(f"{days_since_last_visit} días sin venir")
    if visits_prev_30 >= 4 and visits_last_30 <= visits_prev_30 / 2:
        score += 20
        reasons.append(f"bajó de {visits_prev_30} a {visits_last_30} visitas al mes")
    elif visits_last_30 == 0 and days_since_last_visit is not None and days_since_last_visit < 10:
        pass
    if membership_status in ("in_grace", "expired"):
        score += 25
        reasons.append("membresía vencida" + (f" hace {days_overdue} días" if days_overdue else ""))
    elif membership_end is not None:
        days_left = (membership_end - today).days
        if 0 <= days_left <= 5 and renewals_count == 0:
            score += 15
            reasons.append(f"vence en {days_left} días y nunca ha renovado")
        elif 0 <= days_left <= 5:
            score += 5
            reasons.append(f"vence en {days_left} días")
    if renewals_count == 0:
        score += 5
    return min(score, 100), reasons


def churn_level(score: int) -> str:
    if score >= 60:
        return "alto"
    if score >= 35:
        return "medio"
    return "bajo"


def stockout_eta(stock: int, units_sold_last_30: int, today: date) -> dict:
    """Días estimados hasta agotar el stock al ritmo de venta de los últimos 30 días."""
    velocity = units_sold_last_30 / 30.0
    if velocity <= 0:
        return {"daily_velocity": 0.0, "days_left": None, "runs_out_on": None}
    days_left = stock / velocity
    return {
        "daily_velocity": round(velocity, 2),
        "days_left": int(days_left),
        "runs_out_on": (today + timedelta(days=int(days_left))).isoformat(),
    }


def retention_cohorts(memberships: list[dict], today: date, months: int = 6) -> list[dict]:
    """Cohortes por mes de primera membresía: cuántos siguen con membresía
    vigente hoy y cuántos renovaron al menos una vez.
    memberships: [{member_id, start_date, end_date}]."""
    by_member: dict = {}
    for m in memberships:
        by_member.setdefault(m["member_id"], []).append(m)
    cohorts: dict = {}
    for member_id, ms in by_member.items():
        ms.sort(key=lambda x: x["start_date"])
        first = ms[0]["start_date"]
        key = (first.year, first.month)
        c = cohorts.setdefault(key, {"size": 0, "active_now": 0, "renewed": 0})
        c["size"] += 1
        if any(x["start_date"] <= today <= x["end_date"] for x in ms):
            c["active_now"] += 1
        if len(ms) > 1:
            c["renewed"] += 1
    out = []
    for i in range(months - 1, -1, -1):
        m, y = today.month - i, today.year
        while m <= 0:
            m += 12
            y -= 1
        c = cohorts.get((y, m), {"size": 0, "active_now": 0, "renewed": 0})
        out.append({
            "month": f"{MESES_CORTOS_ES[m - 1]} {y}",
            "size": c["size"],
            "active_now": c["active_now"],
            "renewed": c["renewed"],
            "active_pct": round(c["active_now"] / c["size"] * 100) if c["size"] else None,
            "renewed_pct": round(c["renewed"] / c["size"] * 100) if c["size"] else None,
        })
    return out
