from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.payment import Payment
from app.models.tenant.payment_link import PaymentLink
from app.services.gym_settings import get_gym_settings, secret
from app.services.wompi import WompiClient


async def create_payment_link_for(
    db: AsyncSession,
    payment: Payment,
    slug: str,
    *,
    member_name: str,
    membership_intent: dict | None = None,
) -> PaymentLink:
    """Crea un link de pago Wompi para un Payment pendiente. Idempotente:
    si ya existe un link del pago, lo devuelve."""
    existing = (await db.execute(
        select(PaymentLink).where(PaymentLink.payment_id == payment.id)
    )).scalar_one_or_none()
    if existing:
        return existing

    gym = await get_gym_settings(db)
    private_key = secret(gym, "wompi_private_key")
    if not gym.wompi_public_key or not private_key:
        raise HTTPException(status_code=400, detail="El gym no tiene configuradas las llaves de Wompi")

    amount_in_cents = int((Decimal(payment.amount) * 100).to_integral_value())
    reference = f"FC-{slug}-{payment.id.hex[:12]}"
    client = WompiClient(gym.wompi_public_key, private_key)
    data = await client.create_payment_link(
        name=f"Pago {gym.receipt_prefix}",
        description=payment.concept,
        amount_in_cents=amount_in_cents,
        reference=reference,
    )
    link_id = data.get("id")
    checkout_url = f"https://checkout.wompi.co/l/{link_id}" if link_id else None

    link = PaymentLink(
        payment_id=payment.id,
        wompi_link_id=link_id,
        reference=reference,
        amount_in_cents=amount_in_cents,
        checkout_url=checkout_url,
        status="created",
        membership_intent=membership_intent,
    )
    db.add(link)
    return link
