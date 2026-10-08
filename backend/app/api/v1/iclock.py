"""Endpoints que llama un equipo ZKTeco por ADMS/PUSH ("iclock").

No llevan JWT: el equipo solo sabe su número de serie. Defensa:
- el serial debe estar registrado en un dispositivo ACTIVO de algún gimnasio
  (``device_directory``); uno desconocido recibe 404 y no toca ninguna base;
- lista opcional de IPs permitidas por dispositivo (``config.allowed_ips``);
- límite de peticiones;
- lo peor que puede hacer un serial suplantado es registrar marcaciones falsas
  de ESE gimnasio (quedan en la bitácora con su origen): no puede abrir puertas
  ni leer datos, porque la nube nunca le devuelve información de socios.

Responden texto plano, como exige el protocolo.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse

from app.core.rate_limit import client_ip, limiter
from app.core.timeutil import now_bogota, utcnow_naive
from app.models.tenant.kiosk_device import KioskDevice
from app.services import access_sync, device_directory
from app.services.access_drivers import zk_adms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/iclock", tags=["iclock"], include_in_schema=False)

MAX_BODY = 2 * 1024 * 1024


def _text(body: str, status: int = 200) -> PlainTextResponse:
    return PlainTextResponse(body, status_code=status)


async def _body(request: Request) -> str:
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raw = raw[:MAX_BODY]
    for enc in ("utf-8", "gb18030", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


async def _resolve(request: Request, serial: Optional[str]):
    """→ (entry, None) si el equipo es válido, o (None, respuesta de rechazo)."""
    if not serial:
        return None, _text("ERROR: missing SN", 400)
    entry = await device_directory.lookup(serial)
    if entry is None:
        logger.info("iclock: serial no registrado %s desde %s", serial, client_ip(request))
        return None, _text("UNKNOWN DEVICE", 404)
    return entry, None


async def _device(session, entry, request: Request) -> Optional[KioskDevice]:
    device = await session.get(KioskDevice, entry.device_id)
    if device is None or not device.is_active:
        return None
    allowed = (device.config or {}).get("allowed_ips") or []
    if allowed and client_ip(request) not in allowed:
        logger.warning("iclock: %s llamó desde una IP no permitida %s", entry.serial, client_ip(request))
        return None
    device.last_seen_at = utcnow_naive()
    return device


@router.get("/ping")
@limiter.limit("600/minute")
async def ping(request: Request):
    return _text("OK")


@router.get("/cdata")
@limiter.limit("600/minute")
async def handshake(request: Request, SN: Optional[str] = None):
    entry, rejected = await _resolve(request, SN)
    if rejected:
        return rejected
    async with device_directory.tenant_session(entry.db_name) as db:
        device = await _device(db, entry, request)
        if device is None:
            return _text("DEVICE DISABLED", 403)
        cfg = dict(device.config or {})
        info = {k: v for k, v in request.query_params.items() if k in ("pushver", "language", "DeviceType")}
        if info:
            cfg["firmware"] = info
            device.config = cfg
        stamps = cfg.get("stamps") or {}
        await db.commit()
        return _text(zk_adms.handshake(entry.serial, now_local=now_bogota(), stamps=stamps))


@router.post("/cdata")
@limiter.limit("600/minute")
async def upload(request: Request, SN: Optional[str] = None, table: Optional[str] = None, Stamp: Optional[str] = None):
    entry, rejected = await _resolve(request, SN)
    if rejected:
        return rejected
    body = await _body(request)
    table_name = (table or "").upper()
    async with device_directory.tenant_session(entry.db_name) as db:
        device = await _device(db, entry, request)
        if device is None:
            return _text("DEVICE DISABLED", 403)
        count = 0
        if table_name == "ATTLOG":
            for punch in zk_adms.parse_attlog(body):
                await access_sync.record_punch(
                    db, device, pin=punch.pin, occurred_at=punch.occurred_at,
                    credential_kind=punch.credential_kind,
                    client_event_id=f"zk:{punch.pin}:{punch.local_time}", db_name=entry.db_name,
                )
                count += 1
        elif table_name in ("OPERLOG", "USERINFO", "BIODATA", "FINGERTMP", "FACE", "USER"):
            records = zk_adms.parse_operlog(body)
            users = []
            for rec in records:
                pin = rec.pin
                if not pin:
                    continue
                if rec.tag == "USER":
                    users.append({"pin": pin, "name": rec.fields.get("Name"), "card": rec.fields.get("Card") or ""})
                elif rec.template_kind in ("face", "fingerprint"):
                    await access_sync.register_template(db, device, pin, rec.template_kind)
                count += 1
            if users:
                await access_sync.apply_roster(db, device, users)
        else:
            # ATTPHOTO, OPLOG sueltos, tablas nuevas: se acusan para que el equipo no reintente.
            count = len([ln for ln in body.splitlines() if ln.strip()])
        if Stamp and table_name in ("ATTLOG", "OPERLOG"):
            cfg = dict(device.config or {})
            cfg["stamps"] = {**(cfg.get("stamps") or {}), table_name: Stamp}
            device.config = cfg
        await db.commit()
    return _text(f"OK: {count}")


@router.get("/getrequest")
@limiter.limit("600/minute")
async def get_request(request: Request, SN: Optional[str] = None):
    entry, rejected = await _resolve(request, SN)
    if rejected:
        return rejected
    async with device_directory.tenant_session(entry.db_name) as db:
        device = await _device(db, entry, request)
        if device is None:
            return _text("OK")
        commands = await access_sync.pending_commands(db, device)
        lines = []
        for cmd in commands:
            wire = zk_adms.wire_command(cmd.wire_id, cmd.kind, cmd.payload or {}, device.config)
            if wire is None:
                cmd.status = "failed"
                cmd.error = "Este equipo no soporta ese comando"
                continue
            lines.append(wire)
        await db.commit()
    return _text("\n".join(lines) + "\n" if lines else "OK")


@router.post("/devicecmd")
@limiter.limit("600/minute")
async def device_cmd(request: Request, SN: Optional[str] = None):
    entry, rejected = await _resolve(request, SN)
    if rejected:
        return rejected
    body = await _body(request)
    async with device_directory.tenant_session(entry.db_name) as db:
        device = await _device(db, entry, request)
        if device is None:
            return _text("OK")
        for reply in zk_adms.parse_devicecmd(body):
            await access_sync.complete_command(db, device, wire_id=reply["id"], return_code=reply["return"])
        await db.commit()
    return _text("OK")


# Algunos firmwares usan la extensión .aspx heredada del servidor de ZKTeco.
router.add_api_route("/cdata.aspx", handshake, methods=["GET"], include_in_schema=False)
router.add_api_route("/cdata.aspx", upload, methods=["POST"], include_in_schema=False)
router.add_api_route("/getrequest.aspx", get_request, methods=["GET"], include_in_schema=False)
router.add_api_route("/devicecmd.aspx", device_cmd, methods=["POST"], include_in_schema=False)
