from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

import bcrypt
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    # bcrypt limit is 72 bytes — encode to bytes and truncate
    password_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


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


def create_kiosk_token(device_id: str, db_name: str, jti: str) -> str:
    """JWT de dispositivo kiosko: sin expiración (la revocación es por fila
    kiosk_devices.is_active), con scope restringido a los endpoints /kiosk."""
    payload = {
        "sub": device_id,
        "device_id": device_id,
        "db_name": db_name,
        "scope": "kiosk",
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
