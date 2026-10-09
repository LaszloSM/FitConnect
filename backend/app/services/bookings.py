"""Reservas de clases: una sola regla de cupo y lista de espera para recepción y la app."""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import now_bogota
from app.models.tenant.class_session import ClassSession
from app.models.tenant.gym_class import GymClass
from app.models.tenant.session_booking import SessionBooking
from app.services.class_access import validate_class_access
from app.services.gym_settings import get_gym_settings


def capacity(session: ClassSession, gym_class: GymClass) -> int:
    return session.capacity_override or gym_class.max_capacity


async def locked_session(db: AsyncSession, session_id: uuid.UUID):
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


async def book(db: AsyncSession, session_id: uuid.UUID, member_id: uuid.UUID, *, booked_by=None,
               duplicate_detail: str = "El miembro ya tiene reserva en esta sesión") -> dict:
    """Reserva o lista de espera. Hace commit."""
    session, gc = await locked_session(db, session_id)
    if session.status == "cancelled":
        raise HTTPException(status_code=400, detail="La sesión está cancelada")

    gym = await get_gym_settings(db)
    access = await validate_class_access(db, member_id, gym.grace_days)
    if access.result == "no_membership":
        raise HTTPException(status_code=400, detail=access.detail)
    if access.result in ("no_class_access", "no_credits"):
        raise HTTPException(status_code=403, detail=access.detail)

    existing = (await db.execute(
        select(SessionBooking).where(
            SessionBooking.session_id == session_id,
            SessionBooking.member_id == member_id,
            SessionBooking.status != "cancelled",
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=duplicate_detail)

    booked_count = (await db.execute(
        select(func.count()).select_from(SessionBooking).where(
            SessionBooking.session_id == session_id, SessionBooking.status == "booked"
        )
    )).scalar() or 0

    if booked_count < capacity(session, gc):
        booking = SessionBooking(session_id=session_id, member_id=member_id, status="booked", booked_by=booked_by)
    else:
        wl = (await db.execute(
            select(func.count()).select_from(SessionBooking).where(
                SessionBooking.session_id == session_id, SessionBooking.status == "waitlisted"
            )
        )).scalar() or 0
        booking = SessionBooking(
            session_id=session_id, member_id=member_id, status="waitlisted",
            waitlist_position=wl + 1, booked_by=booked_by,
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


async def cancel(db: AsyncSession, session_id: uuid.UUID, booking_id: uuid.UUID, *,
                 member_id: uuid.UUID | None = None) -> dict:
    """Cancela y promueve al primero de la lista de espera. Con `member_id`, solo
    la reserva propia (lo de otro socio responde 404). Hace commit."""
    await locked_session(db, session_id)
    stmt = select(SessionBooking).where(SessionBooking.id == booking_id, SessionBooking.session_id == session_id)
    if member_id is not None:
        stmt = stmt.where(SessionBooking.member_id == member_id)
    booking = (await db.execute(stmt)).scalar_one_or_none()
    if not booking or booking.status == "cancelled":
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    was_booked = booking.status == "booked"
    booking.status = "cancelled"
    booking.cancelled_at = now_bogota()

    promoted = None
    if was_booked:
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
