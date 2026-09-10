import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.api.deps import get_tenant_db_from_token, get_current_staff, require_perm
from app.core import permissions as perm
from app.core.timeutil import today_bogota, now_bogota
from app.models.tenant.class_session import ClassSession
from app.models.tenant.gym_class import GymClass
from app.models.tenant.member import Member
from app.models.tenant.session_booking import SessionBooking
from app.models.tenant.user_staff import UserStaff
from app.services.class_access import validate_class_access
from app.services.class_sessions import materialize_sessions
from app.services.gym_settings import get_gym_settings

router = APIRouter(prefix="/class-sessions", tags=["class_sessions"], dependencies=[Depends(require_perm(perm.CLASSES_READ))])


class BookingRequest(BaseModel):
    member_id: uuid.UUID


class AttendanceUpdate(BaseModel):
    status: str = Field(pattern="^(attended|no_show|booked)$")


class SessionPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(scheduled|cancelled|completed)$")
    instructor_override: str | None = None
    capacity_override: int | None = Field(default=None, gt=0)


def _capacity(session: ClassSession, gym_class: GymClass) -> int:
    return session.capacity_override or gym_class.max_capacity


@router.get("")
async def list_sessions(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    location_id: uuid.UUID | None = Query(None),
):
    start = date_from or today_bogota()
    end = date_to or (start + timedelta(days=7))
    stmt = (
        select(ClassSession, GymClass)
        .join(GymClass, GymClass.id == ClassSession.gym_class_id)
        .where(ClassSession.session_date >= start, ClassSession.session_date <= end)
        .order_by(ClassSession.session_date, ClassSession.start_time)
    )
    if location_id:
        stmt = stmt.where(ClassSession.location_id == location_id)
    rows = (await db.execute(stmt)).all()

    # Conteo de reservas por sesión
    session_ids = [s.id for s, _ in rows]
    counts: dict[uuid.UUID, int] = {}
    if session_ids:
        cnt = await db.execute(
            select(SessionBooking.session_id, func.count())
            .where(SessionBooking.session_id.in_(session_ids), SessionBooking.status == "booked")
            .group_by(SessionBooking.session_id)
        )
        counts = {sid: n for sid, n in cnt.all()}

    return [
        {
            "id": str(s.id),
            "gym_class_id": str(s.gym_class_id),
            "class_name": gc.name,
            "instructor": s.instructor_override or gc.instructor,
            "category": gc.category,
            "color": gc.color,
            "session_date": s.session_date.isoformat(),
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "duration_minutes": gc.duration_minutes,
            "status": s.status,
            "capacity": _capacity(s, gc),
            "booked": counts.get(s.id, 0),
            "location_id": str(s.location_id) if s.location_id else None,
        }
        for s, gc in rows
    ]


@router.post("/materialize", dependencies=[Depends(require_perm(perm.CLASSES_WRITE))])
async def materialize(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
    horizon_days: int = Query(14, ge=1, le=60),
):
    created = await materialize_sessions(db, horizon_days=horizon_days)
    return {"created": created}


@router.get("/{session_id}")
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    row = (await db.execute(
        select(ClassSession, GymClass)
        .join(GymClass, GymClass.id == ClassSession.gym_class_id)
        .where(ClassSession.id == session_id)
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    session, gc = row

    bookings = (await db.execute(
        select(SessionBooking, Member.full_name)
        .join(Member, Member.id == SessionBooking.member_id)
        .where(SessionBooking.session_id == session_id)
        .order_by(SessionBooking.waitlist_position.nulls_first(), SessionBooking.created_at)
    )).all()
    roster = [
        {
            "booking_id": str(b.id),
            "member_id": str(b.member_id),
            "member_name": name,
            "status": b.status,
            "waitlist_position": b.waitlist_position,
        }
        for b, name in bookings
    ]
    return {
        "id": str(session.id),
        "class_name": gc.name,
        "instructor": session.instructor_override or gc.instructor,
        "session_date": session.session_date.isoformat(),
        "start_time": session.start_time.isoformat() if session.start_time else None,
        "status": session.status,
        "capacity": _capacity(session, gc),
        "roster": roster,
    }


async def _locked_session(session_id: uuid.UUID, db: AsyncSession):
    """Bloquea la fila de la sesión (FOR UPDATE) para serializar reservas."""
    row = (await db.execute(
        select(ClassSession, GymClass)
        .join(GymClass, GymClass.id == ClassSession.gym_class_id)
        .where(ClassSession.id == session_id)
        .with_for_update(of=ClassSession)
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return row


@router.post("/{session_id}/bookings", status_code=201, dependencies=[Depends(require_perm(perm.CLASSES_ATTEND))])
async def book_session(
    session_id: uuid.UUID,
    payload: BookingRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    session, gc = await _locked_session(session_id, db)
    if session.status == "cancelled":
        raise HTTPException(status_code=400, detail="La sesión está cancelada")

    member = (await db.execute(select(Member).where(Member.id == payload.member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    # Validar membresía y derechos de clase del plan (in_grace permitido con aviso)
    gym = await get_gym_settings(db)
    access = await validate_class_access(db, member.id, gym.grace_days)
    if access.result == "no_membership":
        raise HTTPException(status_code=400, detail=access.detail)
    if access.result in ("no_class_access", "no_credits"):
        raise HTTPException(status_code=403, detail=access.detail)

    existing = (await db.execute(
        select(SessionBooking).where(
            SessionBooking.session_id == session_id,
            SessionBooking.member_id == member.id,
            SessionBooking.status != "cancelled",
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="El miembro ya tiene reserva en esta sesión")

    booked_count = (await db.execute(
        select(func.count()).select_from(SessionBooking).where(
            SessionBooking.session_id == session_id, SessionBooking.status == "booked"
        )
    )).scalar() or 0

    capacity = _capacity(session, gc)
    if booked_count < capacity:
        booking = SessionBooking(session_id=session_id, member_id=member.id, status="booked", booked_by=current_user.id)
    else:
        wl = (await db.execute(
            select(func.count()).select_from(SessionBooking).where(
                SessionBooking.session_id == session_id, SessionBooking.status == "waitlisted"
            )
        )).scalar() or 0
        booking = SessionBooking(
            session_id=session_id, member_id=member.id, status="waitlisted",
            waitlist_position=wl + 1, booked_by=current_user.id,
        )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    remaining = access.credits_remaining
    return {
        "booking_id": str(booking.id),
        "status": booking.status,
        "waitlist_position": booking.waitlist_position,
        # None = ilimitadas; ya descontando esta reserva
        "credits_remaining": remaining - 1 if remaining is not None else None,
    }


@router.delete("/{session_id}/bookings/{booking_id}", dependencies=[Depends(require_perm(perm.CLASSES_ATTEND))])
async def cancel_booking(
    session_id: uuid.UUID,
    booking_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    await _locked_session(session_id, db)
    booking = (await db.execute(
        select(SessionBooking).where(SessionBooking.id == booking_id, SessionBooking.session_id == session_id)
    )).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    was_booked = booking.status == "booked"
    booking.status = "cancelled"
    booking.cancelled_at = now_bogota()

    promoted = None
    if was_booked:
        # Promover el primer waitlisted (misma transacción/lock de la sesión)
        next_wl = (await db.execute(
            select(SessionBooking)
            .where(SessionBooking.session_id == session_id, SessionBooking.status == "waitlisted")
            .order_by(SessionBooking.waitlist_position)
            .limit(1)
        )).scalar_one_or_none()
        if next_wl:
            next_wl.status = "booked"
            next_wl.waitlist_position = None
            promoted = str(next_wl.member_id)
    await db.commit()
    return {"cancelled": True, "promoted_member_id": promoted}


@router.patch("/{session_id}/bookings/{booking_id}", dependencies=[Depends(require_perm(perm.CLASSES_ATTEND))])
async def mark_attendance(
    session_id: uuid.UUID,
    booking_id: uuid.UUID,
    payload: AttendanceUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
):
    booking = (await db.execute(
        select(SessionBooking).where(SessionBooking.id == booking_id, SessionBooking.session_id == session_id)
    )).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    booking.status = payload.status
    await db.commit()
    return {"booking_id": str(booking.id), "status": booking.status}


@router.patch("/{session_id}", dependencies=[Depends(require_perm(perm.CLASSES_WRITE))])
async def patch_session(
    session_id: uuid.UUID,
    payload: SessionPatch,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
):
    session = (await db.execute(select(ClassSession).where(ClassSession.id == session_id))).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    await db.commit()
    await db.refresh(session)
    return {"id": str(session.id), "status": session.status}
