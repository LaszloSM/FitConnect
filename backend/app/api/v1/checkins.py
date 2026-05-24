import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import date, datetime, timedelta

from app.api.deps import get_tenant_db_from_token
from app.schemas.member import CheckInCreate, CheckInResponse
from app.models.tenant.checkin import CheckIn, CheckInType
from app.models.tenant.member import Member
from app.models.tenant.membership import Membership, MembershipStatus

router = APIRouter(prefix="/checkins", tags=["checkins"])


async def _get_membership_status(member_id: uuid.UUID, db: AsyncSession) -> str:
    """Retorna 'ok', 'expired' o 'no_membership'."""
    today = date.today()
    stmt = (
        select(Membership)
        .where(
            Membership.member_id == member_id,
            Membership.status == MembershipStatus.active,
            Membership.end_date >= today,
        )
        .limit(1)
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        return "ok"

    # Verificar si tiene membresía pero vencida
    any_stmt = select(Membership).where(Membership.member_id == member_id).limit(1)
    any_result = await db.execute(any_stmt)
    return "expired" if any_result.scalar_one_or_none() else "no_membership"


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
    member_result = await db.execute(select(Member).where(Member.id == payload.member_id))
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    checkin = CheckIn(**payload.model_dump())
    db.add(checkin)
    await db.commit()
    await db.refresh(checkin)

    # Adjuntar estado de membresía al response para alertas en frontend
    membership_status = await _get_membership_status(payload.member_id, db)
    response = CheckInResponse.model_validate(checkin)
    response.membership_status = membership_status
    return response


@router.post("/qr/{qr_code}", response_model=CheckInResponse, status_code=201)
async def checkin_by_qr(
    qr_code: str,
    type: CheckInType = Query(CheckInType.entry),
    notes: str | None = Query(None),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Check-in rápido por código QR del miembro."""
    member_result = await db.execute(select(Member).where(Member.qr_code == qr_code))
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="QR no válido o miembro no encontrado")

    checkin = CheckIn(member_id=member.id, type=type, notes=notes)
    db.add(checkin)
    await db.commit()
    await db.refresh(checkin)

    membership_status = await _get_membership_status(member.id, db)
    response = CheckInResponse.model_validate(checkin)
    response.membership_status = membership_status
    return response


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
