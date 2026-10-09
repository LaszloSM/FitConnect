"""Sincronización FitConnect ↔ equipos de acceso (torniquetes, lectores).

Principio: el equipo reconoce rostro/huella por sí mismo (las plantillas
viven en él) y decide en el momento, aunque no haya internet. FitConnect le
dice QUIÉN está habilitado y HASTA CUÁNDO, y recibe cada marcación como
asistencia.

- ``desired_state``: lo que el equipo debería saber de un socio hoy.
- ``sync_member``: encola un ``user_sync`` en cada equipo que tiene al socio,
  solo si cambió algo (``DeviceUser.synced_hash``).
- ``reconcile_device``: red de seguridad periódica (vencimientos a medianoche,
  cambios que no pasaron por un hook, comandos que quedaron sin respuesta).
- ``record_punch``: una marcación que el equipo YA dejó pasar → check-in.
- ``apply_roster`` / ``register_template``: lo que el equipo reporta de sus
  usuarios y plantillas (sin guardar la plantilla).

Los comandos se guardan en términos de FitConnect (``DeviceCommand``) y cada
protocolo los traduce: ``zk_adms`` en ``/iclock/getrequest``; ``hik_isapi`` y
``zk_tcp`` en el agente local.
"""
from __future__ import annotations

import hashlib
import logging
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota, utcnow_naive
from app.models.tenant.access import AccessEvent, BiometricConsent, MemberCredential
from app.models.tenant.checkin import CheckIn, CheckInType
from app.models.tenant.device_command import DeviceCommand
from app.models.tenant.device_user import DeviceUser
from app.models.tenant.kiosk_device import KioskDevice
from app.models.tenant.member import Member, MemberStatus
from app.services import realtime
from app.services.checkin import DEDUP_WINDOW, checkin_status, consume_entry, decision_for
from app.services.gym_settings import get_gym_settings

logger = logging.getLogger(__name__)

HARDWARE_KINDS = {"turnstile", "reader"}
#: Protocolos que reciben comandos. `generic` = un agente que solo pregunta
#: /access/verify (no guarda usuarios en el equipo).
COMMAND_PROTOCOLS = {"zk_adms", "hik_isapi", "zk_tcp"}
CLOUD_PROTOCOLS = {"zk_adms"}

#: Un comando enviado que no recibe respuesta en este tiempo se reintenta.
SENT_TIMEOUT = timedelta(minutes=10)
MAX_ATTEMPTS = 5
#: La vigencia que se graba en el equipo lleva un día de margen: un corte de
#: internet no debe bloquear a quien renovó ayer y aún no se sincronizó.
VALIDITY_MARGIN = timedelta(days=1)


def protocol_of(device: KioskDevice) -> Optional[str]:
    return (device.config or {}).get("protocol")


def takes_commands(device: KioskDevice) -> bool:
    return device.is_active and device.kind in HARDWARE_KINDS and protocol_of(device) in COMMAND_PROTOCOLS


def normalize_pin(value: str | None) -> Optional[str]:
    if not value:
        return None
    pin = re.sub(r"[^0-9A-Za-z]", "", value)
    return pin or None


# ─── Estado deseado ──────────────────────────────────────────────────────────

async def desired_state(db: AsyncSession, member: Member, grace_days: int) -> dict:
    """Habilitado hoy y hasta cuándo, con la misma regla del check-in."""
    status, membership = await checkin_status(member.id, db, grace_days)
    decision, _ = decision_for(status)
    enabled = decision == "allowed" and member.status == MemberStatus.active
    valid_until: Optional[date] = None
    if enabled and membership is not None:
        valid_until = membership.end_date + timedelta(days=grace_days) + VALIDITY_MARGIN
    elif enabled:
        # Pase del día: solo hoy (más el margen)
        valid_until = today_bogota() + VALIDITY_MARGIN
    return {
        "enabled": enabled,
        "valid_until": valid_until.isoformat() if valid_until else None,
        "status": status,
    }


def _state_hash(name: str, state: dict) -> str:
    raw = f"{name}|{state['enabled']}|{state.get('valid_until')}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ─── Cola de comandos ───────────────────────────────────────────────────────

async def enqueue(
    db: AsyncSession, device: KioskDevice, kind: str, payload: dict, *,
    member_id: Optional[uuid.UUID] = None, created_by: Optional[uuid.UUID] = None,
) -> DeviceCommand:
    if kind == "user_sync" and payload.get("pin"):
        # Solo importa el último estado de un usuario: los pendientes viejos sobran.
        await db.execute(
            update(DeviceCommand)
            .where(
                DeviceCommand.device_id == device.id, DeviceCommand.kind == "user_sync",
                DeviceCommand.status == "pending", DeviceCommand.payload["pin"].astext == str(payload["pin"]),
            )
            .values(status="cancelled", completed_at=utcnow_naive(), error="Reemplazado por un estado más nuevo")
            .execution_options(synchronize_session=False)
        )
    cmd = DeviceCommand(
        device_id=device.id, kind=kind, payload=payload, status="pending", attempts=0,
        member_id=member_id, created_by=created_by,
    )
    db.add(cmd)
    await db.flush()
    await db.refresh(cmd, ["wire_id"])
    return cmd


async def pending_commands(db: AsyncSession, device: KioskDevice, limit: int = 10) -> list[DeviceCommand]:
    """Entrega los pendientes (y reintenta los enviados sin respuesta) y los marca enviados."""
    now = utcnow_naive()
    stale = now - SENT_TIMEOUT
    rows = (await db.execute(
        select(DeviceCommand)
        .where(
            DeviceCommand.device_id == device.id,
            (DeviceCommand.status == "pending")
            | ((DeviceCommand.status == "sent") & (DeviceCommand.sent_at < stale)),
        )
        .order_by(DeviceCommand.wire_id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )).scalars().all()
    out = []
    for cmd in rows:
        if cmd.attempts >= MAX_ATTEMPTS:
            cmd.status = "failed"
            cmd.error = "El equipo no respondió tras varios intentos"
            cmd.completed_at = now
            continue
        cmd.status = "sent"
        cmd.sent_at = now
        cmd.attempts += 1
        out.append(cmd)
    return out


async def complete_command(
    db: AsyncSession, device: KioskDevice, *, wire_id: Optional[int] = None, command_id: Optional[uuid.UUID] = None,
    return_code: Optional[int] = None, error: Optional[str] = None, result: Optional[dict] = None,
) -> Optional[DeviceCommand]:
    stmt = select(DeviceCommand).where(DeviceCommand.device_id == device.id)
    stmt = stmt.where(DeviceCommand.wire_id == wire_id) if wire_id is not None else stmt.where(DeviceCommand.id == command_id)
    cmd = (await db.execute(stmt)).scalar_one_or_none()
    if cmd is None or cmd.status in ("done", "cancelled"):
        return cmd
    ok = error is None and (return_code is None or return_code >= 0)
    cmd.status = "done" if ok else "failed"
    cmd.return_code = return_code
    cmd.error = (error or (None if ok else f"El equipo respondió con el código {return_code}"))
    cmd.completed_at = utcnow_naive()
    payload = {k: v for k, v in (cmd.payload or {}).items() if k != "content_b64"}
    # La foto del rostro solo viaja hasta que el equipo la recibe: no se queda en la cola.
    cmd.payload = {**payload, "result": result} if result else payload
    if ok:
        await _apply_success(db, device, cmd)
    return cmd


async def _apply_success(db: AsyncSession, device: KioskDevice, cmd: DeviceCommand) -> None:
    pin = str((cmd.payload or {}).get("pin") or "")
    if cmd.kind == "user_sync" and pin:
        du = await _device_user(db, device, pin, create=True)
        du.name = (cmd.payload or {}).get("name") or du.name
        du.member_id = du.member_id or cmd.member_id
        du.present = not ((cmd.payload or {}).get("enabled") is False and (device.config or {}).get("block_strategy") == "delete")
        du.enabled = bool((cmd.payload or {}).get("enabled"))
        du.synced_hash = (cmd.payload or {}).get("hash")
        du.synced_at = utcnow_naive()
    elif cmd.kind == "user_remove" and pin:
        du = await _device_user(db, device, pin)
        if du:
            du.present = False
            du.has_face = False
            du.fingerprint_count = 0
            du.synced_hash = None
    elif cmd.kind == "biometric_delete" and pin:
        du = await _device_user(db, device, pin)
        if du:
            if (cmd.payload or {}).get("biometric") == "face":
                du.has_face = False
            else:
                du.fingerprint_count = 0
    elif cmd.kind in ("enroll_fingerprint", "enroll_face", "face_photo") and pin:
        kind = "fingerprint" if cmd.kind == "enroll_fingerprint" else "face"
        await register_template(db, device, pin, kind, member_id=cmd.member_id, enrolled_by=cmd.created_by)


# ─── Usuarios del equipo ────────────────────────────────────────────────────

async def _device_user(db: AsyncSession, device: KioskDevice, pin: str, create: bool = False) -> Optional[DeviceUser]:
    du = (await db.execute(
        select(DeviceUser).where(DeviceUser.device_id == device.id, DeviceUser.pin == pin)
    )).scalar_one_or_none()
    if du is None and create:
        du = DeviceUser(device_id=device.id, pin=pin, has_face=False, fingerprint_count=0, has_card=False, present=True)
        db.add(du)
        await db.flush()
    return du


async def member_for_pin(db: AsyncSession, device: KioskDevice, pin: str) -> Optional[Member]:
    """Mismo criterio que el check-in: mapeo explícito o, por convención, la cédula."""
    from app.services.access import resolve_member
    member, _, _ = await resolve_member(db, device_user_id=pin, device_id=device.id)
    return member


async def pin_for_member(db: AsyncSession, device: KioskDevice, member: Member) -> Optional[str]:
    du = (await db.execute(
        select(DeviceUser.pin).where(DeviceUser.device_id == device.id, DeviceUser.member_id == member.id)
        .order_by(DeviceUser.present.desc())
    )).scalars().first()
    if du:
        return du
    cred = (await db.execute(
        select(MemberCredential.device_user_id).where(
            MemberCredential.member_id == member.id, MemberCredential.revoked_at.is_(None),
            (MemberCredential.device_id.is_(None)) | (MemberCredential.device_id == device.id),
        ).order_by(MemberCredential.device_id.desc())
    )).scalars().first()
    if cred:
        return cred
    if (device.config or {}).get("pin_mode") == "sequential":
        return await _next_sequential_pin(db, device)
    return normalize_pin(member.id_number)


async def _next_sequential_pin(db: AsyncSession, device: KioskDevice) -> str:
    """Para equipos que solo aceptan PIN cortos: 1, 2, 3... por equipo."""
    pins = (await db.execute(select(DeviceUser.pin).where(DeviceUser.device_id == device.id))).scalars().all()
    numeric = [int(p) for p in pins if p.isdigit()]
    return str(max(numeric, default=0) + 1)


async def apply_roster(
    db: AsyncSession, device: KioskDevice, users: Iterable[dict], *, full: bool = False,
) -> dict:
    """Usuarios que el equipo reporta tener: {pin, name, card?, has_face?, fingerprints?}.
    Con ``full=True`` (lista completa del equipo) los que no vinieron quedan como ausentes."""
    seen: set[str] = set()
    linked = 0
    newly_linked: list[Member] = []
    now = utcnow_naive()
    for u in users:
        pin = normalize_pin(str(u.get("pin") or ""))
        if not pin:
            continue
        seen.add(pin)
        du = await _device_user(db, device, pin, create=True)
        du.name = (u.get("name") or du.name or "")[:255] or None
        du.present = True
        du.last_seen_at = now
        if u.get("card") is not None:
            du.has_card = bool(u.get("card"))
        if u.get("has_face") is not None:
            du.has_face = bool(u.get("has_face"))
        if u.get("fingerprints") is not None:
            du.fingerprint_count = int(u.get("fingerprints") or 0)
        if du.member_id is None:
            member = await member_for_pin(db, device, pin)
            if member:
                du.member_id = member.id
                linked += 1
                newly_linked.append(member)
    if full:
        await db.execute(
            update(DeviceUser)
            .where(DeviceUser.device_id == device.id, DeviceUser.pin.not_in(seen or {""}))
            .values(present=False)
            .execution_options(synchronize_session=False)
        )
    # Toma de control: quien quedó enlazado recibe ya su estado (el vencido se
    # bloquea sin borrarle la biometría).
    if newly_linked and takes_commands(device):
        await db.flush()
        grace = (await get_gym_settings(db)).grace_days
        for member in newly_linked:
            await sync_member(db, member, devices=[device], grace_days=grace)
    return {"users": len(seen), "linked": linked}


async def register_template(
    db: AsyncSession, device: KioskDevice, pin: str, kind: str, *,
    member_id: Optional[uuid.UUID] = None, enrolled_by: Optional[uuid.UUID] = None,
) -> Optional[MemberCredential]:
    """El equipo reporta que el PIN tiene rostro/huella. Se registra el hecho
    (nunca la plantilla) y, si hay socio con consentimiento vigente, la credencial."""
    if kind not in ("face", "fingerprint"):
        return None
    du = await _device_user(db, device, pin, create=True)
    du.present = True
    du.last_seen_at = utcnow_naive()
    if kind == "face":
        du.has_face = True
    else:
        # El equipo reenvía sus plantillas en cada sincronización: contar subidas
        # inflaría el número. Basta saber que hay al menos una.
        du.fingerprint_count = max(du.fingerprint_count or 0, 1)
    if member_id is None:
        member_id = du.member_id
        if member_id is None:
            member = await member_for_pin(db, device, pin)
            member_id = member.id if member else None
    if member_id is None:
        return None
    du.member_id = member_id

    # Cierra el enrolamiento que estaba esperando esta plantilla.
    wanted = "enroll_face" if kind == "face" else "enroll_fingerprint"
    await db.execute(
        update(DeviceCommand)
        .where(
            DeviceCommand.device_id == device.id, DeviceCommand.member_id == member_id,
            DeviceCommand.kind.in_([wanted, "face_photo"] if kind == "face" else [wanted]),
            DeviceCommand.status.in_(["pending", "sent"]),
        )
        .values(status="done", completed_at=utcnow_naive())
        .execution_options(synchronize_session=False)
    )

    existing = (await db.execute(
        select(MemberCredential).where(
            MemberCredential.member_id == member_id, MemberCredential.kind == kind,
            MemberCredential.device_user_id == pin, MemberCredential.revoked_at.is_(None),
            (MemberCredential.device_id.is_(None)) | (MemberCredential.device_id == device.id),
        )
    )).scalars().first()
    if existing:
        return existing
    consent = (await db.execute(
        select(BiometricConsent).where(
            BiometricConsent.member_id == member_id, BiometricConsent.revoked_at.is_(None),
            BiometricConsent.kind.in_([kind, "all"]),
        ).order_by(BiometricConsent.signed_at.desc())
    )).scalars().first()
    cred = MemberCredential(
        member_id=member_id, device_id=device.id, kind=kind, device_user_id=pin,
        label=device.name[:80] if device.name else None, consent_id=consent.id if consent else None,
        enrolled_by=enrolled_by,
    )
    db.add(cred)
    await db.flush()
    return cred


# ─── Sincronizar socios ─────────────────────────────────────────────────────

async def command_devices(db: AsyncSession) -> list[KioskDevice]:
    devices = (await db.execute(
        select(KioskDevice).where(KioskDevice.is_active.is_(True), KioskDevice.kind.in_(HARDWARE_KINDS))
    )).scalars().all()
    return [d for d in devices if takes_commands(d)]


async def sync_member(
    db: AsyncSession, member: Member, *, devices: Optional[list[KioskDevice]] = None,
    grace_days: Optional[int] = None, force: bool = False, create_on_device: bool = False,
) -> int:
    """Encola el estado del socio en cada equipo que lo tiene. Devuelve cuántos
    comandos se encolaron. ``create_on_device`` lo crea aunque el equipo aún no
    lo tenga (antes de enrolar)."""
    if devices is None:
        devices = await command_devices(db)
    if not devices:
        return 0
    if grace_days is None:
        grace_days = (await get_gym_settings(db)).grace_days
    state = await desired_state(db, member, grace_days)
    queued = 0
    for device in devices:
        du = (await db.execute(
            select(DeviceUser).where(DeviceUser.device_id == device.id, DeviceUser.member_id == member.id)
            .order_by(DeviceUser.present.desc())
        )).scalars().first()
        if du is None and not create_on_device:
            pin = normalize_pin(member.id_number)
            du = await _device_user(db, device, pin) if pin else None
            if du is None:
                continue
            du.member_id = member.id
        pin = du.pin if du else await pin_for_member(db, device, member)
        if not pin:
            continue
        h = _state_hash(member.full_name, state)
        if not force and du is not None and du.synced_hash == h and du.present:
            continue
        await enqueue(db, device, "user_sync", {
            "pin": pin, "name": member.full_name, "enabled": state["enabled"],
            "valid_from": (today_bogota() - timedelta(days=1)).isoformat(),
            "valid_until": state["valid_until"], "hash": h,
        }, member_id=member.id)
        queued += 1
    return queued


async def sync_member_id(db: AsyncSession, member_id: uuid.UUID) -> int:
    """Gancho barato para llamar tras cambiar una membresía, un pago o la ficha.
    Nunca rompe la operación que lo llama: el reconciliador lo reintenta."""
    try:
        member = await db.get(Member, member_id)
        if member is None:
            return 0
        devices = await command_devices(db)
        if not devices:
            return 0
        grace = (await get_gym_settings(db)).grace_days
        # Savepoint: un error de base aquí no puede abortar la transacción del cobro.
        async with db.begin_nested():
            queued = await sync_member(db, member, devices=devices, grace_days=grace)
        return queued
    except Exception:
        logger.exception("No se pudo encolar la sincronización del socio %s", member_id)
        return 0


async def reconcile_device(db: AsyncSession, device: KioskDevice) -> int:
    """Revisa a todos los socios que el equipo tiene y encola los que cambiaron
    (por ejemplo, los que vencieron hoy)."""
    if not takes_commands(device):
        return 0
    grace = (await get_gym_settings(db)).grace_days
    members = (await db.execute(
        select(Member).join(DeviceUser, DeviceUser.member_id == Member.id)
        .where(DeviceUser.device_id == device.id, DeviceUser.present.is_(True))
    )).scalars().unique().all()
    queued = 0
    for member in members:
        queued += await sync_member(db, member, devices=[device], grace_days=grace)
    return queued


async def reconcile_all(db: AsyncSession) -> dict:
    out = {}
    for device in await command_devices(db):
        out[str(device.id)] = await reconcile_device(db, device)
    await db.commit()
    return out


# ─── Marcaciones ────────────────────────────────────────────────────────────

async def record_punch(
    db: AsyncSession, device: KioskDevice, *, pin: str, occurred_at: datetime, credential_kind: str,
    client_event_id: str, allowed_by_device: bool = True, db_name: Optional[str] = None,
) -> str:
    """Una marcación que el equipo ya resolvió. Devuelve qué se hizo:
    duplicate | not_found | denied | checkin | repeat | mismatch."""
    from app.services.access import _log

    if (await db.execute(
        select(AccessEvent.id).where(AccessEvent.device_id == device.id, AccessEvent.client_event_id == client_event_id)
    )).scalar_one_or_none():
        return "duplicate"

    member = await member_for_pin(db, device, pin)
    if member is None:
        _log(db, device, None, credential_kind, pin, "entry", "not_found", "not_found",
             client_event_id=client_event_id, occurred_at=occurred_at)
        return "not_found"
    if not allowed_by_device:
        _log(db, device, member, credential_kind, pin, "entry", "denied", "device",
             client_event_id=client_event_id, occurred_at=occurred_at)
        return "denied"

    # Si marcó en el equipo, el equipo lo tiene: así sabemos a quién sincronizar.
    du = await _device_user(db, device, pin, create=True)
    du.member_id = du.member_id or member.id
    du.present = True
    du.last_seen_at = utcnow_naive()

    grace = (await get_gym_settings(db)).grace_days
    status, membership = await checkin_status(member.id, db, grace)
    decision, reason = decision_for(status)

    # Dos marcaciones en pocos minutos (sale a la calle y vuelve) son un solo ingreso.
    recent = (await db.execute(
        select(CheckIn.id).where(
            CheckIn.member_id == member.id, CheckIn.decision != "denied",
            CheckIn.created_at >= occurred_at - DEDUP_WINDOW, CheckIn.created_at <= occurred_at + DEDUP_WINDOW,
        ).limit(1)
    )).scalar_one_or_none()
    if recent:
        _log(db, device, member, credential_kind, pin, "entry", "duplicate", None,
             client_event_id=client_event_id, occurred_at=occurred_at, checkin_id=recent)
        return "repeat"

    if membership is not None and decision == "allowed":
        await consume_entry(db, membership, enforce=False)
    checkin = CheckIn(member_id=member.id, type=CheckInType.entry, decision="allowed", denial_reason=None,
                      source=device.kind, created_at=occurred_at)
    db.add(checkin)
    await db.flush()
    mismatch = decision != "allowed"
    _log(db, device, member, credential_kind, pin, "entry", "allowed",
         f"device_allowed_{reason}" if mismatch else None,
         client_event_id=client_event_id, occurred_at=occurred_at, checkin_id=checkin.id)

    if db_name:
        realtime.publish(db_name, {
            "type": "checkin", "decision": "allowed", "member_id": str(member.id),
            "member_name": member.full_name, "membership_status": status, "source": device.kind,
            "at": occurred_at.isoformat(), "alert": (
                f"{member.full_name} entró por el torniquete con el plan {reason}" if mismatch else None
            ),
        })
    if mismatch:
        # El equipo tenía un estado viejo: se corrige para la próxima.
        await sync_member(db, member, devices=[device], grace_days=grace, force=True)
        return "mismatch"
    return "checkin"


async def device_summary(db: AsyncSession, device: KioskDevice) -> dict:
    """Para la pantalla de Dispositivos: qué tiene el equipo y qué falta."""
    users = (await db.execute(select(DeviceUser).where(DeviceUser.device_id == device.id, DeviceUser.present.is_(True)))).scalars().all()
    pending = await db.scalar(
        select(func.count()).select_from(DeviceCommand)
        .where(DeviceCommand.device_id == device.id, DeviceCommand.status.in_(["pending", "sent"]))
    )
    failed = await db.scalar(
        select(func.count()).select_from(DeviceCommand)
        .where(DeviceCommand.device_id == device.id, DeviceCommand.status == "failed",
               DeviceCommand.completed_at >= utcnow_naive() - timedelta(days=1))
    )
    linked = [u for u in users if u.member_id]
    return {
        "users_on_device": len(users),
        "linked": len(linked),
        "unlinked": len(users) - len(linked),
        "with_face": sum(1 for u in users if u.has_face),
        "with_fingerprint": sum(1 for u in users if (u.fingerprint_count or 0) > 0),
        "pending_commands": pending or 0,
        "failed_commands_24h": failed or 0,
        # Otro aparato usó el serial de este equipo desde otra IP (ver iclock.py).
        "ip_conflict": (device.config or {}).get("ip_conflict"),
        "has_allowed_ips": bool((device.config or {}).get("allowed_ips")),
    }
