"""Catálogo de caja: categorías de egreso y denominaciones del peso.

Las categorías vivían en cuatro sitios (validación, reporte, caja y pestaña de
ingresos) y ya habían divergido. El frontend las repite en
`payments/shared.ts` y `test_cash_catalog_contract.py` compara las dos listas.
"""
from decimal import Decimal

from app.services.refunds import REFUND_EXPENSE_CATEGORY

EXPENSE_LABELS: dict[str, str] = {
    "servicios": "Servicios",
    "nomina": "Nómina",
    "insumos": "Insumos",
    REFUND_EXPENSE_CATEGORY: "Devoluciones",
    "otros": "Otros",
}

# La devolución no se escoge a mano: el cuadre excluye esa categoría porque el
# ingreso ya viene neto, así que un egreso manual de "devolución" nunca bajaba
# el esperado y el cierre acusaba un sobrante que no existía.
MANUAL_EXPENSE_CATEGORIES: frozenset[str] = frozenset(EXPENSE_LABELS) - {REFUND_EXPENSE_CATEGORY}

# Billetes y monedas en circulación. El billete de 1.000 y la moneda de 1.000
# valen lo mismo: para el arqueo solo importa el valor.
DENOMINATIONS: tuple[int, ...] = (100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50)
DENOMINATION_KEYS: frozenset[str] = frozenset(str(d) for d in DENOMINATIONS)


def denominations_total(counts: dict[str, int]) -> Decimal:
    return Decimal(sum(int(value) * int(qty) for value, qty in counts.items()))
