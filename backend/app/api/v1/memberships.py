import uuid
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_tenant_db_from_token, get_current_staff
from app.core.timeutil import today_bogota
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.membership_freeze import MembershipFreeze
from app.models.tenant.user_staff import UserStaff
from app.schemas.member import MembershipResponse
from app.services.audit import audit
from app.services.gym_settings import get_gym_settings
from app.services.membership_status import effective_status

router = APIRouter(prefix="/memberships", tags=["memberships"], dependencies=[Depends(get_current_staff)])


class FreezeRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=255)


async def _to_response(m: Membership, db: AsyncSession) -> MembershipResponse:
    gym = await get_gym_settings(db)
    data = MembershipResponse.model_validate(m)
    data.effective_status = effective_status(m, grace_days=gym.grace_days)
    return data


async def _get_membership(membership_id: uuid.UUID, db: AsyncSession) -> Membership:
    result = await db.execute(select(Membership).where(Membership.id == membership_id))
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membresía no encontrada")
    return membership


@router.post("/{membership_id}/cancel", response_model=MembershipResponse)
async def cancel_membership(
    membership_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    membership = await _get_membership(membership_id, db)
    if membership.status == MembershipStatus.cancelled:
        raise HTTPException(status_code=400, detail="La membresía ya está cancelada")
    membership.status = MembershipStatus.cancelled.value
    audit(db, current_user, "membership.cancel", "membership", membership.id,
          {"member_id": str(membership.member_id), "plan_name": membership.plan_name})
    await db.commit()
    await db.refresh(membership)
    return await _to_response(membership, db)


@router.post("/{membership_id}/freeze", response_model=MembershipResponse)
async def freeze_membership(
    membership_id: uuid.UUID,
    payload: FreezeRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    membership = await _get_membership(membership_id, db)
    gym = await get_gym_settings(db)
    status = effective_status(membership, grace_days=gym.grace_days)
    if status not in ("active", "in_grace"):
        raise HTTPException(status_code=400, detail=f"No se puede congelar una membresía {status}")

    open_freeze = (await db.execute(
        select(MembershipFreeze).where(
            MembershipFreeze.membership_id == membership.id,
            MembershipFreeze.end_date.is_(None),
        )
    )).scalar_one_or_none()
    if open_freeze:
        raise HTTPException(status_code=400, detail="La membresía ya está congelada")

    db.add(MembershipFreeze(
        membership_id=membership.id,
        start_date=today_bogota(),
        reason=payload.reason,
        created_by=current_user.id,
    ))
    membership.status = MembershipStatus.frozen.value
    audit(db, current_user, "membership.freeze", "membership", membership.id,
          {"member_id": str(membership.member_id), "reason": payload.reason})
    await db.commit()
    await db.refresh(membership)
    return await _to_response(membership, db)


@router.post("/{membership_id}/unfreeze", response_model=MembershipResponse)
async def unfreeze_membership(
    membership_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    membership = await _get_membership(membership_id, db)
    if membership.status != MembershipStatus.frozen:
        raise HTTPException(status_code=400, detail="La membresía no está congelada")

    open_freeze = (await db.execute(
        select(MembershipFreeze).where(
            MembershipFreeze.membership_id == membership.id,
            MembershipFreeze.end_date.is_(None),
        )
    )).scalar_one_or_none()
    if not open_freeze:
        raise HTTPException(status_code=400, detail="No hay congelamiento abierto para esta membresía")

    today = today_bogota()
    days = max((today - open_freeze.start_date).days, 0)
    open_freeze.end_date = today
    open_freeze.days_applied = days
    original_end = membership.end_date
    membership.end_date = membership.end_date + timedelta(days=days)
    membership.status = MembershipStatus.active.value

    # Correr también las renovaciones programadas encadenadas para no solaparlas
    shifted = 0
    if days:
        chained = (await db.execute(
            select(Membership).where(
                Membership.member_id == membership.member_id,
                Membership.status == MembershipStatus.active.value,
                Membership.start_date > original_end,
                Membership.id != membership.id,
            )
        )).scalars().all()
        for c in chained:
            c.start_date = c.start_date + timedelta(days=days)
            c.end_date = c.end_date + timedelta(days=days)
        shifted = len(chained)

    audit(db, current_user, "membership.unfreeze", "membership", membership.id,
          {"member_id": str(membership.member_id), "days_applied": days,
           "new_end_date": membership.end_date.isoformat(),
           "chained_shifted": shifted})
    await db.commit()
    await db.refresh(membership)
    return await _to_response(membership, db)


@router.get("/{membership_id}/freezes")
async def list_freezes(
    membership_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    await _get_membership(membership_id, db)
    result = await db.execute(
        select(MembershipFreeze)
        .where(MembershipFreeze.membership_id == membership_id)
        .order_by(MembershipFreeze.start_date.desc())
    )
    return result.scalars().all()
