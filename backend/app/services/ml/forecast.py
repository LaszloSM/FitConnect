"""Ingresos del mes: Holt-Winters aditivo con estacionalidad semanal.

Un gimnasio cobra distinto un lunes que un domingo, y el ritmo lineal de
`insights_engine.revenue_forecast` no lo sabe. Implementado a mano sobre numpy:
statsmodels pesaría más que todo el backend en una EC2 de 2 GB.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import product

import numpy as np

SEASON = 7
MIN_DAYS = 8 * SEASON
_ALPHAS = (0.1, 0.3, 0.5)
_BETAS = (0.0, 0.05, 0.15)
_GAMMAS = (0.05, 0.2, 0.4)


@dataclass
class HoltWinters:
    level: float
    trend: float
    seasonals: list[float]
    n: int
    sigma: float
    params: tuple[float, float, float]

    def forecast(self, horizon: int) -> np.ndarray:
        pasos = np.arange(1, horizon + 1)
        estacional = np.array([self.seasonals[(self.n + i - 1) % SEASON] for i in pasos])
        return np.clip(self.level + pasos * self.trend + estacional, 0, None)


def _run(y: np.ndarray, alpha: float, beta: float, gamma: float) -> tuple[float, float, list[float], np.ndarray]:
    level = float(y[:SEASON].mean())
    trend = float((y[SEASON:2 * SEASON].mean() - y[:SEASON].mean()) / SEASON)
    seasonals = [float(v - level) for v in y[:SEASON]]
    fitted = np.empty(len(y))
    for t, val in enumerate(y):
        s = t % SEASON
        fitted[t] = level + trend + seasonals[s]
        anterior = level
        level = alpha * (val - seasonals[s]) + (1 - alpha) * (level + trend)
        trend = beta * (level - anterior) + (1 - beta) * trend
        seasonals[s] = gamma * (val - level) + (1 - gamma) * seasonals[s]
    return level, trend, seasonals, fitted


def fit(daily: list[float] | np.ndarray) -> HoltWinters:
    y = np.asarray(daily, dtype=float)
    if len(y) < MIN_DAYS:
        raise ValueError(f"hacen falta {MIN_DAYS} días de historial (hay {len(y)})")
    mejor = None
    for a, b, g in product(_ALPHAS, _BETAS, _GAMMAS):
        level, trend, seasonals, fitted = _run(y, a, b, g)
        err = y[SEASON:] - fitted[SEASON:]
        sse = float((err ** 2).sum())
        if mejor is None or sse < mejor[0]:
            mejor = (sse, level, trend, seasonals, err, (a, b, g))
    _, level, trend, seasonals, err, params = mejor
    return HoltWinters(level, trend, seasonals, len(y), float(err.std(ddof=1)), params)


def backtest(daily: list[float] | np.ndarray, holdout: int = 14) -> dict:
    """Error del total de las últimas `holdout` jornadas: el modelo contra el
    ritmo lineal que usaba la pantalla antes."""
    y = np.asarray(daily, dtype=float)
    entreno, real = y[:-holdout], y[-holdout:]
    modelo = fit(entreno).forecast(holdout).sum()
    ritmo = entreno[-28:].mean() * holdout
    total = real.sum()
    if total <= 0:
        return {"model_error_pct": None, "pace_error_pct": None}
    return {
        "model_error_pct": round(abs(modelo - total) / total * 100, 1),
        "pace_error_pct": round(abs(ritmo - total) / total * 100, 1),
    }


def project_month(model: HoltWinters, month_to_date: float, remaining_days: int, skip: int = 0) -> dict:
    """Cierre del mes con una banda del 80 %.

    `skip`: pasos del pronóstico que ya están dentro de lo cobrado (el modelo se
    ajusta hasta ayer y hoy ya cuenta en `month_to_date`).
    """
    futuro = model.forecast(remaining_days + skip)[skip:] if remaining_days > 0 else np.array([])
    esperado = month_to_date + float(futuro.sum())
    margen = 1.28 * model.sigma * np.sqrt(max(remaining_days, 0))
    return {
        "projection": round(esperado, 2),
        "projection_low": round(max(month_to_date, esperado - margen), 2),
        "projection_high": round(esperado + margen, 2),
        "daily_forecast": [round(float(v), 2) for v in futuro],
    }
