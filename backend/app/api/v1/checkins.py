import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import date, datetime, timedelta

from app.api.deps import get_tenant_db_from_token
from app.schemas.member import CheckInCreate, CheckInResponse
from app.models.tenant.checkin import CheckIn, CheckInType
from app.models.tenant.member import Member

router = APIRouter(prefix="/checkins", tags=["checkins"])


@router.get("", response_model=list[CheckInResponse])
async def list_checkins(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    member_id: uuid.UUID | None = Query(None),
    type: CheckInType | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(CheckIn)
    if member_id:
        stmt = stmt.where(CheckIn.member_id == member_id)
    if type:
        stmt = stmt.where(CheckIn.type == type)
    stmt = stmt.order_by(desc(CheckIn.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=CheckInResponse, status_code=201)
async def create_checkin(
    payload: CheckInCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    # Verificar que el miembro existe
    member_result = await db.execute(select(Member).where(Member.id == payload.member_id))
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    
    checkin = CheckIn(**payload.model_dump())
    db.add(checkin)
    await db.commit()
    await db.refresh(checkin)
    return checkin


@router.get("/today", response_model=list[CheckInResponse])
async def list_today_checkins(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(50, ge=1, le=100),
):
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    stmt = (
        select(CheckIn)
        .where(CheckIn.created_at >= today_start, CheckIn.created_at < today_end)
        .order_by(desc(CheckIn.created_at))
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
