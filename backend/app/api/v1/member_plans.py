from fastapi import APIRouter, Depends, HTTPException, Request
from app.services.idempotency import Idempotent
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_tenant_db_from_token, require_perm
from app.schemas.member import MembershipResponse
from app.core import permissions as perm
from app.services.audit import audit
from pydantic import BaseModel, Field
from datetime import date, timedelta
from typing import Literal
import uuid

router = APIRouter(prefix="/member-plans", tags=["member_plans"], dependencies=[Depends(require_perm(perm.PLANS_READ))])


class PlanCreate(BaseModel):
    name: str
    price: float
    duration_days: int
    description: str | None = None
    is_active: bool = True
    # gym_only | gym_and_classes; créditos: None = ilimitadas
    access_type: Literal["gym_only", "gym_and_classes"] = "gym_and_classes"
    class_credits_per_month: int | None = None
    # Plan con entrenador; sesiones: None = sin tope
    includes_trainer: bool = False
    trainer_sessions_per_month: int | None = None
    # Ticketera: número de entradas que incluye (None = ilimitadas durante la vigencia)
    entries_total: int | None = Field(default=None, ge=1, le=1000)


class PlanUpdate(BaseModel):
    name: str | None = None
    price: float | None = None
    duration_days: int | None = None
    description: str | None = None
    is_active: bool | None = None
    access_type: Literal["gym_only", "gym_and_classes"] | None = None
    class_credits_per_month: int | None = None
    includes_trainer: bool | None = None
    trainer_sessions_per_month: int | None = None
    entries_total: int | None = Field(default=None, ge=1, le=1000)


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
async def create_plan(
    data: PlanCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(require_perm(perm.PLANS_WRITE)),
):
    from app.models.tenant.member_plan import MemberPlan
    plan = MemberPlan(**data.model_dump())
    db.add(plan)
    await db.flush()
    audit(db, current_user, "plan.create", "member_plan", plan.id,
          {"name": plan.name, "price": str(plan.price), "duration_days": plan.duration_days})
    await db.commit()
    await db.refresh(plan)
    return plan


@router.put("/{plan_id}")
async def update_plan(
    plan_id: str,
    data: PlanUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(require_perm(perm.PLANS_WRITE)),
):
    from app.models.tenant.member_plan import MemberPlan
    result = await db.execute(select(MemberPlan).where(MemberPlan.id == uuid.UUID(plan_id)))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    changes = data.model_dump(exclude_unset=True)
    # El precio es la puerta trasera clásica: se deja rastro del antes y el después
    before = {f: str(getattr(plan, f)) for f in changes if hasattr(plan, f)}
    # exclude_unset (no exclude_none): poner créditos en None = volver a ilimitadas
    for field, val in changes.items():
        setattr(plan, field, val)
    audit(db, current_user, "plan.update", "member_plan", plan.id,
          {"before": before, "after": {f: str(v) for f, v in changes.items()}})
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: str,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(require_perm(perm.PLANS_WRITE)),
):
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
        audit(db, current_user, "plan.archive", "member_plan", plan.id, {"name": plan.name})
        await db.commit()
        return {"archived": True, "detail": "Plan archivado: tiene membresías asociadas"}

    audit(db, current_user, "plan.delete", "member_plan", plan.id,
          {"name": plan.name, "price": str(plan.price)})
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

    # Vender "plan con entrenador" sin entrenador asignado es vender humo: el
    # socio paga por algo que nadie va a darle. Se corta aquí, que es el único
    # embudo por el que pasan el alta, /assign y el cobro del POS.
    if getattr(plan, "includes_trainer", False):
        from app.models.tenant.member import Member as _Member
        socio = (await db.execute(
            select(_Member).where(_Member.id == member_id)
        )).scalar_one_or_none()
        if socio is not None and not socio.trainer_id:
            raise HTTPException(
                status_code=400,
                detail=f"«{plan.name}» incluye entrenador: asígnale uno al socio antes de cobrarlo",
            )

    membership = Membership(
        member_id=member_id,
        plan_id=plan.id,
        plan_name=plan.name,
        # Snapshot de derechos: editar el plan luego no cambia lo ya vendido
        access_type=getattr(plan, "access_type", "gym_and_classes"),
        class_credits_per_month=getattr(plan, "class_credits_per_month", None),
        includes_trainer=bool(getattr(plan, "includes_trainer", False)),
        trainer_sessions_per_month=getattr(plan, "trainer_sessions_per_month", None),
        entries_total=getattr(plan, "entries_total", None),
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
            kind="membership",
        )
        db.add(payment)
        await db.flush()
        return membership, payment

    return membership, None


@router.post("/assign", response_model=MembershipResponse)
async def assign_membership(
    data: AssignMembership,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(require_perm(perm.MEMBERSHIPS_WRITE)),
):
    from app.core.timeutil import today_bogota
    from app.models.tenant.member import Member
    from app.models.tenant.member_plan import MemberPlan
    from app.services.gym_settings import get_gym_settings
    from app.services.membership_status import next_chain_start

    guard = Idempotent(db, request, "member_plans.assign", data.model_dump())
    replay = await guard.check()
    if replay is not None:
        return replay

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
    response = MembershipResponse.model_validate(membership, from_attributes=True)
    guard.remember(response, 201)
    won = await guard.commit()
    return won if won is not None else response


class CourtesyMembership(BaseModel):
    member_id: uuid.UUID
    days: int = Field(ge=1, le=365)
    reason: str = Field(min_length=3, max_length=255)
    # Opcional: copia los derechos de ese plan (clases, ticketera). Sin plan, acceso al gimnasio y clases.
    plan_id: uuid.UUID | None = None


@router.post("/courtesy", response_model=MembershipResponse, status_code=201)
async def give_courtesy(
    data: CourtesyMembership,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(require_perm(perm.MEMBERSHIPS_COURTESY)),
):
    """Membresía regalada por el gym (semana de prueba, premio, compensación).
    Vale $0, no genera deuda ni ingreso y queda auditada con motivo y autor."""
    from app.core.timeutil import today_bogota
    from app.models.tenant.member import Member
    from app.models.tenant.member_plan import MemberPlan
    from app.models.tenant.membership import Membership, MembershipStatus
    from app.services.gym_settings import get_gym_settings
    from app.services.membership_status import next_chain_start

    guard = Idempotent(db, request, "member_plans.courtesy", data.model_dump(mode="json"))
    replay = await guard.check()
    if replay is not None:
        return replay

    if not (await db.execute(select(Member.id).where(Member.id == data.member_id))).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    plan = None
    if data.plan_id:
        plan = (await db.execute(select(MemberPlan).where(MemberPlan.id == data.plan_id))).scalar_one_or_none()
        if plan is None:
            raise HTTPException(status_code=404, detail="Plan no encontrado")

    gym = await get_gym_settings(db)
    today = today_bogota()
    start = await next_chain_start(db, data.member_id, gym.grace_days, today, today=today)
    membership = Membership(
        member_id=data.member_id,
        plan_id=plan.id if plan else None,
        plan_name=f"Cortesía · {plan.name}"[:100] if plan else "Cortesía",
        access_type=plan.access_type if plan else "gym_and_classes",
        class_credits_per_month=plan.class_credits_per_month if plan else None,
        entries_total=plan.entries_total if plan else None,
        price=0,
        discount_reason=data.reason.strip(),
        start_date=start,
        end_date=start + timedelta(days=data.days),
        duration_days=data.days,
        status=MembershipStatus.active.value,
        source="courtesy",
        notes=f"Cortesía: {data.reason.strip()}"[:500],
    )
    db.add(membership)
    await db.flush()
    audit(db, current_user, "membership.courtesy", "membership", membership.id, {
        "member_id": str(data.member_id), "days": data.days, "reason": data.reason.strip(),
        "plan_name": plan.name if plan else None,
    })
    response = MembershipResponse.model_validate(membership, from_attributes=True)
    guard.remember(response, 201)
    won = await guard.commit()
    return won if won is not None else response


class ChargeMembership(BaseModel):
    member_id: str
    plan_id: str
    method: str  # "cash" | "transfer" | "card"
    # Descuento manual o promo, como en /assign
    discount_amount: float | None = None
    discount_reason: str | None = None
    promo_code: str | None = None
    # Transferencia: cuenta destino; datáfono: voucher
    transfer_account_id: str | None = None
    card_approval_code: str | None = None
    card_terminal: str | None = None


@router.post("/charge")
async def charge_membership(
    data: ChargeMembership,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(require_perm(perm.PAYMENTS_WRITE)),
):
    """Cobro POS en un paso: crea/renueva la membresía, marca el pago como pagado
    y emite el recibo. Si hay membresía vigente, la renovación arranca cuando esa
    termina (no se pierden días pagados)."""
    from app.core.timeutil import today_bogota
    from app.models.tenant.member import Member
    from app.models.tenant.member_plan import MemberPlan
    from app.models.tenant.payment import PaymentStatus
    from app.models.tenant.cash_shift import CashShift
    from app.services.gym_settings import get_gym_settings
    from app.services.membership_status import next_chain_start
    from app.services.receipts import issue_receipt
    from app.services.payments import apply_payment_policy, public_account

    # Dos clics en "Cobrar" creaban dos pagos, dos recibos y DOS membresías
    # encadenadas: la segunda arrancaba al terminar la primera, así que el socio
    # quedaba con doble vigencia y la caja del día con plata que nadie entregó.
    guard = Idempotent(db, request, "member_plans.charge", data.model_dump())
    replay = await guard.check()
    if replay is not None:
        return replay

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
    account = None
    if data.method == "transfer":
        # Queda pendiente con cuenta destino + referencia: el recibo se emite
        # cuando el staff confirma la plata
        account = await apply_payment_policy(db, payment, gym, transfer_account_id=data.transfer_account_id)
    else:
        payment.status = PaymentStatus.paid
        if shift is not None:
            payment.shift_id = shift.id
        if data.method == "card":
            payment.card_approval_code = data.card_approval_code
            payment.card_terminal = data.card_terminal
        await db.flush()
        receipt = await issue_receipt(db, payment)
        receipt_number = receipt.snapshot.get("receipt_number")
    await db.flush()
    audit(db, current_user, "membership.charge", "membership", membership.id, {
        "member_id": str(member.id), "plan_name": plan.name,
        "price": str(membership.price), "method": data.method,
        "payment_status": payment.status.value,
    })
    from app.services.payment_ledger import backfill_charge
    await backfill_charge(db, payment, current_user)
    response = {
        "membership_id": str(membership.id),
        "payment_id": str(payment.id),
        "payment_status": payment.status.value,
        "receipt_number": receipt_number,
        "start_date": membership.start_date.isoformat(),
        "end_date": membership.end_date.isoformat(),
        "amount": str(payment.amount),
        "transfer_reference": payment.transfer_reference,
        "destination_account": public_account(account),
    }
    guard.remember(response)
    won = await guard.commit()
    return won if won is not None else response
