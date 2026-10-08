"""Aforo esperado para los próximos 7 días, por hora.

Regresión sobre la matriz día-de-semana × hora: el valor esperado de cada celda
es el promedio de las últimas semanas con peso decreciente, para que un cambio
de horario reciente cuente más que lo que pasaba hace dos meses. Los festivos se
sacan del promedio (un lunes festivo no es un lunes) y, si la semana que viene
trae uno, ese día se escala por cómo le ha ido al gimnasio en festivos.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np

from app.services.ml.holidays import is_holiday

MIN_DAYS = 14
WEEKS = 8
DECAY = 0.8
WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
#: Sin festivos en el historial para medirlo, un festivo se supone al 60 %.
DEFAULT_HOLIDAY_RATIO = 0.6


def expected_grid(visits: list[datetime], today: date) -> tuple[np.ndarray, int]:
    """Matriz 7×24 de entradas esperadas. `visits` en hora local del gimnasio."""
    inicio = today - timedelta(weeks=WEEKS)
    conteo = np.zeros((WEEKS, 7, 24))
    dias_con_datos = set()
    for ts in visits:
        d = ts.date()
        if not (inicio <= d < today) or is_holiday(d):
            continue
        semana = (today - d).days // 7
        if semana >= WEEKS:
            continue
        conteo[semana, d.weekday(), ts.hour] += 1
        dias_con_datos.add(d)
    if len(dias_con_datos) < MIN_DAYS:
        raise ValueError(f"hacen falta {MIN_DAYS} días con entradas (hay {len(dias_con_datos)})")
    pesos = DECAY ** np.arange(WEEKS)
    return np.tensordot(pesos, conteo, axes=1) / pesos.sum(), len(dias_con_datos)


def holiday_ratio(visits: list[datetime], grid: np.ndarray, today: date) -> float:
    """Entradas de los festivos pasados frente a lo esperado para ese día de la semana."""
    por_dia: dict[date, int] = {}
    for ts in visits:
        d = ts.date()
        if d < today and d >= today - timedelta(days=365) and is_holiday(d):
            por_dia[d] = por_dia.get(d, 0) + 1
    esperado = [float(grid[d.weekday()].sum()) for d in por_dia]
    if len(por_dia) < 2 or sum(esperado) <= 0:
        return DEFAULT_HOLIDAY_RATIO
    return round(min(max(sum(por_dia.values()) / sum(esperado), 0.0), 1.5), 2)


def next_week(grid: np.ndarray, today: date, holiday_factor: float = DEFAULT_HOLIDAY_RATIO) -> dict:
    celdas, picos, festivos = [], [], []
    for i in range(1, 8):
        d = today + timedelta(days=i)
        fest = is_holiday(d)
        if fest:
            festivos.append(d.isoformat())
        factor = holiday_factor if fest else 1.0
        for h in range(24):
            v = float(grid[d.weekday(), h]) * factor
            celdas.append({"weekday": d.weekday(), "weekday_label": WEEKDAYS[d.weekday()], "hour": h,
                           "count": round(v, 1), "holiday": fest})
            if v > 0:
                picos.append({"date": d.isoformat(), "weekday_label": WEEKDAYS[d.weekday()], "hour": h,
                              "expected": round(v, 1), "holiday": fest})
    picos.sort(key=lambda p: -p["expected"])
    return {"cells": celdas, "top": picos[:5], "total": round(sum(c["count"] for c in celdas), 1),
            "holidays": festivos, "holiday_factor": holiday_factor}
