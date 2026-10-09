"""Festivos de Colombia (Ley 51 de 1983, "Ley Emiliani").

Un festivo cambia el aforo y la caja de un gimnasio tanto como un domingo: sin
esto, el aforo esperado de un lunes festivo salía igual al de un lunes normal.
"""
from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache

# Fijos: no se mueven.
_FIXED = [(1, 1), (5, 1), (7, 20), (8, 7), (12, 8), (12, 25)]
# Se trasladan al lunes siguiente si no caen en lunes.
_MOVABLE = [(1, 6), (3, 19), (6, 29), (8, 15), (10, 12), (11, 1), (11, 11)]
# Relativos a la Pascua: (días desde el domingo de Pascua, ¿se pasa a lunes?)
_EASTER = [(-3, False), (-2, False), (43, True), (64, True), (71, True)]


def _easter(year: int) -> date:
    """Domingo de Pascua (algoritmo de Meeus/Jones/Butcher)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month, day = divmod(h + l_ - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _next_monday(d: date) -> date:
    return d + timedelta(days=(7 - d.weekday()) % 7)


@lru_cache(maxsize=64)
def holidays(year: int) -> frozenset[date]:
    out = {date(year, m, d) for m, d in _FIXED}
    out |= {_next_monday(date(year, m, d)) for m, d in _MOVABLE}
    easter = _easter(year)
    for offset, move in _EASTER:
        d = easter + timedelta(days=offset)
        out.add(_next_monday(d) if move else d)
    return frozenset(out)


def is_holiday(d: date) -> bool:
    return d in holidays(d.year)
