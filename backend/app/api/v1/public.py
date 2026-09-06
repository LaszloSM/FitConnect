"""Endpoints públicos por enlace firmado (sin JWT): el socio abre su comprobante
desde WhatsApp. El tenant se resuelve por slug como en el webhook de Wompi."""
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.master_session import MasterSessionLocal
from app.db.tenant_session import get_tenant_engine
from app.models.master.tenant import Tenant
from app.models.tenant.payment import Payment
from app.models.tenant.receipt import Receipt
from app.services.exports import fetch_logo_png
from app.services.receipt_pdf import build_receipt_pdf
from app.services.signed_links import verify

router = APIRouter(prefix="/public", tags=["public"])

RECEIPT_SCOPE = "receipt"


@router.get("/receipts/{slug}/{token}.pdf")
@limiter.limit("10/minute")
async def public_receipt_pdf(request: Request, slug: str, token: str):
    signed = verify(RECEIPT_SCOPE, token)
    # El token ata el recibo a SU gym: un enlace de un gym no abre nada en otro
    if not signed or ":" not in signed or signed.split(":", 1)[0] != slug:
        raise HTTPException(status_code=404, detail="Enlace inválido o vencido")
    payment_id = signed.split(":", 1)[1]
    async with MasterSessionLocal() as master_db:
        tenant = (await master_db.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none()
    if not tenant or getattr(tenant.status, "value", tenant.status) != "active":
        raise HTTPException(status_code=404, detail="Enlace inválido o vencido")

    engine = get_tenant_engine(settings.tenant_database_url_template.replace("{db_name}", tenant.db_name))
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        payment = (await db.execute(select(Payment).where(Payment.id == uuid.UUID(payment_id)))).scalar_one_or_none()
        receipt = (await db.execute(select(Receipt).where(Receipt.payment_id == uuid.UUID(payment_id)))).scalar_one_or_none()
        if not payment or not receipt:
            raise HTTPException(status_code=404, detail="Enlace inválido o vencido")
        logo = await fetch_logo_png(tenant.logo_url)
        pdf = await build_receipt_pdf(db, receipt, payment, gym_name=tenant.name, logo_png=logo)
    import re
    number = re.sub(r"[^A-Za-z0-9._-]", "", receipt.snapshot.get("receipt_number", "") or "") or "recibo"
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="comprobante-{number}.pdf"'},
    )
