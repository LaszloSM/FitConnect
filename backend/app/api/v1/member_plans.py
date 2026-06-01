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


class PlanUpdate(BaseModel):
    name: str | None = None
    price: float | None = None
    duration_days: int | None = None
    description: str | None = None
    is_active: bool | None = None


class AssignMembership(BaseModel):
    member_id: str
    plan_id: str
    start_date: date
    # Si se provee, genera un pago pendiente por el monto del plan
    payment_method: str | None = None  # "cash" | "transfer" | "card" | None


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


@router.put("/{plan_id}")
async def update_plan(plan_id: str, data: PlanUpdate, db: AsyncSession = Depends(get_tenant_db_from_token)):
    from app.models.tenant.member_plan import MemberPlan
    result = await db.execute(select(MemberPlan).where(MemberPlan.id == uuid.UUID(plan_id)))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(plan, field, val)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}")
async def delete_plan(plan_id: str, db: AsyncSession = Depends(get_tenant_db_from_token)):
    """Borra un plan. Si tiene membresías asociadas, lo archiva (soft-delete)
    para no romper los cobros históricos — nunca falla con 500."""
    from app.models.tenant.member_plan import MemberPlan
    from app.models.tenant.membership import Membership
    result = await db.execute(select(MemberPlan).where(MemberPlan.id == uuid.UUID(plan_id)))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    in_use = await db.execute(
        select(Membership.id).where(Membership.plan_id == plan.id).limit(1)
    )
    if in_use.scalar_one_or_none():
        plan.is_active = False
        await db.commit()
        return {"archived": True, "detail": "Plan archivado: tiene membresías asociadas"}

    await db.delete(plan)
    await db.commit()
    return {"archived": False, "detail": "Plan eliminado"}


async def _create_membership(db: AsyncSession, member_id: uuid.UUID, plan, start: date, payment_method: str | None):
    """Crea una Membership (snapshot del plan) y, si hay método, un Payment pendiente.
    Reutilizado por /assign y por el alta de miembro con plan."""
    from app.models.tenant.membership import Membership, MembershipStatus
    from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
    from decimal import Decimal

    membership = Membership(
        member_id=member_id,
        plan_id=plan.id,
        plan_name=plan.name,
        price=plan.price,
        start_date=start,
        end_date=start + timedelta(days=plan.duration_days),
        duration_days=plan.duration_days,
        status=MembershipStatus.active,
    )
    db.add(membership)

    if payment_method:
        method_map = {
            "cash": PaymentMethod.cash,
            "transfer": PaymentMethod.transfer,
            "card": PaymentMethod.card,
            "wompi": PaymentMethod.wompi,
        }
        method = method_map.get(payment_method, PaymentMethod.cash)
        db.add(Payment(
            member_id=member_id,
            amount=Decimal(str(plan.price)),
            method=method,
            status=PaymentStatus.pending,
            concept=f"Membresía {plan.name}",
        ))

    return membership


@router.post("/assign")
async def assign_membership(data: AssignMembership, db: AsyncSession = Depends(get_tenant_db_from_token)):
    from app.models.tenant.member import Member
    from app.models.tenant.member_plan import MemberPlan

    member_result = await db.execute(select(Member).where(Member.id == uuid.UUID(data.member_id)))
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    plan_result = await db.execute(select(MemberPlan).where(MemberPlan.id == uuid.UUID(data.plan_id)))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    membership = await _create_membership(
        db, uuid.UUID(data.member_id), plan, data.start_date, data.payment_method
    )
    await db.commit()
    await db.refresh(membership)
    return membership
