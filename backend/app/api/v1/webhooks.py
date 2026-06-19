import logging
import re

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.timeutil import now_bogota
from app.db.master_session import MasterSessionLocal
from app.db.tenant_session import get_tenant_engine
from app.models.master.tenant import Tenant
from app.models.tenant.payment_link import PaymentLink, WebhookEvent
from app.services.gym_settings import get_gym_settings, secret
from app.services.payment_confirmation import confirm_payment
from app.services.wompi import verify_event_signature

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# reference = FC-{slug}-{hex12}; el slug puede contener guiones, hex12 al final.
_REFERENCE_RE = re.compile(r"^FC-(?P<slug>.+)-[0-9a-f]{12}$")


def _ok():
    return JSONResponse({"received": True}, status_code=200)


@router.post("/wompi")
@limiter.limit("120/minute")
async def wompi_webhook(request: Request):
    """Webhook público de Wompi (sin JWT). Resuelve el tenant por el slug del
    reference, verifica la firma con el secret del gym y confirma el pago."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    data = body.get("data", {})
    transaction = data.get("transaction", {})
    reference = transaction.get("reference")
    event_id = transaction.get("id")
    tx_status = transaction.get("status")
    if not reference or not event_id:
        return JSONResponse({"error": "missing fields"}, status_code=400)

    m = _REFERENCE_RE.match(reference)
    if not m:
        logger.warning("Webhook con reference inválido: %s", reference)
        return JSONResponse({"error": "bad reference"}, status_code=400)
    slug = m.group("slug")

    async with MasterSessionLocal() as master_db:
        tenant = (await master_db.execute(
            select(Tenant).where(Tenant.slug == slug)
        )).scalar_one_or_none()
    if not tenant:
        logger.warning("Webhook para tenant inexistente: %s", slug)
        return JSONResponse({"error": "unknown tenant"}, status_code=404)

    connection_string = settings.tenant_database_url_template.replace("{db_name}", tenant.db_name)
    engine = get_tenant_engine(connection_string)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        gym = await get_gym_settings(db)
        events_secret = secret(gym, "wompi_events_secret")
        if not events_secret or not verify_event_signature(body, events_secret):
            logger.warning("Firma de webhook inválida para %s", slug)
            return JSONResponse({"error": "invalid signature"}, status_code=403)

        # Idempotencia: si ya procesamos este event_id, salir 200.
        existing = (await db.execute(
            select(WebhookEvent).where(WebhookEvent.event_id == event_id)
        )).scalar_one_or_none()
        if existing:
            return _ok()
        db.add(WebhookEvent(
            provider="wompi", event_id=event_id, transaction_id=event_id,
            reference=reference, raw=body, processed_at=now_bogota(),
        ))

        link = (await db.execute(
            select(PaymentLink).where(PaymentLink.reference == reference)
        )).scalar_one_or_none()
        if link:
            if tx_status == "APPROVED":
                await confirm_payment(db, link.payment_id, event_id)
            elif tx_status in ("DECLINED", "ERROR"):
                from app.models.tenant.payment import Payment, PaymentStatus
                await db.execute(
                    Payment.__table__.update()
                    .where(Payment.id == link.payment_id, Payment.status == PaymentStatus.pending)
                    .values(status=PaymentStatus.failed)
                )
            elif tx_status == "VOIDED":
                link.status = "voided"
        await db.commit()

    return _ok()
