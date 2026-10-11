import ipaddress
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Literal, Optional

from pydantic import BaseModel, field_validator, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_kiosk_db,
    get_kiosk_payload,
    get_tenant_db_from_token,
    get_db_name,
    require_perm,
)
from app.core import permissions as perm
from app.core.rate_limit import limiter
from app.core.security import create_kiosk_token
from app.core.timeutil import utcnow_naive
from app.models.tenant.kiosk_device import KioskDevice
from app.models.tenant.member import Member
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.checkin import register_checkin, DuplicateCheckin
from app.services.storage import resolve_media_url

router = APIRouter(prefix="/kiosk", tags=["kiosk"])


class KioskCheckinRequest(BaseModel):
    id_number: str = Field(min_length=3, max_length=50)


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
        "photo_url": resolve_media_url(member.photo_url),
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
    resp = {"ok": True, "device_name": device.name}
    # Renovación deslizante: si al token le quedan menos de 7 días, emitimos uno
    # nuevo (mismo jti, así la revocación por is_active/jti sigue valiendo).
    exp = token.get("exp")
    if exp and datetime.fromtimestamp(exp, tz=timezone.utc) - datetime.now(timezone.utc) < timedelta(days=7):
        resp["renewed_token"] = create_kiosk_token(token["device_id"], token["db_name"], token["jti"])
    return resp


# ─── Gestión de dispositivos (staff, solo owner/admin) ───

DeviceKind = Literal["kiosk", "turnstile", "reader", "screen"]
OfflinePolicy = Literal["deny", "allow_recent"]
#: zk_adms: ZKTeco llama solo a la nube (/iclock). hik_isapi y zk_tcp: por el
#: agente local. generic: un agente que solo pregunta /access/verify.
AccessProtocol = Literal["zk_adms", "hik_isapi", "zk_tcp", "generic"]


class AccessConfig(BaseModel):
    """Lo que cambia entre marcas y firmwares, ajustable al instalar."""
    protocol: Optional[AccessProtocol] = None
    #: timezone: el equipo conserva rostro/huella y se bloquea por horario (ZKTeco).
    #: delete: se borra del equipo al vencer (hay que volver a enrolar).
    #: validity: el equipo guarda la fecha de vigencia (Hikvision).
    block_strategy: Optional[Literal["timezone", "delete", "validity"]] = None
    #: document: el ID en el equipo es la cédula. sequential: 1, 2, 3 (equipos con PIN cortos).
    pin_mode: Optional[Literal["document", "sequential"]] = None
    enroll_command: Optional[Literal["ENROLL_FP", "ENROLL_BIO"]] = None
    open_command: Optional[str] = Field(default=None, max_length=60, pattern=r"^[A-Z_ ]+[0-9A-Fa-f ]*$")
    allowed_ips: Optional[list[str]] = Field(default=None, max_length=10)
    door: Optional[int] = Field(default=None, ge=1, le=8)

    @field_validator("allowed_ips")
    @classmethod
    def _valid_ips(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        out = []
        for ip in v:
            try:
                out.append(str(ipaddress.ip_address(ip.strip())))
            except ValueError:
                raise ValueError(f"IP no válida: {ip}") from None
        return out


_CONFIG_KEYS = set(AccessConfig.model_fields)


def _merge_config(device: KioskDevice, cfg: Optional[AccessConfig]) -> None:
    if cfg is None:
        return
    current = dict(device.config or {})
    for k, v in cfg.model_dump(exclude_unset=True).items():
        if v is None:
            current.pop(k, None)
        else:
            current[k] = v
    device.config = current


async def _sync_directory(device: KioskDevice, db_name: str) -> None:
    """Los equipos por ADMS se identifican solo por serial: se registra en el
    índice global. Un serial de otro gimnasio se rechaza."""
    from app.services import device_directory
    if (device.config or {}).get("protocol") == "zk_adms" and device.serial and device.is_active:
        try:
            await device_directory.register(device.serial, db_name, device.id)
        except device_directory.SerialTaken:
            raise HTTPException(status_code=409, detail="Ese número de serie ya está registrado en otro gimnasio")
    else:
        await device_directory.unregister_device(db_name, device.id)


class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: DeviceKind = "kiosk"
    vendor: Optional[str] = Field(default=None, max_length=30)
    model: Optional[str] = Field(default=None, max_length=60)
    serial: Optional[str] = Field(default=None, max_length=80)
    location: Optional[str] = Field(default=None, max_length=80)
    offline_policy: OfflinePolicy = "deny"
    access: Optional[AccessConfig] = None


def _device_out(d: KioskDevice) -> dict:
    return {
        "id": str(d.id), "name": d.name, "kind": d.kind, "vendor": d.vendor, "model": d.model, "serial": d.serial,
        "location": d.location, "offline_policy": d.offline_policy, "is_active": d.is_active,
        "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None, "created_at": d.created_at.isoformat(),
        "access": {k: v for k, v in (d.config or {}).items() if k in _CONFIG_KEYS},
        "firmware": (d.config or {}).get("firmware"),
    }


@router.get("/devices")
async def list_devices(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.KIOSK_MANAGE)),
):
    devices = (await db.execute(
        select(KioskDevice).order_by(KioskDevice.created_at.desc())
    )).scalars().all()
    return [_device_out(d) for d in devices]


@router.post("/devices", status_code=201)
async def create_device(
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    db_name: str = Depends(get_db_name),
    current_user: UserStaff = Depends(require_perm(perm.KIOSK_MANAGE)),
):
    """Crea el dispositivo y devuelve su token UNA sola vez (no se vuelve a mostrar)."""
    jti = str(uuid.uuid4())
    device = KioskDevice(name=payload.name, token_jti=jti, created_by=current_user.id, kind=payload.kind, vendor=payload.vendor,
                         model=payload.model, serial=(payload.serial or "").strip() or None, location=payload.location,
                         offline_policy=payload.offline_policy, config={})
    _merge_config(device, payload.access)
    db.add(device)
    await db.flush()
    await _sync_directory(device, db_name)
    token = create_kiosk_token(str(device.id), db_name, jti)
    audit(db, current_user, "kiosk.device_create", "kiosk_device", device.id, {"name": device.name, "kind": device.kind})
    await db.commit()
    return {**_device_out(device), "token": token}


class DeviceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    kind: Optional[DeviceKind] = None
    vendor: Optional[str] = Field(default=None, max_length=30)
    model: Optional[str] = Field(default=None, max_length=60)
    serial: Optional[str] = Field(default=None, max_length=80)
    location: Optional[str] = Field(default=None, max_length=80)
    offline_policy: Optional[OfflinePolicy] = None
    access: Optional[AccessConfig] = None


@router.patch("/devices/{device_id}")
async def rename_device(
    device_id: uuid.UUID,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    db_name: str = Depends(get_db_name),
    current_user: UserStaff = Depends(require_perm(perm.KIOSK_MANAGE)),
):
    device = (await db.execute(
        select(KioskDevice).where(KioskDevice.id == device_id)
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    changes = payload.model_dump(exclude_none=True, exclude={"access"})
    for k, v in changes.items():
        setattr(device, k, v.strip() if k == "serial" and isinstance(v, str) else v)
    _merge_config(device, payload.access)
    await _sync_directory(device, db_name)
    audit(db, current_user, "kiosk.device_update", "kiosk_device", device.id,
          {**changes, **({"access": payload.access.model_dump(exclude_unset=True)} if payload.access else {})})
    await db.commit()
    return _device_out(device)


@router.post("/devices/{device_id}/regenerate-link")
async def regenerate_device_link(
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    db_name: str = Depends(get_db_name),
    current_user: UserStaff = Depends(require_perm(perm.KIOSK_MANAGE)),
):
    """Emite un token nuevo para el dispositivo rotando el jti: el enlace
    anterior deja de funcionar (no se guardan tokens en claro)."""
    device = (await db.execute(
        select(KioskDevice).where(KioskDevice.id == device_id)
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    if not device.is_active:
        raise HTTPException(status_code=400, detail="El dispositivo está revocado")
    device.token_jti = str(uuid.uuid4())
    token = create_kiosk_token(str(device.id), db_name, device.token_jti)
    audit(db, current_user, "kiosk.device_regenerate_link", "kiosk_device", device.id,
          {"name": device.name})
    await db.commit()
    return {"id": str(device.id), "name": device.name, "token": token}


@router.delete("/devices/{device_id}")
async def revoke_device(
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    db_name: str = Depends(get_db_name),
    current_user: UserStaff = Depends(require_perm(perm.KIOSK_MANAGE)),
):
    device = (await db.execute(
        select(KioskDevice).where(KioskDevice.id == device_id)
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    device.is_active = False
    from app.services import device_directory
    await device_directory.unregister_device(db_name, device.id)
    audit(db, current_user, "kiosk.device_revoke", "kiosk_device", device.id, {"name": device.name})
    await db.commit()
    return {"revoked": True}
