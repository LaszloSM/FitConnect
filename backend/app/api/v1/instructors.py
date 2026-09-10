import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, get_current_staff, require_perm
from app.core import permissions as perm
from app.models.tenant.gym_class import GymClass
from app.models.tenant.instructor import Instructor
from app.models.tenant.user_staff import UserStaff

router = APIRouter(prefix="/instructors", tags=["instructors"], dependencies=[Depends(require_perm(perm.INSTRUCTORS_READ))])


class InstructorCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    photo_url: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    specialty: str | None = Field(default=None, max_length=255)


class InstructorUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    photo_url: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    specialty: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


def _serialize(i: Instructor, classes_count: int = 0) -> dict:
    return {
        "id": str(i.id),
        "full_name": i.full_name,
        "photo_url": i.photo_url,
        "phone": i.phone,
        "specialty": i.specialty,
        "is_active": i.is_active,
        "classes_count": classes_count,
    }


@router.get("")
async def list_instructors(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    include_inactive: bool = Query(False),
):
    stmt = select(Instructor)
    if not include_inactive:
        stmt = stmt.where(Instructor.is_active.is_(True))
    instructors = (await db.execute(stmt.order_by(Instructor.full_name))).scalars().all()

    counts: dict[uuid.UUID, int] = {}
    if instructors:
        from sqlalchemy import func
        rows = (await db.execute(
            select(GymClass.instructor_id, func.count())
            .where(GymClass.instructor_id.in_([i.id for i in instructors]), GymClass.is_active.is_(True))
            .group_by(GymClass.instructor_id)
        )).all()
        counts = {iid: n for iid, n in rows}
    return [_serialize(i, counts.get(i.id, 0)) for i in instructors]


@router.post("", status_code=201, dependencies=[Depends(require_perm(perm.INSTRUCTORS_WRITE))])
async def create_instructor(
    payload: InstructorCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
):
    instructor = Instructor(**payload.model_dump())
    db.add(instructor)
    await db.commit()
    await db.refresh(instructor)
    return _serialize(instructor)


@router.put("/{instructor_id}", dependencies=[Depends(require_perm(perm.INSTRUCTORS_WRITE))])
async def update_instructor(
    instructor_id: uuid.UUID,
    payload: InstructorUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
):
    instructor = (await db.execute(
        select(Instructor).where(Instructor.id == instructor_id)
    )).scalar_one_or_none()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(instructor, field, value)
    # Mantener el snapshot de texto en las clases vinculadas
    if payload.full_name:
        classes = (await db.execute(
            select(GymClass).where(GymClass.instructor_id == instructor_id)
        )).scalars().all()
        for gc in classes:
            gc.instructor = payload.full_name
    await db.commit()
    await db.refresh(instructor)
    return _serialize(instructor)


@router.delete("/{instructor_id}", dependencies=[Depends(require_perm(perm.INSTRUCTORS_WRITE))])
async def archive_instructor(
    instructor_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
):
    """Soft-delete: las clases conservan el nombre como texto (snapshot)."""
    instructor = (await db.execute(
        select(Instructor).where(Instructor.id == instructor_id)
    )).scalar_one_or_none()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor no encontrado")
    instructor.is_active = False
    await db.commit()
    return {"archived": True}
