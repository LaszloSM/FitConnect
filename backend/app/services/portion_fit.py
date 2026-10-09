"""Cantidades de un día de comidas ajustadas a las metas.

Con los alimentos ya elegidos (por las reglas del plan automático o por la IA)
busca los gramos que mejor cumplen a la vez las calorías, la proteína, la
grasa y los carbohidratos del día, y el reparto de calorías entre comidas, sin
salirse de porciones razonables para cada alimento.

Es un problema de mínimos cuadrados con límites (`scipy.optimize.lsq_linear`):
cada error se mide en proporción a su meta y pesa según su importancia. Las
calorías y la proteína mandan; los carbohidratos son los que más ceden.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import lsq_linear

from app.models.app import Food

WEIGHTS = {"kcal": 4.0, "protein_g": 3.0, "fat_g": 2.0, "carbs_g": 1.0}
#: Peso del reparto de calorías por comida: que el almuerzo no se coma el día.
SLOT_WEIGHT = 1.2
#: Tirón suave hacia la porción habitual de cada alimento, para repartir el
#: ajuste entre todos en vez de cargarlo a uno solo (350 g de quinua).
TYPICAL_WEIGHT = 0.1


@dataclass
class Item:
    food: Food
    lo: float
    hi: float
    #: Múltiplo al que se redondea (50 para huevos enteros, 5 para casi todo).
    step: float = 5.0
    #: Porción habitual: entre dos soluciones parecidas se prefiere la más cercana a ella.
    typical: float | None = None


@dataclass
class Slot:
    share: float | None
    items: list[Item] = field(default_factory=list)


def _per_gram(food: Food, key: str) -> float:
    return float(getattr(food, key) or 0) / 100


def fit(slots: list[Slot], targets: dict) -> list[list[float]]:
    """Gramos por comida y alimento, en el mismo orden de `slots`."""
    cols = [(si, it) for si, s in enumerate(slots) for it in s.items]
    if not cols:
        return [[] for _ in slots]
    rows: list[list[float]] = []
    rhs: list[float] = []
    for key, w in WEIGHTS.items():
        goal = float(targets.get(key) or 0)
        if goal > 0:
            rows.append([w * _per_gram(it.food, key) / goal for _, it in cols])
            rhs.append(w)
    kcal_goal = float(targets.get("kcal") or 0)
    if kcal_goal > 0:
        for si, s in enumerate(slots):
            if s.share:
                goal = kcal_goal * s.share
                rows.append([SLOT_WEIGHT * _per_gram(it.food, "kcal") / goal if sj == si else 0.0 for sj, it in cols])
                rhs.append(SLOT_WEIGHT)
    for n, (_, it) in enumerate(cols):
        typical = it.typical or (it.lo + it.hi) / 2
        rows.append([TYPICAL_WEIGHT / typical if m == n else 0.0 for m in range(len(cols))])
        rhs.append(TYPICAL_WEIGHT)
    lo = np.array([it.lo for _, it in cols], dtype=float)
    hi = np.array([max(it.hi, it.lo + 1e-6) for _, it in cols], dtype=float)
    res = lsq_linear(np.array(rows), np.array(rhs), bounds=(lo, hi), method="bvls")
    out: list[list[float]] = [[] for _ in slots]
    for (si, it), g in zip(cols, res.x):
        step = it.step or 5.0
        low = max(step, math.ceil(it.lo / step - 1e-9) * step)
        high = max(low, math.floor(it.hi / step + 1e-9) * step)
        out[si].append(float(min(high, max(low, round(float(g) / step) * step))))
    return out


def totals(slots: list[Slot], grams: list[list[float]]) -> dict[str, float]:
    keys = ("kcal", "protein_g", "carbs_g", "fat_g")
    return {k: sum(_per_gram(it.food, k) * g for s, gs in zip(slots, grams) for it, g in zip(s.items, gs)) for k in keys}
