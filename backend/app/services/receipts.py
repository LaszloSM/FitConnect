from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.member import Member
from app.models.tenant.payment import Payment
from app.models.tenant.receipt import Receipt
from app.services.gym_settings import get_gym_settings


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
    member = (await db.execute(
        select(Member).where(Member.id == payment.member_id)
    )).scalar_one_or_none()

    number = (await db.execute(text("SELECT nextval('receipt_number_seq')"))).scalar()
    snapshot = {
        "receipt_number": f"{gym.receipt_prefix}-{number:06d}",
        "member_name": member.full_name if member else None,
        "member_document": f"{member.id_type or ''} {member.id_number or ''}".strip() if member else None,
        "concept": payment.concept,
        "amount": str(payment.amount),
        "method": payment.method.value if payment.method else None,
        "payment_id": str(payment.id),
    }
    receipt = Receipt(payment_id=payment.id, number=number, snapshot=snapshot)
    db.add(receipt)
    return receipt
