"""Endpoints públicos por enlace firmado (sin JWT): el socio abre su comprobante
desde WhatsApp. El tenant se resuelve por slug como en el webhook de Wompi."""
import re
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.master_session import MasterSessionLocal
from app.db.tenant_session import get_tenant_engine
from app.models.master.tenant import Tenant
from app.models.tenant.machine import Machine, MachineStatus
from app.models.tenant.maintenance import MaintenanceLog
from app.models.tenant.payment import Payment
from app.services.machine_areas import AREA_LABELS
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
    number = re.sub(r"[^A-Za-z0-9._-]", "", receipt.snapshot.get("receipt_number", "") or "") or "recibo"
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="comprobante-{number}.pdf"'},
    )


# ─── QR pegado en la máquina ───

_TOKEN_OK = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
_NO_ENCONTRADA = "Este código ya no es válido. Avísale a recepción."


class PublicFaultReport(BaseModel):
    description: str = Field(min_length=3, max_length=1000)
    reporter_name: str | None = Field(default=None, max_length=120)


async def _tenant_activo(slug: str) -> Tenant:
    async with MasterSessionLocal() as master_db:
        tenant = (await master_db.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none()
    if not tenant or getattr(tenant.status, "value", tenant.status) != "active":
        raise HTTPException(status_code=404, detail=_NO_ENCONTRADA)
    return tenant


def _tenant_session(tenant: Tenant):
    engine = get_tenant_engine(settings.tenant_database_url_template.replace("{db_name}", tenant.db_name))
    return async_sessionmaker(engine, expire_on_commit=False)()


async def _machine_by_token(db, token: str) -> Machine:
    machine = (await db.execute(select(Machine).where(Machine.report_token == token))).scalar_one_or_none()
    if not machine or machine.status == MachineStatus.retired:
        raise HTTPException(status_code=404, detail=_NO_ENCONTRADA)
    return machine


@router.get("/machines/{slug}/{token}")
@limiter.limit("30/minute")
async def public_machine(request: Request, slug: str, token: str):
    if not _TOKEN_OK.match(token):
        raise HTTPException(status_code=404, detail=_NO_ENCONTRADA)
    tenant = await _tenant_activo(slug)
    async with _tenant_session(tenant) as db:
        machine = await _machine_by_token(db, token)
        return {
            "gym_name": tenant.name,
            "machine_name": machine.name,
            "area": AREA_LABELS.get(machine.area or "", machine.area),
            "already_reported": machine.status == MachineStatus.damaged,
        }


@router.post("/machines/{slug}/{token}/fault", status_code=201)
@limiter.limit("5/minute")
async def public_machine_fault(request: Request, slug: str, token: str, payload: PublicFaultReport):
    """Reporte de avería sin cuenta, desde el QR de la máquina.

    Queda como correctivo "Pendiente de asignar" y la máquina sale de circulación,
    igual que un reporte desde el mostrador. El nombre es opcional y se marca como
    reportado por QR: no se puede verificar quién lo escribió.
    """
    if not _TOKEN_OK.match(token):
        raise HTTPException(status_code=404, detail=_NO_ENCONTRADA)
    tenant = await _tenant_activo(slug)
    async with _tenant_session(tenant) as db:
        machine = await _machine_by_token(db, token)
        nombre = (payload.reporter_name or "").strip()
        db.add(MaintenanceLog(
            machine_id=machine.id,
            description=payload.description.strip(),
            technician="Pendiente de asignar",
            kind="correctivo",
            reported_by=f"{nombre} (QR)" if nombre else "Reporte por QR",
        ))
        machine.status = MachineStatus.damaged
        await db.commit()
    return {"ok": True}
