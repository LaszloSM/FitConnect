"""Enlaces públicos firmados (recibo por WhatsApp) sin dependencia extra:
HMAC-SHA256 sobre `payload|exp` con SECRET_KEY, en base64url."""
import base64
import hashlib
import hmac
import time

from app.core.config import settings


def _sign(msg: bytes) -> str:
    digest = hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def sign(scope: str, value: str, ttl_seconds: int) -> str:
    exp = int(time.time()) + ttl_seconds
    body = f"{scope}|{value}|{exp}".encode()
    return base64.urlsafe_b64encode(body).decode().rstrip("=") + "." + _sign(body)


def verify(scope: str, token: str) -> str | None:
    """Devuelve el valor firmado si la firma es válida y no venció; si no, None."""
    try:
        body_b64, sig = token.split(".", 1)
        body = base64.urlsafe_b64decode(body_b64 + "=" * (-len(body_b64) % 4))
    except (ValueError, TypeError):
        return None
    if not hmac.compare_digest(_sign(body), sig):
        return None
    try:
        got_scope, value, exp = body.decode().split("|")
    except ValueError:
        return None
    if got_scope != scope or int(exp) < time.time():
        return None
    return value
