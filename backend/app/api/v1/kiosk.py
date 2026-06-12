import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_kiosk_db,
    get_kiosk_payload,
    get_tenant_db_from_token,
    get_db_name,
    get_current_staff,
    require_role,
)
from app.core.rate_limit import limiter
from app.core.security import create_kiosk_token
from app.core.timeutil import utcnow_naive
from app.models.tenant.kiosk_device import KioskDevice
from app.models.tenant.member import Member
from app.models.tenant.user_staff import UserStaff, UserRole
from app.services.audit import audit
from app.services.checkin import register_checkin, DuplicateCheckin

router = APIRouter(prefix="/kiosk", tags=["kiosk"])


class KioskCheckinRequest(BaseModel):
    id_number: str | None = Field(default=None, max_length=50)
    qr_code: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def one_identifier(self):
        if not self.id_number and not self.qr_code:
            raise ValueError("Se requiere id_number o qr_code")
        return self


@router.post("/checkin")
@limiter.limit("30/minute")
async def kiosk_checkin(
    request: Request,
    payload: KioskCheckinRequest,
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    """Check-in desde el kiosko de la entrada. Respuesta mínima: sin PII más
    allá del nombre/foto que el propio miembro ve en pantalla."""
    if payload.qr_code:
        member = (await db.execute(
            select(Member).where(Member.qr_code == payload.qr_code)
        )).scalar_one_or_none()
    else:
        member = (await db.execute(
            select(Member).where(Member.id_number == payload.id_number.strip())
        )).scalar_one_or_none()
    if not member:
        return {
            "decision": "not_found",
            "message": "No encontramos tu documento. Acércate a recepción.",
        }

    try:
        checkin, status, upcoming_class = await register_checkin(
            db, member, source="kiosk", db_name=token["db_name"]
        )
    except DuplicateCheckin:
        return {
            "decision": "duplicate",
            "member_name": member.full_name,
            "message": "Ya registraste tu entrada hace unos minutos. ¡Buen entrenamiento!",
        }
    await db.commit()

    first_name = member.full_name.split(" ")[0]
    if checkin.decision == "allowed":
        message = f"¡Bienvenido, {first_name}!"
        if status == "in_grace":
            message = f"Bienvenido, {first_name} — tu plan venció, recuerda pagar en recepción."
        if upcoming_class:
            message += f" Tienes {upcoming_class['class_name']} a las {upcoming_class['start_time']}."
    else:
        message = f"{first_name}, dirígete a recepción para activar tu plan."

    return {
        "decision": checkin.decision,
        "membership_status": status,
        "member_name": member.full_name,
        "photo_url": member.photo_url,
        "upcoming_class": upcoming_class,
        "message": message,
    }


@router.get("/ping")
async def kiosk_ping(
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    device = (await db.execute(
        select(KioskDevice).where(KioskDevice.id == token["device_id"])
    )).scalar_one()
    device.last_seen_at = utcnow_naive()
    await db.commit()
    return {"ok": True, "device_name": device.name}


# ─── Gestión de dispositivos (staff, solo owner/admin) ───

class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


@router.get("/devices")
async def list_devices(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    devices = (await db.execute(
        select(KioskDevice).order_by(KioskDevice.created_at.desc())
    )).scalars().all()
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "is_active": d.is_active,
            "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
            "created_at": d.created_at.isoformat(),
        }
        for d in devices
    ]


@router.post("/devices", status_code=201)
async def create_device(
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    db_name: str = Depends(get_db_name),
    current_user: UserStaff = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    """Crea el dispositivo y devuelve su token UNA sola vez (no se vuelve a mostrar)."""
    jti = str(uuid.uuid4())
    device = KioskDevice(name=payload.name, token_jti=jti, created_by=current_user.id)
    db.add(device)
    await db.flush()
    token = create_kiosk_token(str(device.id), db_name, jti)
    audit(db, current_user, "kiosk.device_create", "kiosk_device", device.id, {"name": device.name})
    await db.commit()
    return {"id": str(device.id), "name": device.name, "token": token}


@router.delete("/devices/{device_id}")
async def revoke_device(
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    device = (await db.execute(
        select(KioskDevice).where(KioskDevice.id == device_id)
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    device.is_active = False
    audit(db, current_user, "kiosk.device_revoke", "kiosk_device", device.id, {"name": device.name})
    await db.commit()
    return {"revoked": True}
