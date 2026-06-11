from datetime import timedelta

from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.tenant.class_session import ClassSession
from app.models.tenant.gym_class import GymClass
from app.models.tenant.session_booking import SessionBooking


async def materialize_sessions(db: AsyncSession, horizon_days: int = 14, gym_class_id=None) -> int:
    """Genera sesiones futuras desde las plantillas GymClass según weekdays
    (0=Lun..6=Dom). Idempotente vía ON CONFLICT DO NOTHING. Devuelve cuántas creó."""
    stmt = select(GymClass).where(GymClass.is_active == True)  # noqa: E712
    if gym_class_id is not None:
        stmt = stmt.where(GymClass.id == gym_class_id)
    classes = (await db.execute(stmt)).scalars().all()

    today = today_bogota()
    created = 0
    for gc in classes:
        if not gc.weekdays or gc.start_time is None:
            continue
        for offset in range(horizon_days + 1):
            day = today + timedelta(days=offset)
            gym_weekday = day.weekday()  # 0=Lun..6=Dom (coincide con la convención del proyecto)
            if gym_weekday not in gc.weekdays:
                continue
            result = await db.execute(
                pg_insert(ClassSession)
                .values(
                    gym_class_id=gc.id,
                    session_date=day,
                    start_time=gc.start_time,
                    status="scheduled",
                    location_id=gc.location_id,
                )
                .on_conflict_do_nothing(constraint="uq_session_class_date_time")
                .returning(ClassSession.id)
            )
            new_id = result.scalar_one_or_none()
            if new_id is not None:
                created += 1
                # Sembrar reservas de los inscritos recurrentes (ClassEnrollment)
                session_row = (await db.execute(
                    select(ClassSession).where(ClassSession.id == new_id)
                )).scalar_one()
                await seed_bookings_from_enrollments(
                    db, session_row, capacity=session_row.capacity_override or gc.max_capacity
                )
    await db.commit()
    return created


async def seed_bookings_from_enrollments(db: AsyncSession, session: ClassSession, capacity: int) -> None:
    """Siembra reservas para los inscritos recurrentes (ClassEnrollment) de la
    clase mientras haya cupo, por orden de antigüedad. Solo en sesiones nuevas."""
    from app.models.tenant.class_enrollment import ClassEnrollment

    existing = (await db.execute(
        select(func.count()).select_from(SessionBooking).where(SessionBooking.session_id == session.id)
    )).scalar() or 0
    if existing:
        return
    enrollments = (await db.execute(
        select(ClassEnrollment)
        .where(ClassEnrollment.gym_class_id == session.gym_class_id)
        .order_by(ClassEnrollment.created_at)
    )).scalars().all()
    for i, enr in enumerate(enrollments):
        db.add(SessionBooking(
            session_id=session.id,
            member_id=enr.member_id,
            status="booked" if i < capacity else "waitlisted",
            waitlist_position=None if i < capacity else (i - capacity + 1),
        ))
