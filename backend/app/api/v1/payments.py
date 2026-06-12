import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, update
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_tenant_slug
from app.core.timeutil import today_bogota
from app.schemas.member import PaymentCreate, PaymentUpdate, PaymentResponse
from app.schemas.pos import PaymentItemOut, ReceivableOut
from app.models.tenant.payment import Payment, PaymentStatus, PaymentMethod
from app.models.tenant.payment_item import PaymentItem
from app.models.tenant.product import Product
from app.models.tenant.member import Member
from app.models.tenant.membership import Membership
from app.models.tenant.cash_shift import CashShift
from app.models.tenant.receipt import Receipt
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.gym_settings import get_gym_settings
from app.services.membership_status import effective_status
from app.services.receipts import issue_receipt
from app.services.payment_links import create_payment_link_for

router = APIRouter(prefix="/payments", tags=["payments"])


async def _open_cash_shift(db: AsyncSession) -> CashShift | None:
    """Turno de caja abierto de la sede única (location_id NULL)."""
    return (await db.execute(
        select(CashShift).where(CashShift.status == "open", CashShift.location_id.is_(None)).limit(1)
    )).scalar_one_or_none()


async def _member_names(member_ids: list[uuid.UUID], db: AsyncSession) -> dict[uuid.UUID, str]:
    ids = [m for m in member_ids if m is not None]
    if not ids:
        return {}
    result = await db.execute(select(Member.id, Member.full_name).where(Member.id.in_(ids)))
    return {mid: name for mid, name in result.all()}


def _payment_response(payment: Payment, member_name: str | None) -> PaymentResponse:
    data = PaymentResponse.model_validate(payment)
    data.member_name = member_name
    return data


@router.get("", response_model=list[PaymentResponse])
async def list_payments(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    member_id: uuid.UUID | None = Query(None),
    status: PaymentStatus | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    # El frontend carga el mes completo de una (limit=200); tope alineado con eso
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    stmt = select(Payment)
    if member_id:
        stmt = stmt.where(Payment.member_id == member_id)
    if status:
        stmt = stmt.where(Payment.status == status)
    if from_date:
        stmt = stmt.where(Payment.created_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        stmt = stmt.where(Payment.created_at < datetime.combine(to_date, datetime.min.time()) + timedelta(days=1))
    stmt = stmt.order_by(desc(Payment.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    payments = result.scalars().all()
    names = await _member_names([p.member_id for p in payments], db)
    return [_payment_response(p, names.get(p.member_id)) for p in payments]


async def _resolve_items(payload: PaymentCreate, db: AsyncSession) -> tuple[list[dict], Decimal]:
    """Resuelve los renglones de venta: snapshot de nombre/precio del catálogo y
    descuento de stock atómico (UPDATE condicional, 409 si no alcanza)."""
    items: list[dict] = []
    total = Decimal(0)
    for item in payload.items:
        if item.product_id:
            row = (await db.execute(
                update(Product)
                .where(
                    Product.id == item.product_id,
                    Product.is_active.is_(True),
                    Product.stock >= item.quantity,
                )
                .values(stock=Product.stock - item.quantity)
                .returning(Product.name, Product.price)
            )).first()
            if row is None:
                product = (await db.execute(
                    select(Product).where(Product.id == item.product_id)
                )).scalar_one_or_none()
                if not product:
                    raise HTTPException(status_code=404, detail="Producto no encontrado")
                if not product.is_active:
                    raise HTTPException(status_code=409, detail=f"{product.name} está archivado")
                raise HTTPException(
                    status_code=409,
                    detail=f"Stock insuficiente de {product.name}: quedan {product.stock}",
                )
            description = row.name
            unit_price = item.unit_price if item.unit_price is not None else row.price
        else:
            description = item.description
            unit_price = item.unit_price
        subtotal = (unit_price * item.quantity).quantize(Decimal("0.01"))
        items.append({
            "product_id": item.product_id,
            "description": description,
            "quantity": item.quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
        })
        total += subtotal
    return items, total


@router.post("", response_model=PaymentResponse, status_code=201)
async def create_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    member = None
    if payload.member_id is not None:
        member_result = await db.execute(select(Member).where(Member.id == payload.member_id))
        member = member_result.scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=404, detail="Miembro no encontrado")

    if payload.membership_id is not None:
        mem_result = await db.execute(
            select(Membership).where(Membership.id == payload.membership_id)
        )
        membership = mem_result.scalar_one_or_none()
        if not membership:
            raise HTTPException(status_code=404, detail="Membresía no encontrada")
        if membership.member_id != payload.member_id:
            raise HTTPException(
                status_code=400,
                detail="La membresía no pertenece a este miembro",
            )

    # El efectivo cobrado (paid) requiere un turno abierto para que cuadre la caja.
    # Un cash pendiente es una promesa de pago: no entra a caja todavía.
    shift = await _open_cash_shift(db)
    is_cash_paid = payload.method == PaymentMethod.cash and payload.status == PaymentStatus.paid
    if is_cash_paid and shift is None:
        raise HTTPException(
            status_code=400,
            detail="Abre un turno de caja antes de cobrar en efectivo",
        )

    items, items_total = await _resolve_items(payload, db)

    payment = Payment(**payload.model_dump(exclude={"items"}), received_by=current_user.id)
    if items:
        # El total de una venta con items siempre es la suma de sus renglones
        payment.amount = items_total
    if is_cash_paid:
        payment.shift_id = shift.id
    db.add(payment)
    await db.flush()
    for item in items:
        db.add(PaymentItem(payment_id=payment.id, **item))
    await db.flush()

    if payment.status == PaymentStatus.paid:
        await issue_receipt(db, payment)
    audit(db, current_user, "payment.create", "payment", payment.id, {
        "amount": str(payment.amount), "method": payment.method.value if payment.method else None,
        "status": payment.status.value, "items": len(items),
    })
    await db.commit()
    await db.refresh(payment)
    response = _payment_response(payment, member.full_name if member else None)
    response.items = [PaymentItemOut.model_validate(i) for i in (await db.execute(
        select(PaymentItem).where(PaymentItem.payment_id == payment.id)
    )).scalars().all()]
    return response


@router.get("/cash")
async def cash_box(
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Caja: ingresos pagados de hoy y del mes, con desglose por método."""
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    async def _totals(since: datetime) -> dict:
        stmt = (
            select(Payment.method, func.coalesce(func.sum(Payment.amount), 0), func.count())
            .where(Payment.status == PaymentStatus.paid, Payment.created_at >= since)
            .group_by(Payment.method)
        )
        result = await db.execute(stmt)
        by_method: dict[str, float] = {}
        total = Decimal(0)
        count = 0
        for method, amount, n in result.all():
            key = method.value if method else "unknown"
            by_method[key] = float(amount)
            total += amount
            count += n
        return {"total": float(total), "count": count, "by_method": by_method}

    return {
        "today": await _totals(today_start),
        "month": await _totals(month_start),
    }


@router.get("/receivables", response_model=list[ReceivableOut])
async def list_receivables(
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Cuentas por cobrar: membresías vencidas/en gracia (≤30 días) para renovar,
    y saldos parciales pendientes de membresías vigentes."""
    gym = await get_gym_settings(db)
    today = today_bogota()

    memberships = (await db.execute(
        select(Membership).order_by(desc(Membership.end_date))
    )).scalars().all()
    latest: dict[uuid.UUID, Membership] = {}
    for m in memberships:
        if m.member_id not in latest:
            latest[m.member_id] = m
    if not latest:
        return []

    member_rows = (await db.execute(
        select(Member.id, Member.full_name, Member.phone, Member.status)
        .where(Member.id.in_(list(latest.keys())))
    )).all()
    members = {mid: (name, phone, status) for mid, name, phone, status in member_rows}

    membership_ids = [m.id for m in latest.values()]
    paid_rows = (await db.execute(
        select(Payment.membership_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.membership_id.in_(membership_ids), Payment.status == PaymentStatus.paid)
        .group_by(Payment.membership_id)
    )).all()
    paid_by_membership = {mid: total for mid, total in paid_rows}
    linked_rows = (await db.execute(
        select(Payment.membership_id, func.count())
        .where(Payment.membership_id.in_(membership_ids))
        .group_by(Payment.membership_id)
    )).all()
    linked_by_membership = {mid: n for mid, n in linked_rows}

    results: list[ReceivableOut] = []
    for member_id, m in latest.items():
        info = members.get(member_id)
        if not info or info[2] != "active":
            continue
        name, phone, _ = info
        st = effective_status(m, today=today, grace_days=gym.grace_days)
        days_overdue = max((today - m.end_date).days, 0)

        if st in ("in_grace", "expired") and days_overdue <= 30:
            results.append(ReceivableOut(
                member_id=member_id, member_name=name, phone=phone,
                plan_name=m.plan_name, end_date=m.end_date,
                effective_status=st, days_overdue=days_overdue,
                amount_due=m.price, kind="renewal",
            ))
        elif st in ("active", "frozen") and linked_by_membership.get(m.id):
            balance = m.price - Decimal(paid_by_membership.get(m.id, 0))
            if balance > 0:
                results.append(ReceivableOut(
                    member_id=member_id, member_name=name, phone=phone,
                    plan_name=m.plan_name, end_date=m.end_date,
                    effective_status=st, days_overdue=0,
                    amount_due=balance, kind="balance",
                ))

    results.sort(key=lambda r: (-r.days_overdue, r.member_name))
    return results


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    names = await _member_names([payment.member_id], db)
    response = _payment_response(payment, names.get(payment.member_id))
    response.items = [PaymentItemOut.model_validate(i) for i in (await db.execute(
        select(PaymentItem).where(PaymentItem.payment_id == payment.id)
    )).scalars().all()]
    return response


@router.put("/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: uuid.UUID,
    payload: PaymentUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(payment, field, value)

    await db.commit()
    await db.refresh(payment)
    names = await _member_names([payment.member_id], db)
    return _payment_response(payment, names.get(payment.member_id))


@router.delete("/{payment_id}", status_code=204)
async def delete_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    receipt = (await db.execute(
        select(Receipt.id).where(Receipt.payment_id == payment_id).limit(1)
    )).scalar_one_or_none()
    if receipt:
        raise HTTPException(
            status_code=400,
            detail="Este pago ya tiene recibo emitido; usa un reembolso en vez de borrarlo",
        )
    # Devolver stock de los renglones de producto antes de borrar
    items = (await db.execute(
        select(PaymentItem).where(PaymentItem.payment_id == payment_id)
    )).scalars().all()
    for item in items:
        if item.product_id:
            await db.execute(
                update(Product)
                .where(Product.id == item.product_id)
                .values(stock=Product.stock + item.quantity)
            )
        await db.delete(item)
    await db.delete(payment)
    await db.commit()
    return None


@router.patch("/{payment_id}/mark-paid", response_model=PaymentResponse)
async def mark_payment_paid(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    """Marcar un pago como pagado (estado: paid). Genera el recibo y, si es
    efectivo, lo asocia al turno abierto."""
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.status == PaymentStatus.paid:
        raise HTTPException(status_code=400, detail="El pago ya está marcado como pagado")

    if payment.method == PaymentMethod.cash and payment.shift_id is None:
        shift = await _open_cash_shift(db)
        if shift is None:
            raise HTTPException(status_code=400, detail="Abre un turno de caja antes de cobrar en efectivo")
        payment.shift_id = shift.id

    payment.status = PaymentStatus.paid
    await db.flush()
    await issue_receipt(db, payment)
    audit(db, current_user, "payment.mark_paid", "payment", payment.id, {"amount": str(payment.amount)})
    await db.commit()
    await db.refresh(payment)
    names = await _member_names([payment.member_id], db)
    return _payment_response(payment, names.get(payment.member_id))


@router.post("/{payment_id}/payment-link")
async def create_payment_link(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    slug: str = Depends(get_tenant_slug),
):
    """Genera un link de pago Wompi para un pago pendiente."""
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id))).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.status != PaymentStatus.pending:
        raise HTTPException(status_code=400, detail="Solo se generan links para pagos pendientes")
    member = (await db.execute(select(Member).where(Member.id == payment.member_id))).scalar_one_or_none()
    link = await create_payment_link_for(
        db, payment, slug, member_name=member.full_name if member else "Miembro",
    )
    await db.commit()
    await db.refresh(link)
    return {"checkout_url": link.checkout_url, "reference": link.reference, "status": link.status}


@router.get("/{payment_id}/receipt")
async def get_receipt(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    receipt = (await db.execute(
        select(Receipt).where(Receipt.payment_id == payment_id)
    )).scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Este pago aún no tiene recibo (solo los pagados lo generan)")
    return {
        "number": receipt.snapshot.get("receipt_number"),
        "issued_at": receipt.issued_at,
        **receipt.snapshot,
    }
