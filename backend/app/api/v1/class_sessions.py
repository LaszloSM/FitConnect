import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.api.deps import get_tenant_db_from_token, get_current_staff, require_perm
from app.core import permissions as perm
from app.core.timeutil import today_bogota
from app.models.tenant.class_session import ClassSession
from app.models.tenant.gym_class import GymClass
from app.models.tenant.instructor import Instructor
from app.models.tenant.member import Member
from app.models.tenant.session_booking import SessionBooking
from app.models.tenant.user_staff import UserStaff
from app.services import bookings
from app.services.class_sessions import materialize_sessions
from app.services.schedule_conflicts import find_session_conflict

router = APIRouter(prefix="/class-sessions", tags=["class_sessions"], dependencies=[Depends(require_perm(perm.CLASSES_READ))])


class BookingRequest(BaseModel):
    member_id: uuid.UUID


class AttendanceUpdate(BaseModel):
    status: str = Field(pattern="^(attended|no_show|booked)$")


class SessionPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(scheduled|cancelled|completed)$")
    #: Reemplazo para esta sesión. El id es la fuente de verdad; el texto se
    #: deriva de la ficha para que nadie invente un nombre que no existe.
    instructor_override_id: uuid.UUID | None = None
    capacity_override: int | None = Field(default=None, gt=0)


_capacity = bookings.capacity


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


@router.post("/{session_id}/bookings", status_code=201, dependencies=[Depends(require_perm(perm.CLASSES_ATTEND))])
async def book_session(
    session_id: uuid.UUID,
    payload: BookingRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    member = (await db.execute(select(Member).where(Member.id == payload.member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    return await bookings.book(db, session_id, member.id, booked_by=current_user.id)


@router.delete("/{session_id}/bookings/{booking_id}", dependencies=[Depends(require_perm(perm.CLASSES_ATTEND))])
async def cancel_booking(
    session_id: uuid.UUID,
    booking_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    return await bookings.cancel(db, session_id, booking_id)


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
    cambios = payload.model_dump(exclude_unset=True)

    if "instructor_override_id" in cambios:
        nuevo = cambios["instructor_override_id"]
        if nuevo is None:
            session.instructor_override_id = None
            session.instructor_override = None
        else:
            ficha = (await db.execute(
                select(Instructor).where(Instructor.id == nuevo)
            )).scalar_one_or_none()
            if not ficha:
                raise HTTPException(status_code=404, detail="Entrenador no encontrado")
            gc = (await db.execute(
                select(GymClass).where(GymClass.id == session.gym_class_id)
            )).scalar_one()
            choque = await find_session_conflict(
                db,
                instructor_id=ficha.id,
                session_date=session.session_date,
                start_time=session.start_time,
                duration_minutes=gc.duration_minutes,
                exclude_session_id=session.id,
            )
            if choque:
                raise HTTPException(status_code=409, detail=choque)
            session.instructor_override_id = ficha.id
            session.instructor_override = ficha.full_name
        cambios.pop("instructor_override_id")

    for field, value in cambios.items():
        setattr(session, field, value)
    await db.commit()
    await db.refresh(session)
    return {
        "id": str(session.id),
        "status": session.status,
        "instructor_override": session.instructor_override,
    }
