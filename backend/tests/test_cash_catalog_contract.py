"""La caja del frontend ofrece exactamente las categorías y denominaciones del backend.

Las categorías de egreso estaban copiadas en cuatro sitios y ya se llamaban
distinto ("Devolución" en caja, "Devoluciones" en el reporte). Ahora hay una
fuente por lado y este test las ata.
"""
import os
import re
from pathlib import Path

import pytest

from app.services.cash_catalog import DENOMINATIONS, EXPENSE_LABELS, MANUAL_EXPENSE_CATEGORIES

FRONTEND = Path(os.environ.get("FRONTEND_DIR", Path(__file__).resolve().parent.parent.parent / "frontend"))
SHARED = FRONTEND / "app" / "(dashboard)" / "payments" / "shared.ts"


def _bloque(nombre: str) -> str:
    if not SHARED.exists():
        pytest.skip("El frontend no está montado en este entorno")
    fuente = SHARED.read_text(encoding="utf-8")
    m = re.search(rf"export const {nombre}\b[^=]*=\s*(\[.*?\]|\{{.*?\}})(?:\s+as\s+const)?;", fuente, re.S)
    assert m, f"No encontré {nombre} en payments/shared.ts"
    return m.group(1)


def test_expense_labels_match():
    pares = dict(re.findall(r'(\w+):\s*"([^"]+)"', _bloque("EXPENSE_LABELS")))
    assert pares == EXPENSE_LABELS


def test_manual_categories_match():
    valores = set(re.findall(r'"(\w+)"', _bloque("MANUAL_EXPENSE_CATEGORIES")))
    assert valores == set(MANUAL_EXPENSE_CATEGORIES)


def test_denominations_match():
    valores = tuple(int(v.replace("_", "")) for v in re.findall(r"\d[\d_]*", _bloque("DENOMINATIONS")))
    assert valores == DENOMINATIONS
