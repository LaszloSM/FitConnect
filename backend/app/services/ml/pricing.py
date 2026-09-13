"""Elasticidad del precio por plan sobre las renovaciones históricas.

Solo se puede medir si el plan tuvo al menos dos precios con suficientes
membresías cada uno. Sin eso no hay nada que estimar, y se dice.
"""
from __future__ import annotations

MIN_PER_PRICE = 8


def plan_elasticity(rows: list[dict]) -> list[dict]:
    """rows: [{plan_name, price, renewed(bool)}] de membresías ya terminadas."""
    por_plan: dict[str, dict[float, list[bool]]] = {}
    for r in rows:
        precio = round(float(r["price"]), -2)
        por_plan.setdefault(r["plan_name"], {}).setdefault(precio, []).append(bool(r["renewed"]))

    salida = []
    for plan, precios in sorted(por_plan.items()):
        puntos = [
            {"price": p, "count": len(v), "renewal_rate": round(sum(v) / len(v) * 100, 1)}
            for p, v in sorted(precios.items()) if len(v) >= MIN_PER_PRICE
        ]
        total = sum(len(v) for v in precios.values())
        if len(puntos) < 2:
            salida.append({
                "plan_name": plan, "memberships": total, "points": puntos, "elasticity": None,
                "reading": "Siempre tuvo el mismo precio (o muy pocas ventas por precio): no hay cómo medir la reacción.",
            })
            continue
        bajo, alto = puntos[0], puntos[-1]
        r1, r2 = bajo["renewal_rate"], alto["renewal_rate"]
        p1, p2 = bajo["price"], alto["price"]
        media_r = (r1 + r2) / 2
        if media_r == 0:
            elasticidad = 0.0
        else:
            elasticidad = ((r2 - r1) / media_r) / ((p2 - p1) / ((p1 + p2) / 2))
        elasticidad = round(elasticidad, 2)
        if elasticidad > -0.3:
            lectura = "La renovación casi no reaccionó al precio: hay margen para subirlo con cuidado."
        elif elasticidad > -1:
            lectura = "Subir el precio baja algo la renovación, menos de lo que sube el precio: el ingreso neto sube."
        else:
            lectura = "La renovación cae más de lo que sube el precio: una subida probablemente reduce el ingreso."
        salida.append({"plan_name": plan, "memberships": total, "points": puntos, "elasticity": elasticidad, "reading": lectura})
    return salida
