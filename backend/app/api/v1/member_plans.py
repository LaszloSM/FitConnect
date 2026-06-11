from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_tenant_db_from_token, get_current_staff
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
    # Descuento manual (requiere motivo) o código promocional — excluyentes
    discount_amount: float | None = None
    discount_reason: str | None = None
    promo_code: str | None = None


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


async def _resolve_discount(
    db: AsyncSession,
    plan_price,
    discount_amount: float | None,
    discount_reason: str | None,
    promo_code: str | None,
):
    """Calcula (precio_neto, discount_amount, discount_reason, promo_code_id).
    Valida el código promo (vigencia/usos) y consume un uso en la misma transacción."""
    from decimal import Decimal
    from sqlalchemy import select
    from app.models.tenant.promo_code import PromoCode
    from app.core.timeutil import today_bogota

    price = Decimal(str(plan_price))

    if promo_code:
        if discount_amount:
            raise HTTPException(status_code=400, detail="Usa descuento manual O código promo, no ambos")
        promo = (await db.execute(
            select(PromoCode).where(PromoCode.code == promo_code.strip().upper()).with_for_update()
        )).scalar_one_or_none()
        today = today_bogota()
        if not promo or not promo.is_active:
            raise HTTPException(status_code=400, detail="Código promocional no válido")
        if promo.valid_from and today < promo.valid_from:
            raise HTTPException(status_code=400, detail="El código aún no está vigente")
        if promo.valid_until and today > promo.valid_until:
            raise HTTPException(status_code=400, detail="El código ya venció")
        if promo.max_uses is not None and promo.times_used >= promo.max_uses:
            raise HTTPException(status_code=400, detail="El código agotó sus usos")

        if promo.discount_type == "percent":
            discount = (price * promo.value / Decimal("100")).quantize(Decimal("0.01"))
        else:
            discount = min(promo.value, price)
        promo.times_used += 1
        return price - discount, discount, f"Promo {promo.code}", promo.id

    if discount_amount:
        discount = Decimal(str(discount_amount))
        if discount >= price:
            raise HTTPException(status_code=400, detail="El descuento no puede ser igual o mayor al precio")
        if not discount_reason:
            raise HTTPException(status_code=400, detail="El descuento manual requiere un motivo")
        return price - discount, discount, discount_reason, None

    return price, None, None, None


async def _create_membership(
    db: AsyncSession,
    member_id: uuid.UUID,
    plan,
    start: date,
    payment_method: str | None,
    discount_amount: float | None = None,
    discount_reason: str | None = None,
    promo_code: str | None = None,
):
    """Crea una Membership (snapshot del plan, precio neto con descuento) y,
    si hay método, un Payment pendiente. Reutilizado por /assign y el alta de miembro."""
    from app.models.tenant.membership import Membership, MembershipStatus
    from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus

    net_price, discount, reason, promo_id = await _resolve_discount(
        db, plan.price, discount_amount, discount_reason, promo_code
    )

    membership = Membership(
        member_id=member_id,
        plan_id=plan.id,
        plan_name=plan.name,
        price=net_price,
        discount_amount=discount,
        discount_reason=reason,
        promo_code_id=promo_id,
        start_date=start,
        end_date=start + timedelta(days=plan.duration_days),
        duration_days=plan.duration_days,
        status=MembershipStatus.active.value,
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
            amount=net_price,
            method=method,
            status=PaymentStatus.pending,
            concept=f"Membresía {plan.name}",
        ))

    return membership


@router.post("/assign")
async def assign_membership(
    data: AssignMembership,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(get_current_staff),
):
    from app.models.tenant.member import Member
    from app.models.tenant.member_plan import MemberPlan
    from app.services.audit import audit

    member_result = await db.execute(select(Member).where(Member.id == uuid.UUID(data.member_id)))
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    plan_result = await db.execute(select(MemberPlan).where(MemberPlan.id == uuid.UUID(data.plan_id)))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    membership = await _create_membership(
        db, uuid.UUID(data.member_id), plan, data.start_date, data.payment_method,
        discount_amount=data.discount_amount,
        discount_reason=data.discount_reason,
        promo_code=data.promo_code,
    )
    await db.flush()
    audit(db, current_user, "membership.assign", "membership", membership.id, {
        "member_id": data.member_id,
        "plan_name": plan.name,
        "price": str(membership.price),
        "discount": str(membership.discount_amount) if membership.discount_amount else None,
    })
    await db.commit()
    await db.refresh(membership)
    return membership
