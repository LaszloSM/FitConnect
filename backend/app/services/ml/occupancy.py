"""Aforo esperado para los próximos 7 días, por hora.

Regresión sobre la matriz día-de-semana × hora: el valor esperado de cada celda
es el promedio de las últimas semanas con peso decreciente, para que un cambio
de horario reciente cuente más que lo que pasaba hace dos meses.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np

MIN_DAYS = 14
WEEKS = 8
DECAY = 0.8
WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


def expected_grid(visits: list[datetime], today: date) -> tuple[np.ndarray, int]:
    """Matriz 7×24 de entradas esperadas. `visits` en hora local del gimnasio."""
    inicio = today - timedelta(weeks=WEEKS)
    conteo = np.zeros((WEEKS, 7, 24))
    dias_con_datos = set()
    for ts in visits:
        d = ts.date()
        if not (inicio <= d < today):
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


def next_week(grid: np.ndarray, today: date) -> dict:
    celdas, picos = [], []
    for i in range(1, 8):
        d = today + timedelta(days=i)
        for h in range(24):
            v = float(grid[d.weekday(), h])
            celdas.append({"weekday": d.weekday(), "weekday_label": WEEKDAYS[d.weekday()], "hour": h, "count": round(v, 1)})
            if v > 0:
                picos.append({"date": d.isoformat(), "weekday_label": WEEKDAYS[d.weekday()], "hour": h, "expected": round(v, 1)})
    picos.sort(key=lambda p: -p["expected"])
    return {"cells": celdas, "top": picos[:5], "total": round(sum(c["count"] for c in celdas), 1)}
