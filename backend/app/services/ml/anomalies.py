"""Días que se salen de lo normal: IsolationForest sobre ingresos y asistencia diaria.

Cada día se compara contra la mediana de SU día de la semana: un sábado flojo
no es un lunes flojo. El modelo marca; la frase dice cuánto y contra qué.
"""
from __future__ import annotations

from datetime import date

import numpy as np
from sklearn.ensemble import IsolationForest

MIN_DAYS = 42
WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def _veces(valor: float, normal: float) -> str:
    if normal <= 0:
        return "sin referencia"
    r = valor / normal
    if r >= 1:
        return f"{r:.1f} veces lo normal".replace(".", ",")
    return f"{(1 - r) * 100:.0f}% por debajo de lo normal"


def detect(days: list[date], revenue: list[float], checkins: list[int], recent_days: int = 30) -> list[dict]:
    fechas = list(days)
    if len(fechas) < MIN_DAYS:
        raise ValueError(f"hacen falta {MIN_DAYS} días de historial (hay {len(fechas)})")
    rev = np.asarray(revenue, dtype=float)
    chk = np.asarray(checkins, dtype=float)
    dow = np.array([d.weekday() for d in fechas])

    med_rev = np.array([np.median(rev[dow == w]) for w in range(7)])
    med_chk = np.array([np.median(chk[dow == w]) for w in range(7)])
    rel_rev = rev / np.maximum(med_rev[dow], 1)
    rel_chk = chk / np.maximum(med_chk[dow], 1)
    X = np.column_stack([np.log1p(rev), np.log1p(chk), rel_rev, rel_chk])

    bosque = IsolationForest(n_estimators=200, contamination=0.05, random_state=0).fit(X)
    marcas = bosque.predict(X)
    puntaje = -bosque.decision_function(X)

    salida = []
    for i in range(max(0, len(fechas) - recent_days), len(fechas)):
        if marcas[i] != -1:
            continue
        w = dow[i]
        partes = []
        if rev[i] == 0 and med_rev[w] > 0:
            normal = f"{med_rev[w]:,.0f}".replace(",", ".")
            partes.append(f"no hubo ingresos, cuando un {WEEKDAYS[w]} normal deja ${normal}")
        elif abs(rel_rev[i] - 1) >= 0.5 and med_rev[w] > 0:
            partes.append(f"ingresos {_veces(rev[i], med_rev[w])} de un {WEEKDAYS[w]}")
        if abs(rel_chk[i] - 1) >= 0.5 and med_chk[w] > 0:
            partes.append(f"asistencia {_veces(chk[i], med_chk[w])}")
        if chk[i] == 0 and med_chk[w] > 0:
            partes = [f"nadie entró, cuando un {WEEKDAYS[w]} normal entran {med_chk[w]:.0f}"]
        if not partes:
            continue
        salida.append({
            "date": fechas[i].isoformat(),
            "revenue": round(float(rev[i]), 2),
            "checkins": int(chk[i]),
            "direction": "up" if rel_rev[i] + rel_chk[i] >= 2 else "down",
            "score": round(float(puntaje[i]), 3),
            # capitalize() bajaría a minúscula el resto de la frase.
            "explanation": (lambda t: t[:1].upper() + t[1:])("; ".join(partes)),
        })
    return sorted(salida, key=lambda a: a["date"], reverse=True)
