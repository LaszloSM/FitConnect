"""Protecciones de cuenta que necesitan memoria compartida entre réplicas (Redis):
intentos fallidos por correo y tokens revocados al cerrar sesión.

Si Redis no responde se deja pasar (con log): una caída de Redis no puede
dejar a todo el gimnasio sin poder entrar al sistema.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)
_clients: dict[int, object] = {}
LOCK_SECONDS = 15 * 60


def _redis():
    # Un cliente por event loop: las conexiones de redis.asyncio quedan atadas al
    # loop que las abrió (en producción hay uno solo; en pruebas, uno por test).
    import asyncio
    loop_id = id(asyncio.get_running_loop())
    client = _clients.get(loop_id)
    if client is None:
        import redis.asyncio as aioredis
        _clients.clear()
        client = _clients[loop_id] = aioredis.from_url(settings.redis_url, socket_timeout=1, socket_connect_timeout=1)
    return client


def _key(email: str) -> str:
    return f"loginfail:{email.strip().lower()}"


async def too_many_failures(email: str) -> bool:
    try:
        n = await _redis().get(_key(email))
        return n is not None and int(n) >= settings.login_max_failures
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis no disponible para el límite de login: %s", exc)
        return False


async def register_failure(email: str) -> None:
    try:
        r = _redis()
        n = await r.incr(_key(email))
        if n == 1:
            await r.expire(_key(email), LOCK_SECONDS)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis no disponible para el límite de login: %s", exc)


async def clear_failures(email: str) -> None:
    try:
        await _redis().delete(_key(email))
    except Exception:  # noqa: BLE001
        pass


async def revoke_jti(jti: Optional[str], exp: Optional[int]) -> None:
    if not jti:
        return
    ttl = max(int((exp or time.time() + 3600) - time.time()), 1)
    try:
        await _redis().setex(f"revoked:{jti}", ttl, "1")
    except Exception as exc:  # noqa: BLE001
        logger.warning("No se pudo revocar el token: %s", exc)


async def is_revoked(jti: Optional[str]) -> bool:
    if not jti:
        return False
    try:
        return bool(await _redis().exists(f"revoked:{jti}"))
    except Exception:  # noqa: BLE001
        return False


async def claim_code(subject: str, code: str) -> bool:
    """Un código de la app autenticadora sirve una sola vez: quien lo vea por
    encima del hombro no puede reutilizarlo en los ~90 s que sigue vigente."""
    from app.core.totp import normalize
    try:
        return bool(await _redis().set(f"totpused:{subject}:{normalize(code)}", "1", nx=True, ex=120))
    except Exception:  # noqa: BLE001
        return True


def _sessions_key(staff_id: str) -> str:
    return f"sessions_after:{staff_id}"


async def end_sessions_before_now(staff_id) -> None:
    """Tras cambiar la contraseña, toda sesión abierta antes deja de servir (si
    alguien más la tenía, la pierde)."""
    try:
        await _redis().setex(_sessions_key(str(staff_id)), settings.access_token_expire_minutes * 60 + 60,
                             str(int(time.time())))
    except Exception as exc:  # noqa: BLE001
        logger.warning("No se pudieron cerrar las sesiones anteriores: %s", exc)


async def issued_before_password_change(staff_id, iat) -> bool:
    if not staff_id or not iat:
        return False
    try:
        cutoff = await _redis().get(_sessions_key(str(staff_id)))
        return cutoff is not None and int(iat) < int(cutoff)
    except Exception:  # noqa: BLE001
        return False
