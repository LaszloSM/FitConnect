"""Ficha de socio del personal del gimnasio.

Un entrenador o un recepcionista entrena en el gimnasio donde trabaja, pero no
tenía forma de entrar: no existía ningún vínculo entre el equipo y `members`,
así que su huella, su QR y el torniquete no lo reconocían. Con su ficha creada,
entra por los mismos caminos que cualquier socio y no hace falta tocar el motor
de acceso.

No es negocio: se excluye de ingresos, morosidad, churn y proyecciones (ver
`report_data`), pero sí ocupa el gimnasio, así que cuenta en aforo, check-ins y
horas pico.
"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.tenant.member import Member, MemberStatus, MemberType
from app.models.tenant.member_plan import MemberPlan
from app.models.tenant.membership import Membership, MembershipStatus

STAFF_PLAN_NAME = "Cortesía del equipo"
#: La cortesía dura mientras la persona trabaje aquí, pero `end_date` es
#: obligatorio: una fecha lejana evita tener que renovarla desde el job diario.
STAFF_PLAN_DAYS = 36500


async def ensure_staff_plan(db: AsyncSession) -> MemberPlan:
    plan = (await db.execute(
        select(MemberPlan).where(MemberPlan.name == STAFF_PLAN_NAME)
    )).scalars().first()
    if plan is None:
        plan = MemberPlan(
            name=STAFF_PLAN_NAME,
            price=0,
            duration_days=STAFF_PLAN_DAYS,
            description="Acceso del personal del gimnasio. No se cobra ni entra en los reportes de ingresos.",
            access_type="gym_and_classes",
        )
        db.add(plan)
        await db.flush()
    return plan


async def _find_existing(
    db: AsyncSession, *, staff_id=None, instructor_id=None, email: str | None = None
) -> Member | None:
    if staff_id is not None:
        ficha = (await db.execute(
            select(Member).where(Member.staff_id == staff_id)
        )).scalars().first()
        if ficha:
            return ficha
    if instructor_id is not None:
        ficha = (await db.execute(
            select(Member).where(Member.instructor_profile_id == instructor_id)
        )).scalars().first()
        if ficha:
            return ficha
    # Caso muy real: la persona ya entrenaba aquí antes de que la contrataran.
    # Enlazar su ficha conserva su historial en vez de crearle una segunda.
    if email:
        return (await db.execute(
            select(Member).where(Member.email == email)
        )).scalars().first()
    return None


async def ensure_staff_member(
    db: AsyncSession,
    *,
    full_name: str,
    email: str | None = None,
    phone: str | None = None,
    staff_id=None,
    instructor_id=None,
) -> Member:
    """Crea (o reactiva) la ficha de socio de alguien del equipo. No commitea."""
    ficha = await _find_existing(db, staff_id=staff_id, instructor_id=instructor_id, email=email)

    if ficha is None:
        ficha = Member(
            full_name=full_name,
            email=email,
            phone=phone,
            member_type=MemberType.staff.value,
            status=MemberStatus.active,
        )
        db.add(ficha)

    if staff_id is not None:
        ficha.staff_id = staff_id
    if instructor_id is not None:
        ficha.instructor_profile_id = instructor_id
    # Quien ya era socio de pago conserva su tipo: convertirlo en `staff` lo
    # sacaría de los ingresos que sí paga.
    if ficha.member_type == MemberType.visitor.value:
        ficha.member_type = MemberType.staff.value
    ficha.status = MemberStatus.active
    await db.flush()

    await _ensure_courtesy_membership(db, ficha)
    return ficha


async def _ensure_courtesy_membership(db: AsyncSession, ficha: Member) -> None:
    """Le da acceso hoy mismo, salvo que ya tenga una membresía vigente propia."""
    hoy = today_bogota()
    vigente = (await db.execute(
        select(Membership).where(
            Membership.member_id == ficha.id,
            Membership.status == MembershipStatus.active.value,
            Membership.end_date >= hoy,
        )
    )).scalars().first()
    if vigente is not None:
        return

    # Desactivar y reactivar a la misma persona apilaba una cortesía nueva cada
    # vez: se reusa la que se canceló al quitarle el acceso.
    cancelada = (await db.execute(
        select(Membership).where(
            Membership.member_id == ficha.id,
            Membership.plan_name == STAFF_PLAN_NAME,
            Membership.status == MembershipStatus.cancelled.value,
            Membership.end_date >= hoy,
        ).order_by(Membership.end_date.desc())
    )).scalars().first()
    if cancelada is not None:
        cancelada.status = MembershipStatus.active.value
        return

    plan = await ensure_staff_plan(db)
    db.add(Membership(
        member_id=ficha.id,
        plan_id=plan.id,
        plan_name=plan.name,
        price=0,
        duration_days=STAFF_PLAN_DAYS,
        start_date=hoy,
        end_date=hoy + timedelta(days=STAFF_PLAN_DAYS),
        status=MembershipStatus.active.value,
        access_type=plan.access_type,
        source="courtesy",
    ))


async def suspend_staff_member(db: AsyncSession, *, staff_id=None, instructor_id=None) -> None:
    """Corta el acceso al gimnasio sin borrar la ficha: su historial es real."""
    ficha = await _find_existing(db, staff_id=staff_id, instructor_id=instructor_id)
    if ficha is None or ficha.member_type != MemberType.staff.value:
        return
    ficha.status = MemberStatus.inactive
    for m in (await db.execute(
        select(Membership).where(
            Membership.member_id == ficha.id,
            Membership.plan_name == STAFF_PLAN_NAME,
            Membership.status == MembershipStatus.active.value,
        )
    )).scalars().all():
        m.status = MembershipStatus.cancelled.value


async def restore_staff_member(db: AsyncSession, *, staff_id=None, instructor_id=None) -> None:
    ficha = await _find_existing(db, staff_id=staff_id, instructor_id=instructor_id)
    if ficha is None or ficha.member_type != MemberType.staff.value:
        return
    ficha.status = MemberStatus.active
    await _ensure_courtesy_membership(db, ficha)
