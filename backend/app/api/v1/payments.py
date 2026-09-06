import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, update
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_tenant_slug, require_role
from app.core.timeutil import today_bogota
from app.schemas.member import PaymentCreate, PaymentUpdate, PaymentResponse
from app.schemas.pos import PaymentItemOut, ReceivableOut
from app.models.tenant.payment import Payment, PaymentStatus, PaymentMethod, PaymentKind
from app.models.tenant.payment_item import PaymentItem
from app.models.tenant.product import Product
from app.models.tenant.member import Member
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.cash_shift import CashShift
from app.models.tenant.receipt import Receipt
from app.models.tenant.user_staff import UserStaff, UserRole
from app.services.audit import audit
from app.services.gym_settings import get_gym_settings
from app.services.membership_status import effective_status
from app.services.receipts import issue_receipt
from app.services.payment_links import create_payment_link_for
from app.services.payments import (
    apply_payment_policy, activate_day_passes, void_day_passes, mark_voided, cancel_unpaid_membership,
    resolve_transfer_account, transfer_accounts, public_account, elapsed_minutes,
    open_cash_shift as _open_cash_shift,
)
from app.services.storage import upload_image
from app.core.timeutil import utcnow_naive
from fastapi import File, UploadFile

router = APIRouter(prefix="/payments", tags=["payments"])


async def _member_names(member_ids: list[uuid.UUID], db: AsyncSession) -> dict[uuid.UUID, str]:
    ids = [m for m in member_ids if m is not None]
    if not ids:
        return {}
    result = await db.execute(select(Member.id, Member.full_name).where(Member.id.in_(ids)))
    return {mid: name for mid, name in result.all()}


def _payment_response(payment: Payment, member_name: str | None, accounts: dict[str, dict] | None = None) -> PaymentResponse:
    data = PaymentResponse.model_validate(payment)
    data.member_name = member_name
    if accounts and payment.destination_account_id:
        data.destination_account = public_account(accounts.get(payment.destination_account_id))
    return data


async def _accounts_by_id(db: AsyncSession) -> dict[str, dict]:
    gym = await get_gym_settings(db)
    return {a["id"]: a for a in transfer_accounts(gym)}


def _infer_kind(payload: PaymentCreate, items: list[dict]) -> str:
    """La fuente se deduce de los datos; el cliente solo decide entre day_pass/other
    cuando no hay membresía ni productos (un abono no puede etiquetarse 'producto')."""
    if payload.membership_id is not None:
        return PaymentKind.membership.value
    if any(i.get("product_id") for i in items):
        return PaymentKind.product.value
    if payload.kind in (PaymentKind.day_pass, PaymentKind.other):
        return payload.kind.value
    return PaymentKind.other.value


@router.get("", response_model=list[PaymentResponse], dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def list_payments(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    member_id: uuid.UUID | None = Query(None),
    status: PaymentStatus | None = Query(None),
    kind: PaymentKind | None = Query(None),
    method: PaymentMethod | None = Query(None),
    destination_account_id: str | None = Query(None),
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
    if kind:
        stmt = stmt.where(Payment.kind == kind.value)
    if method:
        stmt = stmt.where(Payment.method == method)
    if destination_account_id:
        stmt = stmt.where(Payment.destination_account_id == destination_account_id)
    if from_date:
        stmt = stmt.where(Payment.created_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        stmt = stmt.where(Payment.created_at < datetime.combine(to_date, datetime.min.time()) + timedelta(days=1))
    stmt = stmt.order_by(desc(Payment.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    payments = result.scalars().all()
    names = await _member_names([p.member_id for p in payments], db)
    accounts = await _accounts_by_id(db)
    return [_payment_response(p, names.get(p.member_id), accounts) for p in payments]


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

    gym = await get_gym_settings(db)
    items, items_total = await _resolve_items(payload, db)

    payment = Payment(
        **payload.model_dump(exclude={"items", "transfer_account_id", "kind", "card_approval_code", "card_terminal"}),
        received_by=current_user.id,
    )
    if payload.discount_amount > 0 and not items:
        raise HTTPException(status_code=400, detail="El descuento aplica a ventas de productos; para membresías usa el descuento del plan")
    if items:
        # El total de una venta con items es la suma de sus renglones menos el descuento
        if payload.discount_amount > items_total:
            raise HTTPException(status_code=400, detail="El descuento no puede superar el total de la venta")
        payment.amount = items_total - payload.discount_amount
        if payment.amount <= 0:
            raise HTTPException(status_code=400, detail="El total de la venta debe ser mayor que cero")
    payment.kind = _infer_kind(payload, items)
    # Política por método: cash paid exige turno, transfer queda pendiente con
    # cuenta destino + referencia, card guarda el voucher
    account = await apply_payment_policy(
        db, payment, gym,
        transfer_account_id=payload.transfer_account_id,
        card_approval_code=payload.card_approval_code,
        card_terminal=payload.card_terminal,
    )
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
    response.destination_account = public_account(account)
    response.items = [PaymentItemOut.model_validate(i) for i in (await db.execute(
        select(PaymentItem).where(PaymentItem.payment_id == payment.id)
    )).scalars().all()]
    return response


class VoidRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


@router.post("/{payment_id}/void", response_model=PaymentResponse)
async def void_pending_payment(
    payment_id: uuid.UUID,
    payload: VoidRequest | None = None,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    """Anula un pago pendiente que nunca se concretó (la transferencia no llegó)."""
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id))).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.status != PaymentStatus.pending:
        raise HTTPException(status_code=400, detail=f"Solo se anulan pagos pendientes (está {payment.status.value})")
    reason = payload.reason if payload else None
    mark_voided(payment, reason, current_user.id)
    await void_day_passes(db, payment.id)
    membership_cancelled = await cancel_unpaid_membership(db, payment)
    audit(db, current_user, "payment.void", "payment", payment.id, {
        "amount": str(payment.amount), "method": payment.method.value if payment.method else None,
        "reason": reason, "membership_cancelled": membership_cancelled,
    })
    await db.commit()
    await db.refresh(payment)
    names = await _member_names([payment.member_id], db)
    return _payment_response(payment, names.get(payment.member_id))


_PROOF_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf"}


def _sniff_proof(data: bytes) -> str | None:
    """Tipo real por bytes iniciales (no se confía en el Content-Type del cliente)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:5] == b"%PDF-":
        return "application/pdf"
    return None


@router.post("/{payment_id}/proof", response_model=PaymentResponse)
async def upload_transfer_proof(
    payment_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
    slug: str = Depends(get_tenant_slug),
):
    """Adjunta el comprobante (pantallazo del giro) a una transferencia."""
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El comprobante supera 5 MB")
    real_type = _sniff_proof(data)
    ext = _PROOF_TYPES.get(real_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Formato no soportado (usa JPG, PNG, WEBP o PDF)")
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id))).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.method != PaymentMethod.transfer:
        raise HTTPException(status_code=400, detail="Solo las transferencias llevan comprobante")
    if payment.status != PaymentStatus.pending:
        raise HTTPException(status_code=400, detail="El comprobante se adjunta mientras la transferencia está pendiente")
    payment.proof_url = await upload_image(data, f"proofs/{slug}/{payment_id}.{ext}", real_type)
    payment.proof_uploaded_at = utcnow_naive()
    audit(db, current_user, "payment.proof", "payment", payment.id, {"content_type": file.content_type})
    await db.commit()
    await db.refresh(payment)
    names = await _member_names([payment.member_id], db)
    return _payment_response(payment, names.get(payment.member_id), await _accounts_by_id(db))


@router.get("/pending-transfers")
async def list_pending_transfers(
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Bandeja 'Por confirmar': transferencias pendientes, la más vieja primero."""
    payments = (await db.execute(
        select(Payment)
        .where(Payment.method == PaymentMethod.transfer, Payment.status == PaymentStatus.pending)
        .order_by(Payment.created_at)
    )).scalars().all()
    names = await _member_names([p.member_id for p in payments], db)
    accounts = await _accounts_by_id(db)
    out = []
    for p in payments:
        data = _payment_response(p, names.get(p.member_id), accounts).model_dump()
        data["elapsed_minutes"] = elapsed_minutes(p.created_at)
        out.append(data)
    return out


@router.get("/cash", dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def cash_box(
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Caja: ingresos pagados de hoy y del mes, con desglose por método."""
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    async def _totals(since: datetime) -> dict:
        stmt = (
            select(Payment.method, Payment.kind, func.coalesce(func.sum(Payment.amount), 0), func.count())
            .where(Payment.status == PaymentStatus.paid, Payment.created_at >= since)
            .group_by(Payment.method, Payment.kind)
        )
        result = await db.execute(stmt)
        by_method: dict[str, float] = {}
        by_kind: dict[str, float] = {}
        total = Decimal(0)
        count = 0
        for method, kind, amount, n in result.all():
            key = method.value if method else "unknown"
            by_method[key] = by_method.get(key, 0.0) + float(amount)
            by_kind[kind or "other"] = by_kind.get(kind or "other", 0.0) + float(amount)
            total += amount
            count += n
        pending_transfers = (await db.execute(
            select(func.count(), func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.method == PaymentMethod.transfer, Payment.status == PaymentStatus.pending,
                   Payment.created_at >= since)
        )).one()
        return {
            "total": float(total), "count": count, "by_method": by_method, "by_kind": by_kind,
            "pending_transfers": {"count": pending_transfers[0], "amount": float(pending_transfers[1])},
        }

    return {
        "today": await _totals(today_start),
        "month": await _totals(month_start),
    }


@router.get("/receivables", response_model=list[ReceivableOut], dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
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
        # Las canceladas no cuentan: pueden empatar en end_date con la vigente
        # y ocultarían su saldo pendiente
        if m.status == MembershipStatus.cancelled:
            continue
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
                plan_id=m.plan_id, plan_name=m.plan_name, end_date=m.end_date,
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


@router.get("/{payment_id}", response_model=PaymentResponse, dependencies=[Depends(get_current_staff)])
async def get_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    names = await _member_names([payment.member_id], db)
    response = _payment_response(payment, names.get(payment.member_id), await _accounts_by_id(db))
    response.items = [PaymentItemOut.model_validate(i) for i in (await db.execute(
        select(PaymentItem).where(PaymentItem.payment_id == payment.id)
    )).scalars().all()]
    return response


@router.put("/{payment_id}", response_model=PaymentResponse, dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
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


@router.delete("/{payment_id}", status_code=204, dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
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
            gym = await get_gym_settings(db)
            if gym.cash_shifts_enabled:
                raise HTTPException(status_code=400, detail="Abre un turno de caja antes de cobrar en efectivo")
        else:
            payment.shift_id = shift.id

    payment.status = PaymentStatus.paid
    payment.received_by = current_user.id
    await db.flush()
    await issue_receipt(db, payment)
    await activate_day_passes(db, payment.id)
    audit(db, current_user, "payment.mark_paid", "payment", payment.id, {"amount": str(payment.amount)})
    await db.commit()
    await db.refresh(payment)
    names = await _member_names([payment.member_id], db)
    return _payment_response(payment, names.get(payment.member_id))


@router.post("/{payment_id}/payment-link", dependencies=[Depends(get_current_staff)])
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


@router.get("/{payment_id}/receipt", dependencies=[Depends(get_current_staff)])
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
