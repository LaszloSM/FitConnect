from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_tenant_db_from_token, get_current_staff
from pydantic import BaseModel
from datetime import date, timedelta
from typing import Literal
import uuid

router = APIRouter(prefix="/member-plans", tags=["member_plans"], dependencies=[Depends(get_current_staff)])


class PlanCreate(BaseModel):
    name: str
    price: float
    duration_days: int
    description: str | None = None
    is_active: bool = True
    # gym_only | gym_and_classes; créditos: None = ilimitadas
    access_type: Literal["gym_only", "gym_and_classes"] = "gym_and_classes"
    class_credits_per_month: int | None = None


class PlanUpdate(BaseModel):
    name: str | None = None
    price: float | None = None
    duration_days: int | None = None
    description: str | None = None
    is_active: bool | None = None
    access_type: Literal["gym_only", "gym_and_classes"] | None = None
    class_credits_per_month: int | None = None


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
    result = await db.execute(select(MemberPlan).where(MemberPlan.is_active.is_(True)).order_by(MemberPlan.name))
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
    # exclude_unset (no exclude_none): poner créditos en None = volver a ilimitadas
    for field, val in data.model_dump(exclude_unset=True).items():
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
        # Snapshot de derechos: editar el plan luego no cambia lo ya vendido
        access_type=getattr(plan, "access_type", "gym_and_classes"),
        class_credits_per_month=getattr(plan, "class_credits_per_month", None),
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
    # El id de la membresía debe existir para vincular el pago (saldo pendiente computable)
    await db.flush()

    if payment_method:
        method_map = {
            "cash": PaymentMethod.cash,
            "transfer": PaymentMethod.transfer,
            "card": PaymentMethod.card,
            "wompi": PaymentMethod.wompi,
        }
        method = method_map.get(payment_method, PaymentMethod.cash)
        payment = Payment(
            member_id=member_id,
            membership_id=membership.id,
            amount=net_price,
            method=method,
            status=PaymentStatus.pending,
            concept=f"Membresía {plan.name}",
        )
        db.add(payment)
        await db.flush()
        return membership, payment

    return membership, None


@router.post("/assign")
async def assign_membership(
    data: AssignMembership,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(get_current_staff),
):
    from app.core.timeutil import today_bogota
    from app.models.tenant.member import Member
    from app.models.tenant.member_plan import MemberPlan
    from app.services.audit import audit
    from app.services.gym_settings import get_gym_settings
    from app.services.membership_status import next_chain_start

    member_result = await db.execute(select(Member).where(Member.id == uuid.UUID(data.member_id)))
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    plan_result = await db.execute(select(MemberPlan).where(MemberPlan.id == uuid.UUID(data.plan_id)))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    # Nunca solapar con una vigente/congelada/programada: encadenar
    gym = await get_gym_settings(db)
    start = await next_chain_start(
        db, uuid.UUID(data.member_id), gym.grace_days, data.start_date, today=today_bogota()
    )

    membership, _ = await _create_membership(
        db, uuid.UUID(data.member_id), plan, start, data.payment_method,
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


class ChargeMembership(BaseModel):
    member_id: str
    plan_id: str
    method: str  # "cash" | "transfer" | "card"
    # Descuento manual o promo, como en /assign
    discount_amount: float | None = None
    discount_reason: str | None = None
    promo_code: str | None = None


@router.post("/charge")
async def charge_membership(
    data: ChargeMembership,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(get_current_staff),
):
    """Cobro POS en un paso: crea/renueva la membresía, marca el pago como pagado
    y emite el recibo. Si hay membresía vigente, la renovación arranca cuando esa
    termina (no se pierden días pagados)."""
    from app.core.timeutil import today_bogota
    from app.models.tenant.member import Member
    from app.models.tenant.member_plan import MemberPlan
    from app.models.tenant.payment import PaymentStatus
    from app.models.tenant.cash_shift import CashShift
    from app.services.audit import audit
    from app.services.gym_settings import get_gym_settings
    from app.services.membership_status import next_chain_start
    from app.services.receipts import issue_receipt

    if data.method not in ("cash", "transfer", "card"):
        raise HTTPException(status_code=400, detail="Método inválido para cobro directo (usa link Wompi)")

    member = (await db.execute(
        select(Member).where(Member.id == uuid.UUID(data.member_id))
    )).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    plan = (await db.execute(
        select(MemberPlan).where(MemberPlan.id == uuid.UUID(data.plan_id))
    )).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    gym = await get_gym_settings(db)
    shift = None
    if data.method == "cash":
        shift = (await db.execute(
            select(CashShift).where(CashShift.status == "open", CashShift.location_id.is_(None)).limit(1)
        )).scalar_one_or_none()
        if shift is None and gym.cash_shifts_enabled:
            raise HTTPException(status_code=400, detail="Abre un turno de caja antes de cobrar en efectivo")

    # Renovación sin perder días: arranca al terminar la vigente/programada
    today = today_bogota()
    start = await next_chain_start(db, member.id, gym.grace_days, today, today=today)

    membership, payment = await _create_membership(
        db, member.id, plan, start, data.method,
        discount_amount=data.discount_amount,
        discount_reason=data.discount_reason,
        promo_code=data.promo_code,
    )
    payment.received_by = current_user.id
    receipt_number = None
    if data.method == "transfer":
        # Queda pendiente: el recibo se emite cuando el staff confirma la plata
        payment.status = PaymentStatus.pending
    else:
        payment.status = PaymentStatus.paid
        if shift is not None:
            payment.shift_id = shift.id
        await db.flush()
        receipt = await issue_receipt(db, payment)
        receipt_number = receipt.snapshot.get("receipt_number")
    await db.flush()
    audit(db, current_user, "membership.charge", "membership", membership.id, {
        "member_id": str(member.id), "plan_name": plan.name,
        "price": str(membership.price), "method": data.method,
        "payment_status": payment.status.value,
    })
    await db.commit()
    await db.refresh(membership)
    return {
        "membership_id": str(membership.id),
        "payment_id": str(payment.id),
        "payment_status": payment.status.value,
        "receipt_number": receipt_number,
        "start_date": membership.start_date.isoformat(),
        "end_date": membership.end_date.isoformat(),
        "amount": str(payment.amount),
    }
