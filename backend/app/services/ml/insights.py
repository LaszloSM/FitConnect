"""Lo que la pantalla y los reportes consultan: modelo si lo hay, reglas si no.

Cada respuesta dice con qué se calculó (`method`). Un número sin origen no se
usa para decidir, y un gimnasio nuevo tiene que seguir viendo algo útil.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota, utc_day_bounds
from app.models.tenant.inventory import StockMovement
from app.models.tenant.member import Member
from app.services import insights_engine as eng
from app.services import report_data as rd
from app.services.ml import churn, data, registry
from app.services.ml import forecast as fc
from app.services.ml import inventory as inv

RULES = "reglas"
MODEL = "modelo"


async def forecast(db: AsyncSession) -> dict:
    base = await rd.forecast(db)
    base["method"] = RULES
    base["method_detail"] = "Ritmo del mes combinado con el promedio de los 3 meses previos."
    # Si en la prueba nocturna el modelo erró más que el ritmo lineal, no se usa:
    # un modelo peor que la regla simple solo agrega apariencia de precisión.
    fila = await registry.get(db, "forecast")
    if fila and fila.status == "weak":
        base["method_detail"] += f" {fila.detail}"
        base["backtest"] = (fila.metrics or {}).get("backtest")
        return base
    serie = await data.revenue_series(db, today_bogota())
    try:
        modelo = fc.fit(serie)
    except ValueError as exc:
        base["method_detail"] += f" El modelo no se usa todavía: {exc}."
        return base
    restantes = base["days_in_month"] - base["elapsed_days"]
    base.update(fc.project_month(modelo, base["month_to_date"], restantes, skip=1))
    prev = base.get("avg_previous_months")
    base["vs_previous_pct"] = round((base["projection"] - prev) / prev * 100, 1) if prev else None
    base["method"] = MODEL
    base["method_detail"] = f"Holt-Winters con estacionalidad semanal, ajustado con {len(serie)} días de ingresos."
    if fila and fila.metrics:
        base["backtest"] = fila.metrics.get("backtest")
    return base


async def churn_risk(db: AsyncSession, limit: int = 100) -> list[dict]:
    modelo = registry.load_churn(await registry.get(db, "churn"))
    if modelo is None:
        filas = await rd.churn_risk(db, limit)
        for f in filas:
            f["method"] = RULES
            f["probability"] = None
        return filas

    h = await data.load_history(db, today_bogota(), days=200)
    ids, X = data.current_matrix(h)
    if not ids:
        return []
    matriz = np.array(X)
    probas = churn.predict(modelo, matriz)
    salida = []
    for i, mid in enumerate(ids):
        score = int(round(float(probas[i]) * 100))
        if score < 35:
            continue
        info = h.members[mid]
        actual = data.current_stint(h, mid)
        vigente = bool(actual and actual.start <= h.today <= actual.end)
        dias_sin = int(matriz[i, 0]) if matriz[i, 0] < data.NEVER else None
        salida.append({
            "member_id": str(mid), "full_name": info.full_name, "phone": info.phone,
            "score": score, "probability": round(float(probas[i]), 3), "level": eng.churn_level(score),
            "reasons": churn.explain(modelo, matriz[i]) or ["patrón parecido al de socios que se fueron"],
            "days_since_last_visit": dias_sin,
            "membership_status": "active" if vigente else ("expired" if actual else "no_membership"),
            "plan_name": actual.plan_name if actual else None,
            "end_date": actual.end.isoformat() if actual else None,
            "method": MODEL,
        })
    salida.sort(key=lambda r: -r["score"])
    return salida[:limit]


async def churn_drivers(db: AsyncSession) -> dict:
    fila = await registry.get(db, "churn")
    if not fila or fila.status != "trained":
        return {"method": RULES, "drivers": [], "metrics": {}, "detail": fila.detail if fila else None}
    metricas = dict(fila.metrics or {})
    return {"method": MODEL, "drivers": metricas.pop("drivers", []), "metrics": metricas, "detail": None}


async def stockout(db: AsyncSession) -> list[dict]:
    """Stock por agotarse con velocidad suavizada y patrón semanal.

    Parte de las filas de `report_data.stockout` (mismas claves) y recalcula
    velocidad y fecha con las ventas diarias de 60 días. Un producto sin ventas
    en ese lapso conserva el cálculo plano.
    """
    filas = await rd.stockout(db)
    if not filas:
        return filas
    hoy = today_bogota()
    desde, _ = utc_day_bounds(hoy - timedelta(days=60))
    ventas: dict[str, dict[date, float]] = {}
    for pid, ts, qty in (await db.execute(
        select(StockMovement.product_id, StockMovement.created_at, StockMovement.quantity)
        .where(StockMovement.type == "sale", StockMovement.created_at >= desde)
    )).all():
        d = rd._to_bogota(ts).date()
        por_dia = ventas.setdefault(str(pid), {})
        por_dia[d] = por_dia.get(d, 0.0) + float(-qty)
    dias = [hoy - timedelta(days=59 - i) for i in range(60)]
    for f in filas:
        por_dia = ventas.get(f["product_id"])
        if not por_dia:
            f["method"] = RULES
            continue
        unidades = [por_dia.get(d, 0.0) for d in dias]
        velocidad = inv.smoothed_velocity(unidades)
        agota = inv.run_out(f["stock"], velocidad, inv.weekday_profile(dias, unidades), hoy)
        f["daily_velocity"] = round(velocidad, 2)
        f["runs_out_on"] = agota.isoformat() if agota else None
        f["days_left"] = (agota - hoy).days if agota else None
        f["method"] = MODEL
    filas.sort(key=lambda x: (x["days_left"] is None, x["days_left"] if x["days_left"] is not None else 0))
    return filas


async def stored_result(db: AsyncSession, name: str) -> dict:
    fila = await registry.get(db, name)
    if not fila:
        return {"status": "never_trained", "detail": "Se entrena cada noche con los datos del gimnasio.", "trained_at": None, "result": None}
    return {"status": fila.status, "detail": fila.detail, "trained_at": fila.trained_at.isoformat(), "result": fila.result, "metrics": fila.metrics}


async def segments_with_members(db: AsyncSession, per_group: int = 30) -> dict:
    """Los grupos con nombre y teléfono de sus socios, para poder escribirles."""
    base = await stored_result(db, "segments")
    grupos = (base.get("result") or {}).get("groups") or []
    ids = {mid for g in grupos for mid in g.get("member_ids", [])[:per_group]}
    socios = {}
    if ids:
        filas = (await db.execute(select(Member.id, Member.full_name, Member.phone).where(Member.id.in_(list(ids))))).all()
        socios = {str(i): {"member_id": str(i), "full_name": n, "phone": p} for i, n, p in filas}
    for g in grupos:
        g["members"] = [socios[mid] for mid in g.pop("member_ids", [])[:per_group] if mid in socios]
    return base
