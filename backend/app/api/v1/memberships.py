import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_tenant_db_from_token
from app.models.tenant.membership import Membership, MembershipStatus
from app.schemas.member import MembershipResponse
from app.services.membership_status import effective_status

router = APIRouter(prefix="/memberships", tags=["memberships"])


def _to_response(m: Membership) -> MembershipResponse:
    data = MembershipResponse.model_validate(m)
    data.effective_status = effective_status(m)
    return data


@router.post("/{membership_id}/cancel", response_model=MembershipResponse)
async def cancel_membership(
    membership_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Membership).where(Membership.id == membership_id))
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membresía no encontrada")
    if membership.status == MembershipStatus.cancelled:
        raise HTTPException(status_code=400, detail="La membresía ya está cancelada")
    membership.status = MembershipStatus.cancelled
    await db.commit()
    await db.refresh(membership)
    return _to_response(membership)
