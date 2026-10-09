"""Ingresos del mes: Holt-Winters aditivo con estacionalidad semanal, más el
efecto de la quincena y de los festivos cuando el historial los muestra.

Un gimnasio cobra distinto un lunes que un domingo, el 15 y el 30 (días de pago
en Colombia) que a mitad de quincena, y casi nada un festivo; el ritmo lineal de
`insights_engine.revenue_forecast` no sabe nada de eso. Implementado a mano sobre
numpy: statsmodels pesaría más que todo el backend en una EC2 de 2 GB.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from itertools import product

import numpy as np

from app.services.ml.holidays import is_holiday

SEASON = 7
MIN_DAYS = 8 * SEASON
_ALPHAS = (0.1, 0.3, 0.5)
_BETAS = (0.0, 0.05, 0.15)
_GAMMAS = (0.05, 0.2, 0.4)


#: Días de pago: quincena (15) y fin de mes, con el día antes y el siguiente.
def is_payday(d: date) -> bool:
    fin = (d.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    return d.day in (14, 15, 16, 1) or d.day >= fin.day - 1


@dataclass
class HoltWinters:
    level: float
    trend: float
    seasonals: list[float]
    n: int
    sigma: float
    params: tuple[float, float, float]
    #: Último día de la serie (si se conoce, se aplican quincena y festivos).
    last_date: date | None = None
    effects: dict = field(default_factory=dict)

    def forecast(self, horizon: int) -> np.ndarray:
        pasos = np.arange(1, horizon + 1)
        estacional = np.array([self.seasonals[(self.n + i - 1) % SEASON] for i in pasos])
        base = self.level + pasos * self.trend + estacional
        if self.last_date is not None and self.effects:
            for i in range(horizon):
                d = self.last_date + timedelta(days=i + 1)
                if is_holiday(d):
                    base[i] += self.effects.get("holiday", 0.0)
                elif is_payday(d):
                    base[i] += self.effects.get("payday", 0.0)
        return np.clip(base, 0, None)


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


def _effect(resid: np.ndarray, mask: np.ndarray, min_days: int = 4) -> float:
    """Cuánto se desvían en promedio esos días de lo que la semana explica. Solo
    se usa si se distingue del ruido (dos errores estándar)."""
    if mask.sum() < min_days or (~mask).sum() < min_days:
        return 0.0
    diff = resid[mask].mean() - resid[~mask].mean()
    se = np.sqrt(resid[mask].var(ddof=1) / mask.sum() + resid[~mask].var(ddof=1) / (~mask).sum())
    return float(diff) if se > 0 and abs(diff) > 2 * se else 0.0


def _fit_hw(y: np.ndarray):
    mejor = None
    for a, b, g in product(_ALPHAS, _BETAS, _GAMMAS):
        level, trend, seasonals, fitted = _run(y, a, b, g)
        err = y[SEASON:] - fitted[SEASON:]
        sse = float((err ** 2).sum())
        if mejor is None or sse < mejor[0]:
            mejor = (sse, level, trend, seasonals, err, (a, b, g))
    return mejor[1:]


def fit(daily: list[float] | np.ndarray, last_date: date | None = None) -> HoltWinters:
    """`last_date`: fecha del último valor de la serie. Con ella se estiman el
    efecto de la quincena y de los festivos por backfitting: se estima el efecto,
    se le quita a la serie y se reajusta la semana, varias veces. Sin eso la
    estacionalidad absorbe parte de los picos y el efecto se cuenta dos veces."""
    y = np.asarray(daily, dtype=float)
    if len(y) < MIN_DAYS:
        raise ValueError(f"hacen falta {MIN_DAYS} días de historial (hay {len(y)})")
    if last_date is None:
        level, trend, seasonals, err, params = _fit_hw(y)
        return HoltWinters(level, trend, seasonals, len(y), float(err.std(ddof=1)), params)

    dias = [last_date - timedelta(days=len(y) - 1 - i) for i in range(len(y))]
    fest = np.array([is_holiday(d) for d in dias])
    pago = np.array([is_payday(d) and not is_holiday(d) for d in dias])
    effects = {"holiday": 0.0, "payday": 0.0}
    for _ in range(4):
        ajustada = y - effects["holiday"] * fest - effects["payday"] * pago
        level, trend, seasonals, err, params = _fit_hw(ajustada)
        f, p = fest[SEASON:], pago[SEASON:]
        effects["holiday"] += _effect(err, f, min_days=2)
        effects["payday"] += _effect(err[~f], p[~f])
    ajustada = y - effects["holiday"] * fest - effects["payday"] * pago
    level, trend, seasonals, err, params = _fit_hw(ajustada)
    return HoltWinters(level, trend, seasonals, len(y), float(err.std(ddof=1)), params, last_date, effects)


def backtest(daily: list[float] | np.ndarray, holdout: int = 14, windows: int = 4,
             last_date: date | None = None) -> dict:
    """Prueba hacia atrás en varias ventanas de `holdout` días (origen rodante):
    el modelo contra el ritmo lineal que usaba la pantalla antes, y cuántas veces
    el total real cayó dentro de la banda del 80 % que muestra la pantalla."""
    y = np.asarray(daily, dtype=float)
    m_err, p_err, dentro, gana, ratios = [], [], 0, 0, []
    for k in range(1, windows + 1):
        fin = len(y) - holdout * (k - 1)
        corte = fin - holdout
        if corte < MIN_DAYS:
            break
        entreno, real = y[:corte], y[corte:fin]
        total = real.sum()
        if total <= 0:
            continue
        ult = last_date - timedelta(days=len(y) - corte) if last_date else None
        modelo = fit(entreno, ult)
        pred = modelo.forecast(holdout).sum()
        ritmo = entreno[-28:].mean() * holdout
        margen = 1.28 * modelo.sigma * np.sqrt(holdout)
        if modelo.sigma > 0:
            ratios.append(abs(pred - total) / (modelo.sigma * np.sqrt(holdout)))
        m_err.append(abs(pred - total) / total * 100)
        p_err.append(abs(ritmo - total) / total * 100)
        dentro += int(pred - margen <= total <= pred + margen)
        gana += int(m_err[-1] < p_err[-1])
    if not m_err:
        return {"model_error_pct": None, "pace_error_pct": None, "windows": 0}
    return {
        "model_error_pct": round(float(np.mean(m_err)), 1),
        "pace_error_pct": round(float(np.mean(p_err)), 1),
        "windows": len(m_err),
        "model_wins": gana,
        "band_coverage_pct": round(dentro / len(m_err) * 100),
        # Cuánto hay que ensanchar la banda teórica para que cubra lo que de
        # verdad pasó en estas pruebas (los errores de varios días no son
        # independientes: la teoría se queda corta).
        "band_scale": round(float(np.clip(np.percentile(ratios, 80) / 1.28, 1.0, 5.0)), 2) if ratios else 1.0,
    }


def project_month(model: HoltWinters, month_to_date: float, remaining_days: int, skip: int = 0,
                  band_scale: float = 1.0) -> dict:
    """Cierre del mes con una banda del 80 %.

    `skip`: pasos del pronóstico que ya están dentro de lo cobrado (el modelo se
    ajusta hasta ayer y hoy ya cuenta en `month_to_date`).
    `band_scale`: ensanche medido en la prueba hacia atrás (`backtest`).
    """
    futuro = model.forecast(remaining_days + skip)[skip:] if remaining_days > 0 else np.array([])
    esperado = month_to_date + float(futuro.sum())
    margen = 1.28 * band_scale * model.sigma * np.sqrt(max(remaining_days, 0))
    return {
        "projection": round(esperado, 2),
        "projection_low": round(max(month_to_date, esperado - margen), 2),
        "projection_high": round(esperado + margen, 2),
        "daily_forecast": [round(float(v), 2) for v in futuro],
    }
