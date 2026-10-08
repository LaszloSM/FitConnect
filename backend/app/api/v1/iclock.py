"""Endpoints que llama un equipo ZKTeco por ADMS/PUSH ("iclock").

No llevan JWT: el protocolo ADMS solo manda el número de serie, que está impreso
en el equipo. Quien lo conozca puede hacerse pasar por él, así que:
- el serial debe estar registrado en un dispositivo ACTIVO; uno desconocido o
  desactivado recibe la misma respuesta (no se puede averiguar cuáles existen);
- IPs permitidas por dispositivo (``config.allowed_ips``): lo recomendado. Sin
  ellas, si el mismo serial llama desde otra IP mientras el equipo real está
  conectado, se rechaza y queda marcado (``config.ip_conflict``);
- en producción las fotos de rostro solo se entregan por HTTPS o a un equipo
  con IP permitida: por HTTP plano viajarían a la vista de cualquiera;
- las marcaciones con fecha imposible (futuro o más de 30 días atrás) se ignoran;
- límite de peticiones.
Lo que un impostor sí podría ver son los comandos pendientes de ese gimnasio
(nombre y PIN de los socios que se sincronizan): por eso las IPs permitidas.

Responden texto plano, como exige el protocolo.
"""
import logging
from datetime import timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse

from app.core.config import settings
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


#: Un equipo real llama cada pocos segundos: otra IP con el mismo serial dentro
#: de esta ventana es un segundo aparato diciendo ser él.
IP_PIN_WINDOW = timedelta(minutes=10)
MAX_PUNCH_AGE = timedelta(days=30)


def _secure(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


async def _device(session, entry, request: Request) -> Optional[KioskDevice]:
    device = await session.get(KioskDevice, entry.device_id)
    if device is None or not device.is_active:
        return None
    ip = client_ip(request)
    cfg = dict(device.config or {})
    allowed = cfg.get("allowed_ips") or []
    now = utcnow_naive()
    if allowed and ip not in allowed:
        logger.warning("iclock: %s llamó desde una IP no permitida %s", entry.serial, ip)
        return None
    if not allowed and cfg.get("last_ip") and cfg["last_ip"] != ip and device.last_seen_at \
            and now - device.last_seen_at < IP_PIN_WINDOW:
        logger.warning("iclock: %s llamó desde %s mientras sigue activo en %s", entry.serial, ip, cfg["last_ip"])
        cfg["ip_conflict"] = {"ip": ip, "at": now.isoformat(timespec="seconds")}
        device.config = cfg
        await session.commit()
        return None
    if cfg.get("last_ip") != ip:
        cfg["last_ip"] = ip
        device.config = cfg
    device.last_seen_at = now
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
            return _text("UNKNOWN DEVICE", 404)
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
            return _text("UNKNOWN DEVICE", 404)
        count = 0
        if table_name == "ATTLOG":
            now = utcnow_naive()
            for punch in zk_adms.parse_attlog(body):
                count += 1
                at = punch.occurred_at.replace(tzinfo=None) if punch.occurred_at.tzinfo is None else \
                    punch.occurred_at.astimezone(timezone.utc).replace(tzinfo=None)
                if at > now + timedelta(minutes=10) or at < now - MAX_PUNCH_AGE:
                    logger.warning("iclock: %s marcación con fecha imposible %s", entry.serial, punch.local_time)
                    continue
                await access_sync.record_punch(
                    db, device, pin=punch.pin, occurred_at=punch.occurred_at,
                    credential_kind=punch.credential_kind,
                    client_event_id=f"zk:{punch.pin}:{punch.local_time}", db_name=entry.db_name,
                )
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
        protected = bool((device.config or {}).get("allowed_ips")) or _secure(request) \
            or settings.environment != "production"
        lines = []
        for cmd in commands:
            if cmd.kind == "face_photo" and not protected:
                cmd.status = "failed"
                cmd.error = ("Por seguridad la foto del rostro solo se envía por HTTPS o a un equipo con IP permitida. "
                             "Activa HTTPS en el equipo o registra el rostro en el torniquete.")
                continue
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
