"""Códigos de un solo uso por app autenticadora (TOTP, RFC 6238).

Compatible con Google Authenticator, Microsoft Authenticator, Authy y 1Password:
SHA-1, 6 dígitos, ventanas de 30 segundos. Se acepta la ventana anterior y la
siguiente para tolerar relojes de celular un poco corridos.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

DIGITS = 6
PERIOD = 30


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10 ** DIGITS).zfill(DIGITS)


def code_at(secret: str, at: float | None = None) -> str:
    return _code(secret, int((at if at is not None else time.time()) // PERIOD))


def normalize(code: str) -> str:
    """Solo los dígitos: "123 456" y "123-456" son el mismo código (y el mismo para
    la protección contra reutilizarlo)."""
    return "".join(ch for ch in (code or "") if ch.isdigit())


def verify(secret: str, code: str, at: float | None = None, window: int = 1) -> bool:
    code = normalize(code)
    if len(code) != DIGITS or not secret:
        return False
    counter = int((at if at is not None else time.time()) // PERIOD)
    return any(hmac.compare_digest(_code(secret, counter + d), code) for d in range(-window, window + 1))


def provisioning_uri(secret: str, account: str, issuer: str = "LSMFit") -> str:
    return (f"otpauth://totp/{quote(issuer)}:{quote(account)}"
            f"?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits={DIGITS}&period={PERIOD}")


def new_backup_codes(n: int = 8) -> list[str]:
    """Códigos de respaldo de un solo uso (para cuando se pierde el celular)."""
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return ["-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(2)) for _ in range(n)]


def hash_backup_code(code: str) -> str:
    # HMAC con la llave del servidor: con 40 bits por código, un hash simple se
    # revierte por fuerza bruta si alguien obtiene una copia de la base.
    from app.core.config import settings
    clean = "".join(ch for ch in (code or "") if ch.isalnum()).upper()
    return hmac.new(f"backup::{settings.secret_key}".encode(), clean.encode(), hashlib.sha256).hexdigest()


def consume_backup_code(hashes: list[str] | None, code: str) -> list[str] | None:
    """Devuelve la lista sin el código usado, o None si el código no es válido."""
    h = hash_backup_code(code)
    if not hashes or not any(hmac.compare_digest(h, x) for x in hashes):
        return None
    return [x for x in hashes if x != h]
