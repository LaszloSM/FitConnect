"""Protocolo PUSH/ADMS de ZKTeco ("iclock"): el equipo llama solo a la nube.

Funciones puras (sin base de datos) para leer lo que manda el equipo y armar
lo que se le responde. Flujo del equipo:

- ``GET  /iclock/cdata?SN=..&options=all`` → opciones de la sesión (handshake).
- ``POST /iclock/cdata?SN=..&table=ATTLOG`` → marcaciones, una por línea:
  ``PIN<TAB>AAAA-MM-DD HH:MM:SS<TAB>estado<TAB>verificación<TAB>workcode...``
- ``POST /iclock/cdata?SN=..&table=OPERLOG`` → altas/cambios de usuarios y
  plantillas: ``USER PIN=1<TAB>Name=..``, ``FP PIN=1<TAB>FID=0<TAB>TMP=..``,
  ``FACE PIN=1 ..``, ``BIODATA Pin=1<TAB>Type=9 ..``, ``OPLOG ...``.
- ``GET  /iclock/getrequest?SN=..`` → la nube responde ``C:<id>:<comando>``
  por línea, u ``OK`` si no hay nada.
- ``POST /iclock/devicecmd?SN=..`` → resultado: ``ID=<id>&Return=<n>&CMD=<verbo>``
  (Return >= 0 es éxito).

Las plantillas (TMP, Content) que el equipo sube NUNCA se guardan: solo se
registra que el PIN tiene rostro o huella.

Lo que varía entre firmwares se deja configurable por dispositivo
(``KioskDevice.config``): comando de enrolar, de abrir y la estrategia de
bloqueo. Ver docs/ACCESO_TORNIQUETE.md.
"""
from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

from app.core.timeutil import BOGOTA

# Códigos de verificación más comunes del campo 4 de ATTLOG.
VERIFY_KIND = {0: "pin", 1: "fingerprint", 2: "card", 3: "pin", 4: "card", 15: "face", 25: "palm"}

# Tags de OPERLOG que traen plantillas y qué credencial representan.
_TEMPLATE_TAGS = {"FP": "fingerprint", "FINGERTMP": "fingerprint", "FACE": "face", "BIOPHOTO": "face"}

# BIODATA trae Type: 1 huella, 2 rostro infrarrojo, 8 palma, 9 rostro visible.
_BIODATA_TYPE = {"1": "fingerprint", "2": "face", "9": "face", "8": "palm"}

#: Habilitado / bloqueado por zona horaria. "0000..." = usa las zonas del grupo
#: (acceso normal); "0001" + tres zonas en 0 = zona personal vacía (sin acceso).
#: Así el equipo conserva rostro y huella aunque la persona esté bloqueada.
TZ_ENABLED = "0000000000000000"
TZ_BLOCKED = "0001000000000000"

DEFAULT_OPEN_COMMAND = "CONTROL DEVICE 01010105"


@dataclass
class Punch:
    pin: str
    occurred_at: datetime  # UTC naive
    local_time: str
    verify: Optional[int]
    status: Optional[int]

    @property
    def credential_kind(self) -> str:
        return VERIFY_KIND.get(self.verify if self.verify is not None else -1, "device")


@dataclass
class OperRecord:
    tag: str
    fields: dict[str, str] = field(default_factory=dict)

    @property
    def pin(self) -> Optional[str]:
        for k in ("PIN", "Pin", "pin"):
            if self.fields.get(k):
                return self.fields[k].strip()
        return None

    @property
    def template_kind(self) -> Optional[str]:
        if self.tag in _TEMPLATE_TAGS:
            return _TEMPLATE_TAGS[self.tag]
        if self.tag == "BIODATA":
            return _BIODATA_TYPE.get(str(self.fields.get("Type", self.fields.get("type", ""))).strip(), "face")
        return None


def _lines(body: str) -> list[str]:
    return [ln.strip("\r") for ln in body.replace("\r\n", "\n").split("\n") if ln.strip()]


def parse_kv(text: str) -> dict[str, str]:
    """``PIN=1<TAB>Name=Ana María`` → {"PIN": "1", "Name": "Ana María"}."""
    out: dict[str, str] = {}
    for part in text.split("\t"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v
    return out


def device_local_to_utc(value: str, tz: ZoneInfo = BOGOTA) -> datetime:
    local = datetime.strptime(value.strip(), "%Y-%m-%d %H:%M:%S").replace(tzinfo=tz)
    return local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def parse_attlog(body: str, tz: ZoneInfo = BOGOTA) -> list[Punch]:
    punches: list[Punch] = []
    for line in _lines(body):
        cols = line.split("\t") if "\t" in line else _split_spaces(line)
        if len(cols) < 2 or not cols[0].strip():
            continue
        try:
            occurred = device_local_to_utc(cols[1], tz)
        except ValueError:
            continue
        punches.append(Punch(
            pin=cols[0].strip(),
            occurred_at=occurred,
            local_time=cols[1].strip(),
            status=_int(cols[2]) if len(cols) > 2 else None,
            verify=_int(cols[3]) if len(cols) > 3 else None,
        ))
    return punches


def _split_spaces(line: str) -> list[str]:
    parts = line.split()
    if len(parts) < 3:
        return parts
    return [parts[0], f"{parts[1]} {parts[2]}", *parts[3:]]


def _int(v: Any) -> Optional[int]:
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def parse_operlog(body: str) -> list[OperRecord]:
    records: list[OperRecord] = []
    for line in _lines(body):
        tag, _, rest = line.partition(" ")
        records.append(OperRecord(tag=tag.strip().upper(), fields=parse_kv(rest)))
    return records


def parse_devicecmd(body: str) -> list[dict[str, Any]]:
    """``ID=12&Return=0&CMD=DATA`` (una o varias líneas) → [{id, return, cmd}]."""
    results = []
    for line in _lines(body):
        parts = dict(p.split("=", 1) for p in line.split("&") if "=" in p)
        wid = _int(parts.get("ID"))
        if wid is None:
            continue
        results.append({"id": wid, "return": _int(parts.get("Return")), "cmd": parts.get("CMD")})
    return results


def handshake(serial: str, *, now_local: datetime, tz_hours: int = -5, stamps: Optional[dict] = None) -> str:
    stamps = stamps or {}
    lines = [
        f"GET OPTION FROM: {serial}",
        f"ATTLOGStamp={stamps.get('ATTLOG', '0')}",
        f"OPERLOGStamp={stamps.get('OPERLOG', '0')}",
        "ATTPHOTOStamp=None",
        "ErrorDelay=30",
        "Delay=5",
        "TransTimes=00:00;12:00",
        "TransInterval=1",
        "TransFlag=TransData AttLog OpLog EnrollUser ChgUser EnrollFP ChgFP FACE UserPic",
        f"TimeZone={tz_hours}",
        "Realtime=1",
        "Encrypt=None",
        f"DateTime={now_local.strftime('%Y-%m-%d %H:%M:%S')}",
        "ServerVer=2.4.1",
    ]
    return "\n".join(lines) + "\n"


def _clean(value: str, limit: int = 24) -> str:
    """El nombre viaja dentro de un comando separado por TAB y salto de línea:
    cualquiera de los dos en un nombre corrompería el comando."""
    return re.sub(r"[\t\r\n=]", " ", value or "").strip()[:limit]


def user_info_command(pin: str, name: str, *, enabled: bool, card: str = "", password: str = "") -> str:
    fields = [
        f"PIN={_clean(pin, 24)}",
        f"Name={_clean(name)}",
        "Pri=0",
        f"Passwd={_clean(password, 8)}",
        f"Card={_clean(card, 20)}",
        "Grp=1",
        f"TZ={TZ_ENABLED if enabled else TZ_BLOCKED}",
    ]
    return "DATA UPDATE USERINFO " + "\t".join(fields)


def wire_command(wire_id: int, kind: str, payload: dict, config: Optional[dict] = None) -> Optional[str]:
    """Traduce un DeviceCommand al texto que entiende el equipo. ``None`` si el
    comando no aplica a este protocolo (se marca como fallido)."""
    config = config or {}
    body: Optional[str] = None
    pin = str(payload.get("pin", ""))
    if kind == "user_sync":
        enabled = bool(payload.get("enabled"))
        if not enabled and config.get("block_strategy") == "delete":
            body = f"DATA DELETE USERINFO PIN={_clean(pin)}"
        else:
            body = user_info_command(
                pin, payload.get("name", ""), enabled=enabled,
                card=payload.get("card", ""), password=payload.get("password", ""),
            )
    elif kind == "user_remove":
        body = f"DATA DELETE USERINFO PIN={_clean(pin)}"
    elif kind == "enroll_fingerprint":
        fid = int(payload.get("finger", 0))
        if config.get("enroll_command") == "ENROLL_BIO":
            body = f"ENROLL_BIO TYPE=1\tPIN={_clean(pin)}\tNO={fid}\tRETRY=3\tOVERWRITE=1"
        else:
            body = f"ENROLL_FP PIN={_clean(pin)}\tFID={fid}\tRETRY=3\tOVERWRITE=1"
    elif kind == "enroll_face":
        body = f"ENROLL_BIO TYPE=9\tPIN={_clean(pin)}\tNO=0\tRETRY=3\tOVERWRITE=1"
    elif kind == "face_photo":
        content = payload.get("content_b64", "")
        size = len(base64.b64decode(content)) if content else 0
        body = f"DATA UPDATE BIOPHOTO PIN={_clean(pin)}\tType=9\tSize={size}\tContent={content}\tFormat=0\tUrl="
    elif kind == "biometric_delete":
        table = "FACE" if payload.get("biometric") == "face" else "FINGERTMP"
        body = f"DATA DELETE {table} PIN={_clean(pin)}"
    elif kind == "open_door":
        body = config.get("open_command") or DEFAULT_OPEN_COMMAND
    elif kind == "query_users":
        body = "DATA QUERY USERINFO"
    if body is None:
        return None
    return f"C:{wire_id}:{body}"
