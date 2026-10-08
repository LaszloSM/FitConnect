"""Torniquetes y lectores: lo que hace el personal y lo que pide el agente local.

Personal (JWT de staff):
- estado del equipo, usuarios que tiene, sincronizar, abrir la puerta;
- enrolar rostro o huella de un socio en un equipo y seguir el progreso;
- enlazar un usuario del equipo con su socio (toma de control).

Agente local (token del dispositivo, el mismo del kiosko):
- recoger comandos y reportar el resultado;
- subir marcaciones y la lista de usuarios del equipo.
"""
import base64
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_kiosk_db, get_kiosk_payload, get_tenant_db_from_token, require_perm
from app.core import permissions as perm
from app.core.rate_limit import limiter
from app.core.timeutil import utcnow_naive
from app.models.tenant.access import BiometricConsent
from app.models.tenant.device_command import DeviceCommand
from app.models.tenant.device_user import DeviceUser
from app.models.tenant.kiosk_device import KioskDevice
from app.models.tenant.member import Member
from app.models.tenant.user_staff import UserStaff
from app.services import access_sync
from app.services.audit import audit
from app.services.storage import download_object

router = APIRouter(prefix="/access", tags=["access-devices"])
member_router = APIRouter(tags=["access-devices"])

ENROLL_KINDS = {"face": "enroll_face", "fingerprint": "enroll_fingerprint", "face_photo": "face_photo"}


def _command_out(c: DeviceCommand) -> dict:
    return {
        "id": str(c.id), "kind": c.kind, "status": c.status, "error": c.error, "attempts": c.attempts,
        "member_id": str(c.member_id) if c.member_id else None,
        "pin": (c.payload or {}).get("pin"),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "completed_at": c.completed_at.isoformat() if c.completed_at else None,
    }


async def _hardware(db: AsyncSession, device_id: uuid.UUID) -> KioskDevice:
    device = await db.get(KioskDevice, device_id)
    if device is None or not device.is_active:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    if device.kind not in access_sync.HARDWARE_KINDS:
        raise HTTPException(status_code=400, detail="Ese dispositivo no es un torniquete ni un lector")
    return device


def _require_protocol(device: KioskDevice) -> None:
    if not access_sync.takes_commands(device):
        raise HTTPException(
            status_code=409,
            detail="Configura la marca y la forma de conexión del equipo antes (Ajustes › Dispositivos)",
        )


# ─── Personal ───────────────────────────────────────────────────────────────

@router.get("/devices/{device_id}/status", dependencies=[Depends(require_perm(perm.ACCESS_VALIDATE))])
async def device_status(device_id: uuid.UUID, db: AsyncSession = Depends(get_tenant_db_from_token)):
    device = await _hardware(db, device_id)
    recent = (await db.execute(
        select(DeviceCommand).where(DeviceCommand.device_id == device.id)
        .order_by(desc(DeviceCommand.created_at)).limit(15)
    )).scalars().all()
    return {
        "device_id": str(device.id),
        "protocol": access_sync.protocol_of(device),
        "last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None,
        **await access_sync.device_summary(db, device),
        "recent_commands": [_command_out(c) for c in recent],
    }


@router.get("/devices/{device_id}/roster", dependencies=[Depends(require_perm(perm.KIOSK_MANAGE))])
async def device_roster(
    device_id: uuid.UUID,
    filter: Literal["all", "linked", "unlinked"] = Query("all"),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Usuarios guardados en el equipo y con qué socio quedaron enlazados.
    Sirve para tomar el control de un torniquete que manejaba otro programa."""
    device = await _hardware(db, device_id)
    stmt = (
        select(DeviceUser, Member.full_name)
        .outerjoin(Member, Member.id == DeviceUser.member_id)
        .where(DeviceUser.device_id == device.id, DeviceUser.present.is_(True))
        .order_by(DeviceUser.member_id.is_(None).desc(), DeviceUser.pin)
    )
    if filter == "linked":
        stmt = stmt.where(DeviceUser.member_id.is_not(None))
    elif filter == "unlinked":
        stmt = stmt.where(DeviceUser.member_id.is_(None))
    rows = (await db.execute(stmt.limit(1000))).all()
    return [
        {"pin": du.pin, "device_name": du.name, "member_id": str(du.member_id) if du.member_id else None,
         "member_name": name, "has_face": du.has_face, "fingerprints": du.fingerprint_count, "has_card": du.has_card,
         "enabled": du.enabled, "synced_at": du.synced_at.isoformat() if du.synced_at else None}
        for du, name in rows
    ]


@router.post("/devices/{device_id}/sync")
async def sync_device(
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.KIOSK_MANAGE)),
):
    """Pide al equipo su lista de usuarios y reenvía el estado de quien cambió."""
    device = await _hardware(db, device_id)
    _require_protocol(device)
    await access_sync.enqueue(db, device, "query_users", {}, created_by=current_user.id)
    queued = await access_sync.reconcile_device(db, device)
    audit(db, current_user, "access_device.sync", "kiosk_device", device.id, {"queued": queued})
    await db.commit()
    return {"queued": queued}


class OpenDoorIn(BaseModel):
    reason: str = Field(default="Apertura manual desde recepción", max_length=200)


@router.post("/devices/{device_id}/open")
async def open_door(
    device_id: uuid.UUID,
    payload: OpenDoorIn | None = None,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.ACCESS_OVERRIDE)),
):
    """Plan B: recepción abre el torniquete. Queda en auditoría con quién y por qué."""
    device = await _hardware(db, device_id)
    _require_protocol(device)
    reason = (payload.reason if payload else None) or "Apertura manual desde recepción"
    cmd = await access_sync.enqueue(db, device, "open_door", {"door": (device.config or {}).get("door", 1)},
                                    created_by=current_user.id)
    audit(db, current_user, "access_device.open", "kiosk_device", device.id, {"reason": reason})
    await db.commit()
    return _command_out(cmd)


class LinkIn(BaseModel):
    pin: str = Field(min_length=1, max_length=64)
    member_id: Optional[uuid.UUID] = None


@router.post("/devices/{device_id}/link")
async def link_device_user(
    device_id: uuid.UUID,
    payload: LinkIn,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.CREDENTIALS_WRITE)),
):
    """Enlaza (o desenlaza con member_id=null) un usuario del equipo con su socio."""
    device = await _hardware(db, device_id)
    du = (await db.execute(select(DeviceUser).where(
        DeviceUser.device_id == device.id, DeviceUser.pin == payload.pin.strip()
    ))).scalar_one_or_none()
    if du is None:
        raise HTTPException(status_code=404, detail="Ese usuario no está en el equipo")
    if payload.member_id:
        member = await db.get(Member, payload.member_id)
        if member is None:
            raise HTTPException(status_code=404, detail="Miembro no encontrado")
        taken = (await db.execute(select(DeviceUser.pin).where(
            DeviceUser.device_id == device.id, DeviceUser.member_id == member.id,
            DeviceUser.present.is_(True), DeviceUser.pin != du.pin,
        ))).scalars().first()
        if taken:
            raise HTTPException(status_code=409, detail=f"{member.full_name} ya está enlazado al usuario {taken} del equipo")
        du.member_id = member.id
        du.synced_hash = None
        for kind, present in (("face", du.has_face), ("fingerprint", (du.fingerprint_count or 0) > 0)):
            if present:
                await access_sync.register_template(db, device, du.pin, kind, member_id=member.id,
                                                    enrolled_by=current_user.id)
        await access_sync.sync_member(db, member, devices=[device])
    else:
        du.member_id = None
    audit(db, current_user, "access_device.link", "kiosk_device", device.id,
          {"pin": du.pin, "member_id": str(payload.member_id) if payload.member_id else None})
    await db.commit()
    return {"pin": du.pin, "member_id": str(du.member_id) if du.member_id else None}


@router.get("/commands/{command_id}", dependencies=[Depends(require_perm(perm.ACCESS_VALIDATE))])
async def command_status(command_id: uuid.UUID, db: AsyncSession = Depends(get_tenant_db_from_token)):
    cmd = await db.get(DeviceCommand, command_id)
    if cmd is None:
        raise HTTPException(status_code=404, detail="Comando no encontrado")
    return _command_out(cmd)


class EnrollIn(BaseModel):
    device_id: uuid.UUID
    kind: Literal["face", "fingerprint", "face_photo"]
    finger: int = Field(default=0, ge=0, le=9)


@member_router.post("/members/{member_id}/enroll", status_code=201)
async def enroll_on_device(
    member_id: uuid.UUID,
    payload: EnrollIn,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.CREDENTIALS_WRITE)),
):
    """Pone al equipo a registrar el rostro o la huella del socio (o le envía
    su foto como rostro). Exige consentimiento biométrico vigente (Ley 1581)."""
    member = await db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    device = await _hardware(db, payload.device_id)
    _require_protocol(device)
    biometric = "face" if payload.kind in ("face", "face_photo") else "fingerprint"
    consent = (await db.execute(select(BiometricConsent).where(
        BiometricConsent.member_id == member_id, BiometricConsent.kind == biometric,
        BiometricConsent.revoked_at.is_(None),
    ))).scalar_one_or_none()
    if consent is None:
        raise HTTPException(status_code=409, detail="Primero el socio debe firmar el consentimiento biométrico")

    pin = await access_sync.pin_for_member(db, device, member)
    if not pin:
        raise HTTPException(status_code=409, detail="El socio no tiene cédula: regístrala para crearlo en el equipo")
    # Primero el usuario debe existir en el equipo (y con su estado al día).
    await access_sync.sync_member(db, member, devices=[device], force=True, create_on_device=True)
    du = await access_sync._device_user(db, device, pin, create=True)
    du.member_id = member.id

    extra: dict = {"pin": pin, "finger": payload.finger, "name": member.full_name}
    if payload.kind == "face_photo":
        if not member.photo_url or member.consent_image_at is None:
            raise HTTPException(status_code=409, detail="El socio no tiene foto autorizada para usar como rostro")
        photo = await download_object(member.photo_url, max_bytes=200 * 1024)
        if photo is None:
            raise HTTPException(
                status_code=409,
                detail="La foto debe ser JPG de máximo 200 KB para el equipo. Tómala de nuevo desde la ficha.",
            )
        extra["content_b64"] = base64.b64encode(photo).decode()
    cmd = await access_sync.enqueue(db, device, ENROLL_KINDS[payload.kind], extra, member_id=member.id,
                                    created_by=current_user.id)
    audit(db, current_user, "credential.enroll_request", "member", member.id,
          {"device": device.name, "kind": payload.kind, "pin": pin})
    await db.commit()
    return _command_out(cmd)


# ─── Agente local ───────────────────────────────────────────────────────────

async def _agent_device(db: AsyncSession, token: dict) -> KioskDevice:
    device = await db.get(KioskDevice, uuid.UUID(token["device_id"]))
    if device is None or not device.is_active:
        raise HTTPException(status_code=401, detail="Dispositivo desactivado")
    device.last_seen_at = utcnow_naive()
    return device


@router.get("/agent/commands")
@limiter.limit("240/minute")
async def agent_commands(
    request: Request,
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    device = await _agent_device(db, token)
    cmds = await access_sync.pending_commands(db, device, limit=20)
    out = [{"id": str(c.id), "kind": c.kind, "payload": c.payload or {}, "config": {
        k: v for k, v in (device.config or {}).items() if k in ("block_strategy", "door", "pin_mode")
    }} for c in cmds]
    await db.commit()
    return out


class CommandResult(BaseModel):
    ok: bool
    error: Optional[str] = Field(default=None, max_length=500)
    result: Optional[dict] = None


@router.post("/agent/commands/{command_id}/result")
@limiter.limit("600/minute")
async def agent_command_result(
    request: Request,
    command_id: uuid.UUID,
    payload: CommandResult,
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    device = await _agent_device(db, token)
    cmd = await access_sync.complete_command(
        db, device, command_id=command_id, error=None if payload.ok else (payload.error or "Falló en el equipo"),
        result=payload.result,
    )
    if cmd is None:
        raise HTTPException(status_code=404, detail="Comando no encontrado")
    if cmd.kind == "query_users" and payload.ok and payload.result and isinstance(payload.result.get("users"), list):
        await access_sync.apply_roster(db, device, payload.result["users"][:20000], full=True)
        cmd.payload = {k: v for k, v in (cmd.payload or {}).items() if k != "result"}
    await db.commit()
    return {"status": cmd.status}


class AgentPunch(BaseModel):
    client_event_id: str = Field(min_length=1, max_length=64)
    device_user_id: str = Field(min_length=1, max_length=64)
    occurred_at: datetime
    credential_kind: Literal["face", "fingerprint", "card", "pin", "qr", "device"] = "device"
    allowed: bool = True


class AgentPunches(BaseModel):
    events: list[AgentPunch] = Field(max_length=500)


@router.post("/agent/punches")
@limiter.limit("240/minute")
async def agent_punches(
    request: Request,
    payload: AgentPunches,
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    """Marcaciones que el equipo ya resolvió (con o sin internet en el momento)."""
    device = await _agent_device(db, token)
    results: dict[str, int] = {}
    for ev in payload.events:
        occurred = ev.occurred_at
        if occurred.tzinfo is not None:
            occurred = occurred.astimezone(timezone.utc).replace(tzinfo=None)
        outcome = await access_sync.record_punch(
            db, device, pin=ev.device_user_id.strip(), occurred_at=occurred, credential_kind=ev.credential_kind,
            client_event_id=ev.client_event_id, allowed_by_device=ev.allowed, db_name=token["db_name"],
        )
        results[outcome] = results.get(outcome, 0) + 1
    await db.commit()
    return results


class RosterUser(BaseModel):
    pin: str = Field(min_length=1, max_length=64)
    name: Optional[str] = Field(default=None, max_length=255)
    card: Optional[str] = Field(default=None, max_length=40)
    has_face: Optional[bool] = None
    fingerprints: Optional[int] = Field(default=None, ge=0, le=10)


class RosterIn(BaseModel):
    users: list[RosterUser] = Field(max_length=20000)
    full: bool = False


@router.post("/agent/roster")
@limiter.limit("30/minute")
async def agent_roster(
    request: Request,
    payload: RosterIn,
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    device = await _agent_device(db, token)
    out = await access_sync.apply_roster(db, device, [u.model_dump() for u in payload.users], full=payload.full)
    await db.commit()
    return out


@router.post("/agent/templates")
@limiter.limit("240/minute")
async def agent_template(
    request: Request,
    payload: RosterUser,
    db: AsyncSession = Depends(get_kiosk_db),
    token: dict = Depends(get_kiosk_payload),
):
    """El agente avisa que el equipo registró un rostro o una huella (sin enviarla)."""
    device = await _agent_device(db, token)
    if payload.has_face:
        await access_sync.register_template(db, device, payload.pin.strip(), "face")
    if payload.fingerprints:
        await access_sync.register_template(db, device, payload.pin.strip(), "fingerprint")
    await db.commit()
    return {"ok": True}

