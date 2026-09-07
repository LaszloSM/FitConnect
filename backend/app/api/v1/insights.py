"""BI sin LLM: horas pico, proyección del mes, riesgo de abandono, stock por
agotarse y cohortes. Todo explicable y calculado sobre los datos del gym."""
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, require_role
from app.models.tenant.user_staff import UserRole
from app.services import report_data as rd

router = APIRouter(prefix="/insights", tags=["insights"], dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])


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
    return await rd.forecast(db)


@router.get("/churn-risk")
async def churn_risk(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(100, ge=1, le=500),
):
    return await rd.churn_risk(db, limit)


@router.get("/stockout")
async def stockout(db: AsyncSession = Depends(get_tenant_db_from_token)):
    return await rd.stockout(db)


@router.get("/cohorts")
async def cohorts(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    months: int = Query(6, ge=2, le=12),
):
    return await rd.cohorts(db, months)
