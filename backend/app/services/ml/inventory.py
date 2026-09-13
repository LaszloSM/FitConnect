"""Inventario: velocidad de venta suavizada y con patrón semanal.

El promedio plano de 30 días subestima un producto que se empezó a vender más
la semana pasada y no ve que los sábados se va el doble de agua.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np

ALPHA = 0.25


def smoothed_velocity(daily_units: list[float]) -> float:
    """Suavizado exponencial simple sobre ventas diarias (la última al final)."""
    if not daily_units:
        return 0.0
    nivel = float(np.mean(daily_units[: min(7, len(daily_units))]))
    for v in daily_units:
        nivel = ALPHA * float(v) + (1 - ALPHA) * nivel
    return max(nivel, 0.0)


def weekday_profile(days: list[date], units: list[float]) -> list[float]:
    """Cuánto pesa cada día de la semana respecto al promedio (1 = normal)."""
    tot = np.zeros(7)
    n = np.zeros(7)
    for d, u in zip(days, units):
        tot[d.weekday()] += u
        n[d.weekday()] += 1
    prom = np.divide(tot, np.maximum(n, 1))
    base = prom.mean()
    if base <= 0:
        return [1.0] * 7
    return [round(float(v / base), 3) for v in prom]


def run_out(stock: float, velocity: float, profile: list[float], today: date, horizon: int = 120) -> date | None:
    """Simula día a día con el patrón semanal hasta agotar el stock."""
    if velocity <= 0 or stock <= 0:
        return today if stock <= 0 and velocity > 0 else None
    restante = float(stock)
    for i in range(1, horizon + 1):
        d = today + timedelta(days=i)
        restante -= velocity * profile[d.weekday()]
        if restante <= 0:
            return d
    return None
