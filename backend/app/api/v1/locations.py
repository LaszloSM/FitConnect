import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_tenant_db_from_token, require_role, get_current_staff
from app.models.tenant.location import Location
from app.models.tenant.user_staff import UserRole

router = APIRouter(prefix="/locations", tags=["locations"], dependencies=[Depends(get_current_staff)])


class LocationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    address: str = Field(min_length=2, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    max_capacity: int = Field(default=100, gt=0)


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    address: str | None = Field(default=None, min_length=2, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    max_capacity: int | None = Field(default=None, gt=0)
    is_active: bool | None = None


async def _get_location(location_id: uuid.UUID, db: AsyncSession) -> Location:
    location = (await db.execute(
        select(Location).where(Location.id == location_id)
    )).scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    return location


@router.get("")
async def list_locations(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    include_inactive: bool = Query(False),
):
    stmt = select(Location).order_by(Location.name)
    if not include_inactive:
        stmt = stmt.where(Location.is_active == True)  # noqa: E712
    return (await db.execute(stmt)).scalars().all()


@router.post("", status_code=201, dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def create_location(
    data: LocationCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    location = Location(**data.model_dump())
    db.add(location)
    await db.commit()
    await db.refresh(location)
    return location


@router.patch("/{location_id}", dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def update_location(
    location_id: uuid.UUID,
    data: LocationUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    location = await _get_location(location_id, db)
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(location, field, val)
    await db.commit()
    await db.refresh(location)
    return location


@router.delete("/{location_id}", dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def deactivate_location(
    location_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    # Soft-delete: hay FKs desde checkins/clases/máquinas
    location = await _get_location(location_id, db)
    location.is_active = False
    await db.commit()
    return {"archived": True, "detail": "Sede desactivada"}
