from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import BOGOTA
from app.models.master.tenant import Tenant
from app.models.tenant.member import Member
from app.models.tenant.payment import Payment
from app.models.tenant.payment_item import PaymentItem
from app.models.tenant.receipt import Receipt
from app.models.tenant.user_staff import UserStaff
from app.services.gym_settings import get_gym_settings
from app.services.money_words import pesos_en_letras
from app.services.storage import resolve_media_url


async def issue_receipt(db: AsyncSession, payment: Payment) -> Receipt:
    """Genera el recibo de un pago pagado (idempotente: si ya existe, lo devuelve).
    El consecutivo viene de una secuencia por-tenant, atómica bajo concurrencia.
    NO hace commit — viaja en la transacción de quien confirma el pago."""
    existing = (await db.execute(
        select(Receipt).where(Receipt.payment_id == payment.id)
    )).scalar_one_or_none()
    if existing:
        return existing

    gym = await get_gym_settings(db)
    member = None
    if payment.member_id is not None:
        member = (await db.execute(
            select(Member).where(Member.id == payment.member_id)
        )).scalar_one_or_none()

    items = (await db.execute(
        select(PaymentItem).where(PaymentItem.payment_id == payment.id)
    )).scalars().all()

    number = (await db.execute(text("SELECT nextval('receipt_number_seq')"))).scalar()
    snapshot = {
        "receipt_number": f"{gym.receipt_prefix}-{number:06d}",
        "member_name": member.full_name if member else None,
        "member_document": (
            f"{getattr(member.id_type, 'value', member.id_type) or ''} {member.id_number or ''}".strip()
            if member else None
        ),
        "concept": payment.concept,
        "amount": str(payment.amount),
        "method": payment.method.value if payment.method else None,
        "kind": payment.kind,
        "discount_amount": str(payment.discount_amount or 0),
        "transfer_reference": payment.transfer_reference,
        "payment_id": str(payment.id),
        "items": [
            {
                "description": i.description,
                "quantity": i.quantity,
                "unit_price": str(i.unit_price),
                "subtotal": str(i.subtotal),
            }
            for i in items
        ],
    }
    receipt = Receipt(payment_id=payment.id, number=number, snapshot=snapshot)
    db.add(receipt)
    return receipt


_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def format_issued(issued: datetime) -> str:
    """«16 oct 2026 · 3:45 p. m.» en hora de Bogotá (issued_at llega en UTC)."""
    if issued.tzinfo is None:
        issued = issued.replace(tzinfo=timezone.utc)
    t = issued.astimezone(BOGOTA)
    hour = t.hour % 12 or 12
    meridiem = "a. m." if t.hour < 12 else "p. m."
    return f"{t.day} {_MONTHS[t.month - 1]} {t.year} · {hour}:{t.minute:02d} {meridiem}"


async def receipt_view(db: AsyncSession, receipt: Receipt, payment: Payment, tenant: Tenant) -> dict:
    """Todo lo que imprimen el PDF y la tirilla, armado en un solo sitio para que
    los dos documentos digan lo mismo."""
    gym = await get_gym_settings(db)
    snap = receipt.snapshot
    cashier = None
    if payment.received_by:
        cashier = (await db.execute(
            select(UserStaff.full_name).where(UserStaff.id == payment.received_by)
        )).scalar_one_or_none()

    amount = float(snap.get("amount") or 0)
    discount = float(payment.discount_amount or 0)
    items = snap.get("items") or []
    if items:
        subtotal = sum(float(i["subtotal"]) for i in items)
    else:
        subtotal = amount + discount
    address = ", ".join(x for x in (tenant.address, tenant.city) if x)
    return {
        "gym": {
            "name": tenant.name,
            "legal_name": gym.legal_name if gym.legal_name and gym.legal_name != tenant.name else None,
            "nit": gym.nit,
            "tax_regime": gym.tax_regime,
            "address": address or None,
            "phone": tenant.phone,
            "logo_url": resolve_media_url(tenant.logo_url),
        },
        "issued_label": format_issued(receipt.issued_at),
        "status": getattr(payment.status, "value", payment.status),
        "cashier_name": cashier,
        "card_approval_code": payment.card_approval_code,
        "transfer_reference": payment.transfer_reference or snap.get("transfer_reference"),
        "discount_amount": f"{discount:.2f}",
        "discount_note": payment.discount_note,
        "subtotal": f"{subtotal:.2f}",
        "amount_in_words": pesos_en_letras(amount),
        "refunded_at": payment.refunded_at,
        "refund_reason": payment.refund_reason,
    }
