"""Un entrenador no puede estar en dos salones a la vez.

Hasta ahora nada lo impedía: se podía programar Spinning 7:00 y Funcional 7:30
con el mismo instructor y los 60 minutos de la primera encima de la segunda. El
choque solo se descubría el día de la clase, con los socios ya en la puerta.
"""
import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.class_session import ClassSession
from app.models.tenant.gym_class import GymClass


def _overlap(a_start: time, a_min: int, b_start: time, b_min: int) -> bool:
    base = date(2000, 1, 1)
    a0 = datetime.combine(base, a_start)
    b0 = datetime.combine(base, b_start)
    return a0 < b0 + timedelta(minutes=b_min) and b0 < a0 + timedelta(minutes=a_min)


def _label(gc: GymClass) -> str:
    hora = gc.start_time.strftime("%H:%M") if gc.start_time else "sin hora"
    return f"{gc.name} ({hora})"


async def find_class_conflict(
    db: AsyncSession,
    *,
    instructor_id: uuid.UUID | None,
    weekdays: list | None,
    start_time: time | None,
    duration_minutes: int,
    exclude_class_id: uuid.UUID | None = None,
) -> str | None:
    """Devuelve el mensaje del choque, o None si la agenda está libre.

    Sin instructor, sin días o sin hora no hay nada que comparar: una clase a la
    que todavía le falta horario no debe ser imposible de guardar.
    """
    if not instructor_id or not weekdays or not start_time:
        return None

    stmt = select(GymClass).where(
        GymClass.instructor_id == instructor_id,
        GymClass.is_active.is_(True),
        GymClass.start_time.is_not(None),
    )
    if exclude_class_id:
        stmt = stmt.where(GymClass.id != exclude_class_id)

    dias = {int(d) for d in weekdays}
    for otra in (await db.execute(stmt)).scalars().all():
        if not otra.weekdays or not dias.intersection(int(d) for d in otra.weekdays):
            continue
        if _overlap(start_time, duration_minutes, otra.start_time, otra.duration_minutes):
            return (
                f"El entrenador ya tiene «{_label(otra)}» a esa hora. "
                "Cambia el horario o asigna otro entrenador."
            )
    return None


async def find_session_conflict(
    db: AsyncSession,
    *,
    instructor_id: uuid.UUID | None,
    session_date: date,
    start_time: time,
    duration_minutes: int,
    exclude_session_id: uuid.UUID | None = None,
) -> str | None:
    """Choque de un entrenador en una fecha concreta, contando los overrides."""
    if not instructor_id:
        return None

    stmt = (
        select(ClassSession, GymClass)
        .join(GymClass, GymClass.id == ClassSession.gym_class_id)
        .where(
            ClassSession.session_date == session_date,
            ClassSession.status != "cancelled",
        )
    )
    if exclude_session_id:
        stmt = stmt.where(ClassSession.id != exclude_session_id)

    for sesion, gc in (await db.execute(stmt)).all():
        # Quién da ESA sesión: el override manda sobre el instructor de la clase.
        quien = sesion.instructor_override_id or gc.instructor_id
        if quien != instructor_id or not sesion.start_time:
            continue
        if _overlap(start_time, duration_minutes, sesion.start_time, gc.duration_minutes):
            hora = sesion.start_time.strftime("%H:%M")
            return (
                f"El entrenador ya tiene «{gc.name}» el "
                f"{session_date.strftime('%d/%m')} a las {hora}."
            )
    return None
