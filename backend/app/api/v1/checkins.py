import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import timedelta

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_db_name
from app.core.timeutil import today_bogota, utc_day_bounds, utcnow_naive
from app.schemas.member import CheckInCreate, CheckInResponse
from app.models.tenant.checkin import CheckIn, CheckInType
from app.models.tenant.member import Member
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.checkin import register_checkin, checkin_status, publish_event, DuplicateCheckin
from app.services.gym_settings import get_gym_settings

router = APIRouter(prefix="/checkins", tags=["checkins"])

# Un override solo puede convertir un denegado reciente.
_OVERRIDE_WINDOW = timedelta(minutes=10)


class OverrideRequest(BaseModel):
    member_id: uuid.UUID
    reason: str = Field(min_length=1, max_length=255)


async def _build_response(
    checkin: CheckIn, member: Member, status: str, upcoming_class: dict | None = None
) -> CheckInResponse:
    response = CheckInResponse.model_validate(checkin)
    response.member_name = member.full_name
    response.membership_status = status
    response.decision = checkin.decision
    response.denial_reason = checkin.denial_reason
    response.upcoming_class = upcoming_class
    return response


async def _names_by_id(member_ids: list[uuid.UUID], db: AsyncSession) -> dict[uuid.UUID, str]:
    if not member_ids:
        return {}
    result = await db.execute(
        select(Member.id, Member.full_name).where(Member.id.in_(member_ids))
    )
    return {mid: name for mid, name in result.all()}


async def _register(member: Member, db: AsyncSession, source: str, db_name: str | None) -> CheckInResponse:
    try:
        checkin, status, upcoming_class = await register_checkin(db, member, source=source, db_name=db_name)
    except DuplicateCheckin as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await db.commit()
    await db.refresh(checkin)
    return await _build_response(checkin, member, status, upcoming_class)


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
        data.decision = c.decision
        data.denial_reason = c.denial_reason
        responses.append(data)
    return responses


@router.get("/today", response_model=list[CheckInResponse])
async def list_today_checkins(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(100, ge=1, le=200),
):
    today_start, today_end = utc_day_bounds(today_bogota())
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
        data.decision = c.decision
        data.denial_reason = c.denial_reason
        responses.append(data)
    return responses


@router.post("", response_model=CheckInResponse, status_code=201)
async def create_checkin(
    payload: CheckInCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    db_name: str = Depends(get_db_name),
):
    member = (await db.execute(select(Member).where(Member.id == payload.member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    return await _register(member, db, source="reception", db_name=db_name)


@router.post("/qr/{qr_code}", response_model=CheckInResponse, status_code=201)
async def checkin_by_qr(
    qr_code: str,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    db_name: str = Depends(get_db_name),
):
    """Check-in por código QR del carné — devuelve quién entró y la decisión."""
    member = (await db.execute(select(Member).where(Member.qr_code == qr_code))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="QR no válido o miembro no encontrado")
    return await _register(member, db, source="qr", db_name=db_name)


@router.post("/override", response_model=CheckInResponse, status_code=201)
async def override_checkin(
    payload: OverrideRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
    db_name: str = Depends(get_db_name),
):
    """La recepcionista autoriza la entrada de un miembro recién denegado.
    Queda registrado quién autorizó y por qué."""
    member = (await db.execute(
        select(Member).where(Member.id == payload.member_id)
    )).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    cutoff = utcnow_naive() - _OVERRIDE_WINDOW
    recent_denied = (await db.execute(
        select(CheckIn)
        .where(
            CheckIn.member_id == member.id,
            CheckIn.decision == "denied",
            CheckIn.created_at >= cutoff,
        )
        .order_by(desc(CheckIn.created_at))
        .limit(1)
    )).scalar_one_or_none()
    if not recent_denied:
        raise HTTPException(status_code=400, detail="No hay un check-in denegado reciente para autorizar")

    gym = await get_gym_settings(db)
    status, _membership = await checkin_status(member.id, db, gym.grace_days)

    checkin = CheckIn(
        member_id=member.id,
        type=CheckInType.entry,
        decision="override",
        denial_reason=recent_denied.denial_reason,
        override_by=current_user.id,
        override_reason=payload.reason,
        source=recent_denied.source,
    )
    db.add(checkin)
    audit(db, current_user, "checkin.override", "member", member.id, {
        "member_name": member.full_name,
        "denial_reason": recent_denied.denial_reason,
        "reason": payload.reason,
    })
    # Notificar a las demás pantallas de recepción que el denegado ya fue autorizado
    publish_event(db_name, member, status, "override", recent_denied.denial_reason,
                  _membership, recent_denied.source, None)
    await db.commit()
    await db.refresh(checkin)
    return await _build_response(checkin, member, status)
