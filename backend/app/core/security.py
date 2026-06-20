from datetime import datetime, timedelta, timezone
from typing import Any
import hashlib
import secrets
import uuid

import bcrypt
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    # bcrypt limit is 72 bytes — encode to bytes and truncate
    password_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def generate_invite_token() -> str:
    """Token aleatorio de alta entropía para invitaciones (un solo uso)."""
    return secrets.token_urlsafe(32)


def hash_invite_token(token: str) -> str:
    """Hash del token de invitación. El token ya es alta entropía, así que basta
    sha256 (no bcrypt): guardamos solo el hash, nunca el token plano."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    password_bytes = plain.encode("utf-8")[:72]
    return bcrypt.checkpw(password_bytes, hashed.encode("utf-8"))


def create_access_token(
    owner_id: str,
    tenant_id: str | None,
    db_name: str | None,
    role: str = "owner",
    staff_id: str | None = None,
) -> str:
    """Genera JWT con contexto de owner + tenant para multi-tenant DB dinámica.

    `staff_id` apunta a la fila UserStaff del owner en su tenant DB, para que el
    owner pueda pasar por get_current_staff/require_role igual que el resto del staff.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": owner_id,
        "tenant_id": tenant_id,
        "db_name": db_name,
        "role": role,
        "staff_id": staff_id,
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_staff_token(staff_id: str, db_name: str, role: str) -> str:
    """Genera JWT para staff del gym (admin/receptionist) autenticado contra tenant DB."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": staff_id,
        "staff_id": staff_id,
        "db_name": db_name,
        "role": role,
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_realtime_token(staff_id: str, db_name: str) -> str:
    """JWT efímero para el SSE de recepción. EventSource no permite headers, así
    que el token viaja en la query; con TTL corto (scope=realtime) la ventana de
    exposición en logs/proxies es mínima. Se pide justo antes de conectar."""
    expire = datetime.now(timezone.utc) + timedelta(seconds=settings.realtime_token_ttl_seconds)
    payload = {
        "sub": staff_id,
        "db_name": db_name,
        "scope": "realtime",
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


KIOSK_TOKEN_TTL_DAYS = 30


def create_kiosk_token(device_id: str, db_name: str, jti: str) -> str:
    """JWT de dispositivo kiosko con scope restringido a /kiosk. Expira a los 30
    días y se renueva en cada heartbeat (/kiosk/ping); la revocación inmediata
    sigue siendo por kiosk_devices.is_active (verificada por jti en cada request)."""
    expire = datetime.now(timezone.utc) + timedelta(days=KIOSK_TOKEN_TTL_DAYS)
    payload = {
        "sub": device_id,
        "device_id": device_id,
        "db_name": db_name,
        "scope": "kiosk",
        "exp": expire,
        "jti": jti,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        ) from exc
