"""Registro de check-ins: única puerta de entrada para recepción, QR y kiosko.

Un adaptador futuro de hardware (biometría ZKTeco, torniquete por relé) llamaría
register_checkin(db, member, source="biometric") sin tocar nada más.
"""
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota, now_bogota, utcnow_naive
from app.models.tenant.checkin import CheckIn, CheckInType
from app.models.tenant.class_session import ClassSession
from app.models.tenant.gym_class import GymClass
from app.models.tenant.member import Member
from app.models.tenant.membership import Membership
from app.models.tenant.session_booking import SessionBooking
from app.services.gym_settings import get_gym_settings
from app.services.membership_status import effective_status
from app.services import realtime
from app.services.storage import resolve_media_url

# Ventana anti-doble-registro: mismo miembro no puede registrar asistencia
# dos veces en este intervalo (no aplica entre un denegado y su override).
DEDUP_WINDOW = timedelta(minutes=5)
DAY_PASS_DEDUP_WINDOW = timedelta(minutes=2)
# Un check-in marca asistencia a clases que empiezan dentro de esta ventana.
CLASS_ATTEND_WINDOW = timedelta(minutes=60)

_ALLOWED_STATUSES = {"ok", "in_grace"}


class DuplicateCheckin(Exception):
    pass


async def checkin_status(member_id: uuid.UUID, db: AsyncSession, grace_days: int) -> tuple[str, Membership | None]:
    """(estado para check-in, membresía más relevante).
    Estado: ok | in_grace | scheduled | expired | frozen | no_membership.
    Un pase del día activo para hoy vale como 'ok' cuando ninguna membresía da acceso."""
    from app.services.day_passes import active_pass_today
    today = today_bogota()
    memberships = (await db.execute(
        select(Membership).where(Membership.member_id == member_id)
        .order_by(desc(Membership.end_date))
    )).scalars().all()
    if not memberships:
        if await active_pass_today(db, member_id):
            return "ok", None
        return "no_membership", None
    best = "no_membership"
    best_membership = memberships[0]
    priority = {"ok": 6, "in_grace": 5, "frozen": 4, "scheduled": 3, "expired": 2, "cancelled": 1, "no_membership": 0}
    for m in memberships:
        st = effective_status(m, today=today, grace_days=grace_days)
        st = "ok" if st == "active" else st
        if priority.get(st, 0) > priority.get(best, 0):
            best = st
            best_membership = m
    # Solo membresías canceladas = sin membresía (el Literal del response no
    # admite "cancelled" y para el negocio es el mismo estado)
    if best == "cancelled":
        best = "no_membership"
    if best not in _ALLOWED_STATUSES and await active_pass_today(db, member_id):
        # Socio vencido/congelado que compró un pase para hoy: entra por el pase
        return "ok", None
    return best, best_membership


def decision_for(status: str) -> tuple[str, str | None]:
    if status in _ALLOWED_STATUSES:
        return "allowed", None
    return "denied", status if status != "cancelled" else "no_membership"


async def _reject_if_duplicate(member_id: uuid.UUID, db: AsyncSession, window: timedelta = DEDUP_WINDOW) -> None:
    cutoff = utcnow_naive() - window
    recent = await db.execute(
        select(CheckIn)
        .where(
            CheckIn.member_id == member_id,
            CheckIn.created_at >= cutoff,
            CheckIn.decision != "denied",
        )
        .limit(1)
    )
    if recent.scalar_one_or_none():
        raise DuplicateCheckin("Este miembro ya registró asistencia hace unos minutos")


async def _auto_attend_class(member_id: uuid.UUID, db: AsyncSession) -> dict | None:
    """Si el miembro tiene reserva en una sesión de hoy que empieza dentro de
    ±60 min, la marca asistida y devuelve los datos de la clase."""
    now = now_bogota()
    today = now.date()
    rows = (await db.execute(
        select(SessionBooking, ClassSession, GymClass.name)
        .join(ClassSession, SessionBooking.session_id == ClassSession.id)
        .join(GymClass, ClassSession.gym_class_id == GymClass.id)
        .where(
            SessionBooking.member_id == member_id,
            SessionBooking.status == "booked",
            ClassSession.session_date == today,
            ClassSession.status == "scheduled",
        )
    )).all()
    for booking, session, class_name in rows:
        start = datetime.combine(today, session.start_time, tzinfo=now.tzinfo)
        if abs((start - now).total_seconds()) <= CLASS_ATTEND_WINDOW.total_seconds():
            booking.status = "attended"
            return {
                "class_name": class_name,
                "start_time": session.start_time.strftime("%H:%M"),
            }
    return None


async def register_checkin(
    db: AsyncSession,
    member: Member,
    source: str = "reception",
    db_name: str | None = None,
) -> tuple[CheckIn, str, dict | None]:
    """Registra el check-in (allowed/denied según membresía), marca asistencia a
    clase si aplica y publica el evento en vivo para recepción.
    Devuelve (checkin, status, upcoming_class). NO hace commit."""
    gym = await get_gym_settings(db)
    status, membership = await checkin_status(member.id, db, gym.grace_days)
    decision, denial_reason = decision_for(status)

    if decision == "allowed":
        # Pase del día: ingresos ilimitados, solo se evita el doble toque accidental
        await _reject_if_duplicate(member.id, db, window=DAY_PASS_DEDUP_WINDOW if membership is None else DEDUP_WINDOW)

    checkin = CheckIn(
        member_id=member.id,
        type=CheckInType.entry,
        decision=decision,
        denial_reason=denial_reason,
        source=source,
    )
    db.add(checkin)

    upcoming_class = None
    if decision == "allowed":
        upcoming_class = await _auto_attend_class(member.id, db)

    publish_event(db_name, member, status, decision, denial_reason, membership, source, upcoming_class)
    return checkin, status, upcoming_class


def publish_event(
    db_name: str | None,
    member: Member,
    status: str,
    decision: str,
    denial_reason: str | None,
    membership: Membership | None,
    source: str,
    upcoming_class: dict | None,
) -> None:
    if not db_name:
        return
    today = today_bogota()
    realtime.publish(db_name, {
        "type": "checkin",
        "decision": decision,
        "denial_reason": denial_reason,
        "member_id": str(member.id),
        "member_name": member.full_name,
        "photo_url": resolve_media_url(member.photo_url),
        "membership_status": status,
        "day_pass": status == "ok" and membership is None,
        "plan_name": membership.plan_name if membership else ("Pase del día" if status == "ok" else None),
        "amount_due": str(membership.price) if membership and status in ("expired", "in_grace") else None,
        "days_overdue": max((today - membership.end_date).days, 0) if membership else None,
        "upcoming_class": upcoming_class,
        "source": source,
        "at": now_bogota().isoformat(),
    })
