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

# Ventana anti-doble-registro: mismo miembro no puede registrar asistencia
# dos veces en este intervalo.
_DEDUP_WINDOW = timedelta(minutes=5)


async def _membership_status(member_id: uuid.UUID, db: AsyncSession) -> str:
    """Retorna 'ok', 'expired' o 'no_membership' — única fuente de verdad."""
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
    if (await db.execute(stmt)).scalar_one_or_none():
        return "ok"
    any_stmt = select(Membership).where(Membership.member_id == member_id).limit(1)
    return "expired" if (await db.execute(any_stmt)).scalar_one_or_none() else "no_membership"


async def _build_response(checkin: CheckIn, member: Member, db: AsyncSession) -> CheckInResponse:
    response = CheckInResponse.model_validate(checkin)
    response.member_name = member.full_name
    response.membership_status = await _membership_status(member.id, db)
    return response


async def _reject_if_duplicate(member_id: uuid.UUID, db: AsyncSession) -> None:
    cutoff = datetime.now() - _DEDUP_WINDOW
    recent = await db.execute(
        select(CheckIn)
        .where(CheckIn.member_id == member_id, CheckIn.created_at >= cutoff)
        .limit(1)
    )
    if recent.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Este miembro ya registró asistencia hace unos minutos",
        )


async def _names_by_id(member_ids: list[uuid.UUID], db: AsyncSession) -> dict[uuid.UUID, str]:
    if not member_ids:
        return {}
    result = await db.execute(
        select(Member.id, Member.full_name).where(Member.id.in_(member_ids))
    )
    return {mid: name for mid, name in result.all()}


@router.get("", response_model=list[CheckInResponse])
async def list_checkins(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    member_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(CheckIn)
    if member_id:
        stmt = stmt.where(CheckIn.member_id == member_id)
    stmt = stmt.order_by(desc(CheckIn.created_at)).limit(limit).offset(offset)
    checkins = (await db.execute(stmt)).scalars().all()
    names = await _names_by_id([c.member_id for c in checkins], db)
    responses = []
    for c in checkins:
        data = CheckInResponse.model_validate(c)
        data.member_name = names.get(c.member_id)
        responses.append(data)
    return responses


@router.get("/today", response_model=list[CheckInResponse])
async def list_today_checkins(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(100, ge=1, le=200),
):
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    stmt = (
        select(CheckIn)
        .where(CheckIn.created_at >= today_start, CheckIn.created_at < today_end)
        .order_by(desc(CheckIn.created_at))
        .limit(limit)
    )
    checkins = (await db.execute(stmt)).scalars().all()
    names = await _names_by_id([c.member_id for c in checkins], db)
    responses = []
    for c in checkins:
        data = CheckInResponse.model_validate(c)
        data.member_name = names.get(c.member_id)
        responses.append(data)
    return responses


@router.post("", response_model=CheckInResponse, status_code=201)
async def create_checkin(
    payload: CheckInCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    member = (await db.execute(select(Member).where(Member.id == payload.member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    await _reject_if_duplicate(member.id, db)

    checkin = CheckIn(member_id=member.id, type=CheckInType.entry, notes=payload.notes)
    db.add(checkin)
    await db.commit()
    await db.refresh(checkin)
    return await _build_response(checkin, member, db)


@router.post("/qr/{qr_code}", response_model=CheckInResponse, status_code=201)
async def checkin_by_qr(
    qr_code: str,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Check-in por código QR del carné — devuelve quién entró y su estado."""
    member = (await db.execute(select(Member).where(Member.qr_code == qr_code))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="QR no válido o miembro no encontrado")

    await _reject_if_duplicate(member.id, db)

    checkin = CheckIn(member_id=member.id, type=CheckInType.entry)
    db.add(checkin)
    await db.commit()
    await db.refresh(checkin)
    return await _build_response(checkin, member, db)
