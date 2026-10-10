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
    **extra,
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
        "iat": int(datetime.now(timezone.utc).timestamp()),
        # Milisegundos: "cerrar las demás sesiones" no puede depender de que el
        # token nuevo y los viejos hayan nacido en segundos distintos.
        "iat_ms": int(datetime.now(timezone.utc).timestamp() * 1000),
        **extra,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_staff_token(staff_id: str, db_name: str, role: str, **extra) -> str:
    """Genera JWT para staff del gym (admin/receptionist) autenticado contra tenant DB."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": staff_id,
        "staff_id": staff_id,
        "db_name": db_name,
        "role": role,
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
        # Milisegundos: "cerrar las demás sesiones" no puede depender de que el
        # token nuevo y los viejos hayan nacido en segundos distintos.
        "iat_ms": int(datetime.now(timezone.utc).timestamp() * 1000),
        **extra,
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


# ─── Panel de plataforma ────────────────────────────────────────────────────

def _platform_key() -> str:
    if settings.platform_secret_key:
        return settings.platform_secret_key
    # Derivada pero distinta: un token de gimnasio no valida aquí ni al revés.
    return hashlib.sha256(f"platform::{settings.secret_key}".encode()).hexdigest()


# Audiencias de los tokens. Las de antes del cambio de nombre (FitConnect) se
# siguen aceptando para no cerrar sesiones abiertas; se emiten solo las nuevas.
PLATFORM_AUD, APP_AUD = "lsmfit-platform", "lsmfit-app"
_LEGACY_AUD = {PLATFORM_AUD: "fitconnect-platform", APP_AUD: "fitconnect-app"}


def _decode_aud(token: str, key: str, audience: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, key, algorithms=[settings.algorithm], audience=audience)
    except JWTError:
        return jwt.decode(token, key, algorithms=[settings.algorithm], audience=_LEGACY_AUD[audience])


def create_platform_token(admin_id: str, scope: str = "platform", minutes: int | None = None, **extra) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes or settings.platform_token_minutes)
    payload = {"sub": admin_id, "scope": scope, "aud": PLATFORM_AUD, "exp": expire,
               "jti": str(uuid.uuid4()), **extra}
    return jwt.encode(payload, _platform_key(), algorithm=settings.algorithm)


def decode_platform_token(token: str, scope: str = "platform") -> dict[str, Any]:
    try:
        payload = _decode_aud(token, _platform_key(), PLATFORM_AUD)
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida o vencida") from exc
    if payload.get("scope") != scope:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida")
    return payload


# ─── Verificación en dos pasos del gimnasio ─────────────────────────────────

def create_challenge_token(purpose: str, minutes: int = 5, **claims) -> str:
    """Token corto para el segundo paso del login (no da acceso a nada más)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {"scope": f"mfa_{purpose}", "exp": expire, "jti": str(uuid.uuid4()), **claims}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


# ─── App móvil (socios y usuarios independientes) ───────────────────────────

def _app_key() -> str:
    # Llave derivada y distinta: un token de la app no abre el panel del gimnasio ni al revés.
    return hashlib.sha256(f"app::{settings.secret_key}".encode()).hexdigest()


def create_app_token(app_user_id: str, session_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.app_access_minutes)
    payload = {"sub": app_user_id, "sid": session_id, "scope": "app", "aud": APP_AUD, "exp": expire}
    return jwt.encode(payload, _app_key(), algorithm=settings.algorithm)


def decode_app_token(token: str) -> dict[str, Any]:
    try:
        payload = _decode_aud(token, _app_key(), APP_AUD)
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión vencida") from exc
    if payload.get("scope") != "app":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida")
    return payload


def app_derived_key(purpose: str) -> bytes:
    """Llaves de la app para otros usos (QR rotativo), sin reutilizar la de los tokens."""
    return hashlib.sha256(f"app-{purpose}::{settings.secret_key}".encode()).digest()
