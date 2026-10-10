"""Verificación en dos pasos del personal: qué métodos tiene cada persona y los
códigos de un solo uso que se envían por correo.

Métodos (todos opcionales; se recomiendan, no se imponen):
- `totp`: app autenticadora (Google/Microsoft Authenticator). El más seguro.
- `email`: código de 6 dígitos al correo.
- `passkey`: llave de acceso del equipo (huella, rostro o PIN).
- `backup`: códigos de respaldo de un solo uso, para cuando falta el celular.

Los códigos por correo viven en Redis con su hash, vencen a los 10 minutos y
aguantan 5 intentos. Si Redis no responde, no se puede verificar: falla
cerrado (nunca se deja pasar a alguien porque el almacén no contestó).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time

from fastapi import HTTPException

from app.core.config import settings
from app.services import account_security, emails, mailer

CODE_MINUTES = 10
MAX_ATTEMPTS = 5
RESEND_SECONDS = 45
METHOD_LABELS = {
    "totp": "aplicación autenticadora",
    "email": "código por correo",
    "passkey": "llave de acceso",
}


def methods(staff) -> list[str]:
    """Métodos activos para el segundo paso, en orden de seguridad."""
    out = []
    if staff.totp_enabled:
        out.append("totp")
    if getattr(staff, "mfa_passkey_enabled", False):
        out.append("passkey")
    if getattr(staff, "mfa_email_enabled", False):
        out.append("email")
    return out


def is_on(staff) -> bool:
    return bool(methods(staff))


def preferred(staff) -> str | None:
    active = methods(staff)
    chosen = getattr(staff, "mfa_preferred", None)
    return chosen if chosen in active else (active[0] if active else None)


def mask_email(email: str) -> str:
    user, _, domain = email.partition("@")
    shown = user[:2] if len(user) > 3 else user[:1]
    return f"{shown}{'•' * min(5, max(2, len(user) - len(shown)))}@{domain}"


def _key(purpose: str, subject: str) -> str:
    return f"otp:{purpose}:{subject}"


def _hash(code: str) -> str:
    return hashlib.sha256(f"{settings.secret_key}:{code}".encode()).hexdigest()


async def send_code(staff, purpose: str, *, to: str | None = None, action: str | None = None) -> None:
    """Genera y envía un código. `purpose` separa los usos (login, contraseña,
    correo nuevo...): un código pedido para una cosa no sirve para otra."""
    redis = account_security._redis()
    key = _key(purpose, str(staff.id))
    try:
        raw = await redis.get(key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail="No pudimos generar el código. Intenta en un minuto.") from exc
    if raw:
        sent_at = json.loads(raw).get("sent_at", 0)
        if time.time() - sent_at < RESEND_SECONDS:
            wait = int(RESEND_SECONDS - (time.time() - sent_at)) + 1
            raise HTTPException(status_code=429, detail=f"Ya te enviamos un código. Espera {wait} segundos para pedir otro.")
    code = f"{secrets.randbelow(10**6):06d}"
    try:
        await redis.setex(key, CODE_MINUTES * 60, json.dumps({"h": _hash(code), "n": 0, "sent_at": time.time()}))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail="No pudimos generar el código. Intenta en un minuto.") from exc
    if action:
        email = emails.security_code(code, CODE_MINUTES, action, staff.full_name)
    else:
        email = emails.mfa_email_code(code, CODE_MINUTES, staff.full_name)
    if not await mailer.send_email(to or staff.email, email):
        await redis.delete(key)
        raise HTTPException(status_code=502, detail="No pudimos enviar el correo. Intenta de nuevo en unos minutos.")


async def check_code(staff_id, purpose: str, code: str) -> bool:
    """True si el código es el último enviado para ese uso. Se consume al acertar."""
    code = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(code) != 6:
        return False
    redis = account_security._redis()
    key = _key(purpose, str(staff_id))
    try:
        raw = await redis.get(key)
        if not raw:
            return False
        data = json.loads(raw)
        if data.get("n", 0) >= MAX_ATTEMPTS:
            return False
        if hmac.compare_digest(data["h"], _hash(code)):
            # Solo gana quien logra borrarlo: dos peticiones simultáneas con el
            # mismo código no pueden usarlo las dos.
            return bool(await redis.delete(key))
        data["n"] = data.get("n", 0) + 1
        ttl = await redis.ttl(key)
        await redis.setex(key, max(ttl, 1), json.dumps(data))
        return False
    except Exception:  # noqa: BLE001
        return False
