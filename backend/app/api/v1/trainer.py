"""Portal del entrenador: lo suyo y nada más.

Un entrenador entra con su propia cuenta y ve sus clases de hoy, los socios que
le asignaron y las rutinas que él diseñó. No ve dinero, ni caja, ni ajustes: eso
lo decide la matriz de permisos (`_TRAINER`), no este módulo.

El filtro es siempre por la fila de `instructors` enlazada a su usuario
(`Instructor.staff_id`), nunca por un id que venga del cliente.
"""
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_staff, get_tenant_db_from_token, require_perm
from app.core import permissions as perm
from app.core.timeutil import today_bogota
from app.models.tenant.class_session import ClassSession
from app.models.tenant.gym_class import GymClass
from app.models.tenant.instructor import Instructor
from app.models.tenant.member import Member
from app.models.tenant.membership import Membership
from app.models.tenant.routine import MemberRoutine, Routine
from app.models.tenant.session_booking import SessionBooking
from app.models.tenant.user_staff import UserStaff
from app.services.membership_status import effective_status

router = APIRouter(
    prefix="/trainer",
    tags=["trainer"],
    dependencies=[Depends(require_perm(perm.TRAINER_PORTAL))],
)


async def current_instructor(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    staff: UserStaff = Depends(get_current_staff),
) -> Instructor:
    """La ficha de entrenador de quien está pidiendo.

    Un usuario con rol `trainer` sin ficha enlazada no es un error del cliente:
    es una invitación a medias. Se responde 404 con el motivo en vez de un 500.
    """
    instructor = (await db.execute(
        select(Instructor).where(Instructor.staff_id == staff.id)
    )).scalar_one_or_none()
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail="Tu usuario todavía no está enlazado a una ficha de entrenador",
        )
    return instructor


@router.get("/me")
async def my_profile(
    instructor: Instructor = Depends(current_instructor),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    socios = (await db.execute(
        select(func.count()).select_from(Member).where(Member.trainer_id == instructor.id)
    )).scalar_one()
    clases = (await db.execute(
        select(func.count()).select_from(GymClass).where(
            GymClass.instructor_id == instructor.id, GymClass.is_active.is_(True)
        )
    )).scalar_one()
    return {
        "id": str(instructor.id),
        "full_name": instructor.full_name,
        "specialty": instructor.specialty,
        "photo_url": instructor.photo_url,
        "members_count": socios,
        "classes_count": clases,
    }


@router.get("/members")
async def my_members(
    instructor: Instructor = Depends(current_instructor),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Sus socios con el estado real de la membresía, para saber a quién llamar."""
    miembros = (await db.execute(
        select(Member)
        .where(Member.trainer_id == instructor.id)
        .order_by(Member.full_name)
    )).scalars().all()
    if not miembros:
        return []

    ids = [m.id for m in miembros]
    filas = (await db.execute(
        select(Membership)
        .where(Membership.member_id.in_(ids))
        .order_by(Membership.member_id, Membership.end_date.desc())
    )).scalars().all()
    vigente: dict[uuid.UUID, Membership] = {}
    for ms in filas:
        # La cancelada nunca representa al socio aunque empate en end_date.
        if ms.status == "cancelled" or ms.member_id in vigente:
            continue
        vigente[ms.member_id] = ms

    hoy = today_bogota()
    out = []
    for m in miembros:
        ms = vigente.get(m.id)
        out.append({
            "id": str(m.id),
            "full_name": m.full_name,
            "phone": m.phone,
            "photo_url": m.photo_url,
            "membership_status": effective_status(ms, hoy) if ms else "no_membership",
            "plan_name": ms.plan_name if ms else None,
            "end_date": ms.end_date.isoformat() if ms and ms.end_date else None,
            "includes_trainer": bool(ms.includes_trainer) if ms else False,
            "trainer_sessions_per_month": ms.trainer_sessions_per_month if ms else None,
        })
    return out


@router.get("/sessions")
async def my_sessions(
    instructor: Instructor = Depends(current_instructor),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
):
    """Sus sesiones: las de sus clases, más aquellas donde lo pusieron de reemplazo,
    menos aquellas de sus clases que ese día da otro."""
    inicio = date_from or today_bogota()
    fin = date_to or (inicio + timedelta(days=7))

    filas = (await db.execute(
        select(ClassSession, GymClass)
        .join(GymClass, GymClass.id == ClassSession.gym_class_id)
        .where(ClassSession.session_date >= inicio, ClassSession.session_date <= fin)
        .order_by(ClassSession.session_date, ClassSession.start_time)
    )).all()
    mias = [
        (s, gc) for s, gc in filas
        if (s.instructor_override_id or gc.instructor_id) == instructor.id
    ]
    if not mias:
        return []

    ids = [s.id for s, _ in mias]
    conteo = dict((await db.execute(
        select(SessionBooking.session_id, func.count())
        .where(SessionBooking.session_id.in_(ids), SessionBooking.status == "booked")
        .group_by(SessionBooking.session_id)
    )).all())

    return [
        {
            "id": str(s.id),
            "class_name": gc.name,
            "category": gc.category,
            "color": gc.color,
            "session_date": s.session_date.isoformat(),
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "duration_minutes": gc.duration_minutes,
            "status": s.status,
            "capacity": s.capacity_override or gc.max_capacity,
            "booked": conteo.get(s.id, 0),
            "is_substitute": s.instructor_override_id == instructor.id,
        }
        for s, gc in mias
    ]


@router.get("/routines")
async def my_routines(
    instructor: Instructor = Depends(current_instructor),
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Las rutinas que él asignó, con el socio al que se las puso."""
    filas = (await db.execute(
        select(MemberRoutine, Routine.name, Member.full_name)
        .join(Routine, Routine.id == MemberRoutine.routine_id)
        .join(Member, Member.id == MemberRoutine.member_id)
        .where(MemberRoutine.assigned_by == staff.id)
        .order_by(MemberRoutine.assigned_at.desc())
        .limit(100)
    )).all()
    return [
        {
            "id": str(mr.id),
            "member_id": str(mr.member_id),
            "member_name": socio,
            "routine_id": str(mr.routine_id),
            "routine_name": rutina,
            "assigned_at": mr.assigned_at.isoformat() if mr.assigned_at else None,
            "ended_at": mr.ended_at.isoformat() if mr.ended_at else None,
        }
        for mr, rutina, socio in filas
    ]
