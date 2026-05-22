from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_tenant_db_from_token
from pydantic import BaseModel
from datetime import date, timedelta
import uuid

router = APIRouter(prefix="/member-plans", tags=["member_plans"])


class PlanCreate(BaseModel):
    name: str
    price: float
    duration_days: int
    description: str | None = None
    is_active: bool = True


class AssignMembership(BaseModel):
    member_id: str
    plan_id: str
    start_date: date


@router.get("/")
async def list_plans(db: AsyncSession = Depends(get_tenant_db_from_token)):
    from app.models.tenant.member_plan import MemberPlan
    result = await db.execute(select(MemberPlan).where(MemberPlan.is_active == True).order_by(MemberPlan.name))
    return result.scalars().all()


@router.post("/")
async def create_plan(data: PlanCreate, db: AsyncSession = Depends(get_tenant_db_from_token)):
    from app.models.tenant.member_plan import MemberPlan
    plan = MemberPlan(**data.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.post("/assign")
async def assign_membership(data: AssignMembership, db: AsyncSession = Depends(get_tenant_db_from_token)):
    from app.models.tenant.member_plan import MemberPlan
    from app.models.tenant.membership import Membership, MembershipStatus
    plan_result = await db.execute(select(MemberPlan).where(MemberPlan.id == uuid.UUID(data.plan_id)))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    membership = Membership(
        member_id=uuid.UUID(data.member_id),
        plan_name=plan.name,
        price=plan.price,
        start_date=data.start_date,
        end_date=data.start_date + timedelta(days=plan.duration_days),
        duration_days=plan.duration_days,
        status=MembershipStatus.active,
    )
    db.add(membership)
    await db.commit()
    await db.refresh(membership)
    return membership
