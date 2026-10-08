"""Endpoints públicos por enlace firmado (sin JWT): el socio abre su comprobante
desde WhatsApp. El tenant se resuelve por slug como en el webhook de Wompi."""
import re
import uuid
from datetime import date, datetime

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
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
from app.core.timeutil import today_bogota
from app.services.audit import audit
from app.models.tenant.member import Gender, Member
from app.schemas.member import PARQ_REQUIRED_KEYS, MemberBase, normalize_id_number
from app.services import member_profile

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
    if not tenant or getattr(tenant.status, "value", tenant.status) == "suspended":
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
    # En prueba, cortesía, pago pendiente o solo lectura los enlaces siguen sirviendo.
    if not tenant or getattr(tenant.status, "value", tenant.status) == "suspended":
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


# ─── Enlace para que el socio complete su ficha ───

_LINK_INVALIDO = "Este enlace ya no sirve: venció o ya se usó. Pídele uno nuevo a tu gimnasio."


class PublicProfileIn(BaseModel):
    """Solo se escriben los campos que la ficha tiene VACÍOS: un enlace reenviado
    no sirve para cambiar lo que el gimnasio ya tiene registrado."""
    id_number: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    birth_date: date | None = None
    gender: Gender | None = None
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=100)
    emergency_contact_name: str | None = Field(default=None, max_length=255)
    emergency_contact_phone: str | None = Field(default=None, max_length=50)
    eps: str | None = Field(default=None, max_length=100)
    blood_type: str | None = Field(default=None, max_length=5)
    parq_answers: dict | None = None
    accept_data: bool = False
    accept_image: bool = False


async def _profile_link(db, token: str):
    if not _TOKEN_OK.match(token):
        raise HTTPException(status_code=404, detail=_LINK_INVALIDO)
    link = await member_profile.find_link(db, token)
    member = await db.get(Member, link.member_id) if link else None
    if not link or not member:
        raise HTTPException(status_code=404, detail=_LINK_INVALIDO)
    return link, member


@router.get("/profile/{slug}/{token}")
@limiter.limit("30/minute")
async def public_profile(request: Request, slug: str, token: str):
    """Qué le falta a la ficha. No devuelve los datos que ya tiene: el enlace
    puede terminar en otras manos y no debe mostrar nada personal."""
    tenant = await _tenant_activo(slug)
    async with _tenant_session(tenant) as db:
        link, member = await _profile_link(db, token)
        if link.opened_at is None:
            link.opened_at = datetime.utcnow()
            await db.commit()
        st = member_profile.status(member)
        return {
            "gym_name": tenant.name,
            "first_name": (member.full_name or "").split(" ")[0].title(),
            "missing": st["missing"] + [k for k in st["missing_optional"] if k != "photo"],
            "labels": st["labels"],
            "has_photo": bool(member.photo_url),
            "image_consent": member.consent_image_at is not None,
            "expires_at": link.expires_at.isoformat(),
        }


def _norm_phone(v: str | None) -> str | None:
    return MemberBase.normalize_colombian_phone(v) if v else v


@router.post("/profile/{slug}/{token}")
@limiter.limit("10/minute")
async def public_profile_submit(request: Request, slug: str, token: str, payload: PublicProfileIn):
    tenant = await _tenant_activo(slug)
    async with _tenant_session(tenant) as db:
        link, member = await _profile_link(db, token)
        if member.consent_data_at is None and not payload.accept_data:
            raise HTTPException(status_code=422, detail="Para guardar tus datos debes aceptar la política de tratamiento de datos.")
        data = payload.model_dump(exclude_none=True)
        data.pop("accept_data", None)
        data.pop("accept_image", None)
        if "phone" in data:
            data["phone"] = _norm_phone(data["phone"])
        if "emergency_contact_phone" in data:
            data["emergency_contact_phone"] = _norm_phone(data["emergency_contact_phone"])
        if "blood_type" in data:
            data["blood_type"] = data["blood_type"].upper()
            if data["blood_type"] not in {"A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"}:
                raise HTTPException(status_code=422, detail="RH no válido")
        if "email" in data:
            data["email"] = data["email"].strip().lower()
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", data["email"]):
                raise HTTPException(status_code=422, detail="Correo no válido")
        id_conflict = False
        if "id_number" in data:
            data["id_number"] = normalize_id_number(data["id_number"])
            if member.id_number is None:
                taken = (await db.execute(
                    select(Member.id).where(Member.id_number == data["id_number"], Member.id != member.id)
                )).first()
                if taken:
                    # No se le dice al que tiene el enlace: sería una forma de averiguar
                    # quién es socio del gimnasio. Recepción lo ve en la auditoría.
                    data.pop("id_number")
                    id_conflict = True
        parq = data.pop("parq_answers", None)
        filled: list[str] = []
        for key, value in data.items():
            if isinstance(value, str):
                value = value.strip()
            if value in ("", None) or getattr(member, key, None):
                continue
            setattr(member, key, value)
            filled.append(key)
        if parq is not None and member.parq_completed_at is None:
            if PARQ_REQUIRED_KEYS - {k for k, v in parq.items() if isinstance(v, bool)}:
                raise HTTPException(status_code=422, detail="Responde las 7 preguntas del cuestionario de salud.")
            member.parq_answers = {k: bool(parq[k]) for k in sorted(PARQ_REQUIRED_KEYS)}
            member.parq_completed_at = today_bogota()
            filled.append("parq")
        now = datetime.utcnow()
        if payload.accept_data and member.consent_data_at is None:
            member.consent_data_at = now
            filled.append("consent_data")
        if payload.accept_image and member.consent_image_at is None:
            member.consent_image_at = now
            filled.append("consent_image")
        link.used_at = now
        audit(db, None, "member.profile_self_update", "member", member.id,
              {"fields": filled, **({"id_number_conflict": True} if id_conflict else {})},
              actor_name="El socio (enlace)")
        await db.commit()
        parq_alert = bool(parq and any(parq.values()))
        return {"ok": True, "filled": filled, "parq_alert": parq_alert,
                "complete": member_profile.status(member)["complete"]}


def _clean_photo(raw: bytes) -> bytes:
    """Se abre como imagen de verdad (no basta el content-type que manda el
    navegador) y se vuelve a guardar como JPEG: sale sin metadatos EXIF, que en
    una foto de celular pueden traer la ubicación GPS."""
    import io
    from PIL import Image, ImageOps
    try:
        img = Image.open(io.BytesIO(raw))
        if img.format not in ("JPEG", "PNG", "WEBP"):
            raise ValueError(img.format)
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es una foto JPG, PNG o WEBP") from None
    img.thumbnail((1024, 1024))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


@router.post("/profile/{slug}/{token}/photo")
@limiter.limit("5/minute")
async def public_profile_photo(request: Request, slug: str, token: str, file: UploadFile = File(...),
                               accept_image: bool = Form(False)):
    """Foto de la ficha, si no tiene, con la autorización de imagen marcada en este
    paso. Va antes del envío del formulario (el enlace aún no está usado)."""
    from app.services.storage import upload_image
    data = bytearray()
    while chunk := await file.read(1024 * 1024):
        data.extend(chunk)
        if len(data) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="La foto supera 5 MB")
    tenant = await _tenant_activo(slug)
    async with _tenant_session(tenant) as db:
        _, member = await _profile_link(db, token)
        if member.photo_url:
            raise HTTPException(status_code=409, detail="Tu ficha ya tiene foto. Si quieres cambiarla, pídelo en recepción.")
        if member.consent_image_at is None and not accept_image:
            raise HTTPException(status_code=422, detail="Para guardar tu foto debes autorizar el uso de tu imagen.")
        jpeg = _clean_photo(bytes(data))
        if member.consent_image_at is None:
            member.consent_image_at = datetime.utcnow()
        member.photo_url = await upload_image(jpeg, f"members/{slug}/{member.id}.jpg", "image/jpeg")
        await db.commit()
    return {"ok": True}
