import uuid
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_tenant_db_from_token, require_role, get_current_staff
from app.models.tenant.promo_code import PromoCode
from app.models.tenant.user_staff import UserRole

router = APIRouter(prefix="/promo-codes", tags=["promo_codes"], dependencies=[Depends(get_current_staff)])

_STAFF_WRITE = Depends(require_role(UserRole.owner, UserRole.admin))


class PromoCodeCreate(BaseModel):
    code: str = Field(min_length=2, max_length=50)
    discount_type: str = Field(pattern="^(percent|fixed)$")
    value: Decimal = Field(gt=0)
    valid_from: date | None = None
    valid_until: date | None = None
    max_uses: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=255)

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("value")
    @classmethod
    def percent_max_100(cls, v: Decimal, info) -> Decimal:
        if info.data.get("discount_type") == "percent" and v > 100:
            raise ValueError("Un descuento porcentual no puede superar 100")
        return v


class PromoCodeUpdate(BaseModel):
    valid_from: date | None = None
    valid_until: date | None = None
    max_uses: int | None = Field(default=None, gt=0)
    is_active: bool | None = None
    description: str | None = Field(default=None, max_length=255)


@router.get("")
async def list_promo_codes(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    include_inactive: bool = Query(False),
):
    stmt = select(PromoCode).order_by(PromoCode.created_at.desc())
    if not include_inactive:
        stmt = stmt.where(PromoCode.is_active == True)  # noqa: E712
    return (await db.execute(stmt)).scalars().all()


@router.post("", status_code=201, dependencies=[_STAFF_WRITE])
async def create_promo_code(
    data: PromoCodeCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    existing = (await db.execute(
        select(PromoCode).where(PromoCode.code == data.code)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un código con ese nombre")
    promo = PromoCode(**data.model_dump())
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    return promo


@router.patch("/{promo_id}", dependencies=[_STAFF_WRITE])
async def update_promo_code(
    promo_id: uuid.UUID,
    data: PromoCodeUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    promo = (await db.execute(
        select(PromoCode).where(PromoCode.id == promo_id)
    )).scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=404, detail="Código no encontrado")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(promo, field, val)
    await db.commit()
    await db.refresh(promo)
    return promo


@router.delete("/{promo_id}", dependencies=[_STAFF_WRITE])
async def deactivate_promo_code(
    promo_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    promo = (await db.execute(
        select(PromoCode).where(PromoCode.id == promo_id)
    )).scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=404, detail="Código no encontrado")
    promo.is_active = False
    await db.commit()
    return {"archived": True, "detail": "Código desactivado"}
