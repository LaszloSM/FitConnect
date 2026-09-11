import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from typing import Optional

from app.api.deps import get_tenant_db_from_token, require_perm
from app.core import permissions as perm
from app.schemas.operations import (
    GymClassCreate, GymClassUpdate, GymClassResponse,
    ClassEnrollmentCreate, ClassEnrollmentResponse,
    ClassEnrollmentDetailResponse, EnrollRequest,
)
from app.models.tenant.gym_class import GymClass
from app.models.tenant.class_enrollment import ClassEnrollment
from app.models.tenant.member import Member
from app.services.schedule_conflicts import find_class_conflict

router = APIRouter(prefix="/classes", tags=["classes"], dependencies=[Depends(require_perm(perm.CLASSES_READ))])


@router.get("", response_model=list[GymClassResponse])
async def list_classes(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(GymClass)
    if is_active is not None:
        stmt = stmt.where(GymClass.is_active == is_active)
    stmt = stmt.order_by(GymClass.name).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=GymClassResponse, status_code=201, dependencies=[Depends(require_perm(perm.CLASSES_WRITE))])
async def create_class(
    payload: GymClassCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    choque = await find_class_conflict(
        db,
        instructor_id=payload.instructor_id,
        weekdays=payload.weekdays,
        start_time=payload.start_time,
        duration_minutes=payload.duration_minutes,
    )
    if choque:
        raise HTTPException(status_code=409, detail=choque)

    gym_class = GymClass(**payload.model_dump())
    db.add(gym_class)
    await db.commit()
    await db.refresh(gym_class)
    # Generar las sesiones futuras de inmediato para que la agenda no salga vacía
    from app.services.class_sessions import materialize_sessions
    await materialize_sessions(db, horizon_days=14, gym_class_id=gym_class.id)
    return gym_class


@router.get("/{class_id}", response_model=GymClassResponse)
async def get_class(
    class_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(GymClass).where(GymClass.id == class_id))
    gym_class = result.scalar_one_or_none()
    if not gym_class:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    return gym_class


@router.put("/{class_id}", response_model=GymClassResponse, dependencies=[Depends(require_perm(perm.CLASSES_WRITE))])
async def update_class(
    class_id: uuid.UUID,
    payload: GymClassUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(GymClass).where(GymClass.id == class_id))
    gym_class = result.scalar_one_or_none()
    if not gym_class:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    cambios = payload.model_dump(exclude_unset=True)
    # Se valida con los valores RESULTANTES, no solo con los que llegaron: mover
    # la hora sin tocar el instructor también puede chocar.
    choque = await find_class_conflict(
        db,
        instructor_id=cambios.get("instructor_id", gym_class.instructor_id),
        weekdays=cambios.get("weekdays", gym_class.weekdays),
        start_time=cambios.get("start_time", gym_class.start_time),
        duration_minutes=cambios.get("duration_minutes", gym_class.duration_minutes),
        exclude_class_id=gym_class.id,
    )
    if choque:
        raise HTTPException(status_code=409, detail=choque)
    for field, value in cambios.items():
        setattr(gym_class, field, value)
    await db.commit()
    await db.refresh(gym_class)
    return gym_class


@router.delete("/{class_id}", status_code=204, dependencies=[Depends(require_perm(perm.CLASSES_WRITE))])
async def delete_class(
    class_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(GymClass).where(GymClass.id == class_id))
    gym_class = result.scalar_one_or_none()
    if not gym_class:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    await db.delete(gym_class)
    await db.commit()
    return None


# ─── Enrollments ───
@router.get("/{class_id}/enrollments", response_model=list[ClassEnrollmentDetailResponse])
async def list_enrollments(
    class_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(
        select(ClassEnrollment, Member)
        .join(Member, ClassEnrollment.member_id == Member.id)
        .where(ClassEnrollment.gym_class_id == class_id)
    )
    rows = result.all()
    return [
        ClassEnrollmentDetailResponse(
            id=enrollment.id,
            member_id=enrollment.member_id,
            member_name=member.full_name,
            member_email=member.email,
        )
        for enrollment, member in rows
    ]


@router.post("/{class_id}/enrollments", response_model=ClassEnrollmentResponse, status_code=201, dependencies=[Depends(require_perm(perm.CLASSES_ATTEND))])
async def create_enrollment(
    class_id: uuid.UUID,
    payload: ClassEnrollmentCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    # Verify class exists
    class_result = await db.execute(select(GymClass).where(GymClass.id == class_id))
    gym_class = class_result.scalar_one_or_none()
    if not gym_class:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    # Verify member exists
    member_result = await db.execute(select(Member).where(Member.id == payload.member_id))
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    # Check capacity
    count_result = await db.execute(
        select(func.count())
        .select_from(ClassEnrollment)
        .where(ClassEnrollment.gym_class_id == class_id)
    )
    enrolled = count_result.scalar() or 0
    if enrolled >= gym_class.max_capacity:
        raise HTTPException(status_code=400, detail="Clase llena")

    enrollment = ClassEnrollment(gym_class_id=class_id, member_id=payload.member_id)
    db.add(enrollment)
    await db.commit()
    await db.refresh(enrollment)
    return enrollment


@router.post("/{class_id}/enroll", response_model=ClassEnrollmentResponse, status_code=201, dependencies=[Depends(require_perm(perm.CLASSES_ATTEND))])
async def enroll_member(
    class_id: uuid.UUID,
    payload: EnrollRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Shorthand enroll endpoint — accepts only member_id in body."""
    # Verify class exists and has capacity
    class_result = await db.execute(select(GymClass).where(GymClass.id == class_id))
    gym_class = class_result.scalar_one_or_none()
    if not gym_class:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    # Verify member exists
    member_result = await db.execute(select(Member).where(Member.id == payload.member_id))
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    # Check capacity
    count_result = await db.execute(
        select(func.count())
        .select_from(ClassEnrollment)
        .where(ClassEnrollment.gym_class_id == class_id)
    )
    enrolled = count_result.scalar() or 0
    if enrolled >= gym_class.max_capacity:
        raise HTTPException(status_code=400, detail="La clase está llena")

    # Check for existing enrollment
    existing_result = await db.execute(
        select(ClassEnrollment).where(
            ClassEnrollment.gym_class_id == class_id,
            ClassEnrollment.member_id == payload.member_id,
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El miembro ya está inscrito en esta clase")

    enrollment = ClassEnrollment(gym_class_id=class_id, member_id=payload.member_id)
    try:
        db.add(enrollment)
        await db.commit()
        await db.refresh(enrollment)
        return enrollment
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="El miembro ya está inscrito en esta clase")


@router.delete("/{class_id}/enrollments/{enrollment_id}", status_code=204, dependencies=[Depends(require_perm(perm.CLASSES_ATTEND))])
async def delete_enrollment(
    class_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(
        select(ClassEnrollment).where(
            ClassEnrollment.id == enrollment_id,
            ClassEnrollment.gym_class_id == class_id,
        )
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscripcion no encontrada")
    await db.delete(enrollment)
    await db.commit()
    return None
