"""Inteligencia del gimnasio: modelos entrenados con sus propios datos (sin LLM).

Donde no hay historial suficiente, cada respuesta cae a las reglas de
`insights_engine.py` y lo dice en `method`.
"""
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, require_perm
from app.core import permissions as perm
from app.core.rate_limit import limiter
from app.services import report_data as rd
from app.services.ml import insights as mli
from app.services.ml import registry

router = APIRouter(prefix="/insights", tags=["insights"], dependencies=[Depends(require_perm(perm.REPORTS_READ))])


@router.get("/peak-hours")
async def peak_hours(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
):
    a = await rd.attendance(db, from_date, to_date)
    return {"from": a["from"], "to": a["to"], **a["peak"]}


@router.get("/forecast")
async def forecast(db: AsyncSession = Depends(get_tenant_db_from_token)):
    return await mli.forecast(db)


@router.get("/churn-risk")
async def churn_risk(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(100, ge=1, le=500),
):
    return await mli.churn_risk(db, limit)


@router.get("/churn-drivers")
async def churn_drivers(db: AsyncSession = Depends(get_tenant_db_from_token)):
    return await mli.churn_drivers(db)


@router.get("/stockout")
async def stockout(db: AsyncSession = Depends(get_tenant_db_from_token)):
    return await mli.stockout(db)


@router.get("/cohorts")
async def cohorts(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    months: int = Query(6, ge=2, le=12),
):
    return await rd.cohorts(db, months)


@router.get("/models")
async def models(db: AsyncSession = Depends(get_tenant_db_from_token)):
    return await registry.status(db)


@router.get("/segments")
async def segments(db: AsyncSession = Depends(get_tenant_db_from_token)):
    return await mli.segments_with_members(db)


@router.get("/anomalies")
async def anomalies(db: AsyncSession = Depends(get_tenant_db_from_token)):
    return await mli.stored_result(db, "anomalies")


@router.get("/occupancy")
async def occupancy(db: AsyncSession = Depends(get_tenant_db_from_token)):
    return await mli.stored_result(db, "occupancy")


@router.get("/pricing")
async def pricing(db: AsyncSession = Depends(get_tenant_db_from_token)):
    return await mli.stored_result(db, "pricing")


@router.post("/models/train")
@limiter.limit("6/hour")
async def train_models(request: Request, db: AsyncSession = Depends(get_tenant_db_from_token)):
    """Reentrena ya, sin esperar al job de la noche (después de importar historial)."""
    return {"status": await registry.train_all(db), "models": await registry.status(db)}
