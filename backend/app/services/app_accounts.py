"""Cuentas de la app móvil: entrar con un código por correo, sesiones por
dispositivo, vínculo con la ficha del gimnasio y QR de entrada rotativo.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import app_derived_key, create_app_token
from app.models.master.app_user import (
    AppConsent, AppLinkCode, AppLoginCode, AppPushToken, AppSession, AppUser, MemberLink,
)
from app.models.master.tenant import Tenant

logger = logging.getLogger(__name__)

CODE_MINUTES = 10
CODE_MAX_ATTEMPTS = 5
CODES_PER_HOUR = 5
LINK_CODE_HOURS = 48
LINK_CODE_MAX_ATTEMPTS = 5
#: Sin I, L, O, 0 ni 1: se dictan por teléfono sin confundirse.
_LINK_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

#: Consentimientos que la persona da o quita en la app, cada uno por separado.
CONSENTS = {
    "health": "Datos de salud (peso, talla, cuestionario de salud)",
    "notifications": "Avisos en el celular",
    "ai_plans": "Generar planes con un servicio de IA de Google usando datos anónimos (edad en rango, sexo, peso y talla aproximados, objetivo y metas)",
}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _code_hash(email: str, code: str) -> str:
    # Con el correo dentro: el mismo código de dos personas no da el mismo hash.
    return hmac.new(app_derived_key("login"), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def normalize_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 255:
        raise HTTPException(status_code=422, detail="Escribe un correo válido")
    return email


# ─── Entrar con código ───

async def request_code(db: AsyncSession, email: str) -> Optional[str]:
    """Crea y envía un código. Devuelve None si ya se pidieron demasiados (la
    respuesta al cliente es la misma: no se revela nada sobre el correo)."""
    now = datetime.utcnow()
    recent = (await db.execute(
        select(AppLoginCode.id).where(AppLoginCode.email == email, AppLoginCode.created_at >= now - timedelta(hours=1))
    )).all()
    if len(recent) >= CODES_PER_HOUR:
        return None
    await db.execute(update(AppLoginCode).where(AppLoginCode.email == email, AppLoginCode.used_at.is_(None))
                     .values(used_at=now))
    code = f"{secrets.randbelow(10 ** 6):06d}"
    db.add(AppLoginCode(email=email, code_hash=_code_hash(email, code), expires_at=now + timedelta(minutes=CODE_MINUTES)))
    await db.commit()
    return code


async def check_code(db: AsyncSession, email: str, code: str, *, consume: bool) -> bool:
    now = datetime.utcnow()
    row = (await db.execute(
        select(AppLoginCode).where(AppLoginCode.email == email, AppLoginCode.used_at.is_(None),
                                   AppLoginCode.expires_at > now)
        .order_by(AppLoginCode.created_at.desc()).limit(1).with_for_update()
    )).scalar_one_or_none()
    if row is None or row.attempts >= CODE_MAX_ATTEMPTS:
        return False
    code = re.sub(r"\D", "", code or "")
    if not hmac.compare_digest(row.code_hash, _code_hash(email, code)):
        row.attempts += 1
        await db.commit()
        return False
    if consume:
        row.used_at = now
    return True


# ─── Sesiones ───

async def issue_session(db: AsyncSession, user: AppUser, device_name: str | None) -> dict:
    refresh = secrets.token_urlsafe(32)
    s = AppSession(app_user_id=user.id, token_hash=_sha(refresh), device_name=(device_name or "")[:120] or None,
                   expires_at=datetime.utcnow() + timedelta(days=settings.app_refresh_days))
    db.add(s)
    user.last_login_at = datetime.utcnow()
    await db.flush()
    return {"access_token": create_app_token(str(user.id), str(s.id)), "refresh_token": refresh,
            "expires_in": settings.app_access_minutes * 60}


async def rotate_session(db: AsyncSession, refresh: str) -> dict:
    now = datetime.utcnow()
    h = _sha(refresh or "")
    s = (await db.execute(select(AppSession).where(AppSession.token_hash == h).with_for_update())).scalar_one_or_none()
    if s is None:
        stolen = (await db.execute(select(AppSession).where(AppSession.previous_hash == h))).scalar_one_or_none()
        if stolen is not None:
            # Un token ya rotado volvió a usarse: alguien tiene una copia.
            await db.execute(update(AppSession).where(AppSession.app_user_id == stolen.app_user_id,
                                                      AppSession.revoked_at.is_(None)).values(revoked_at=now))
            await db.commit()
            logger.warning("Reuso de token de la app: se cerraron las sesiones de %s", stolen.app_user_id)
        raise HTTPException(status_code=401, detail="Sesión vencida. Vuelve a entrar.")
    if s.revoked_at is not None or s.expires_at <= now:
        raise HTTPException(status_code=401, detail="Sesión vencida. Vuelve a entrar.")
    new = secrets.token_urlsafe(32)
    s.previous_hash, s.token_hash, s.last_used_at = h, _sha(new), now
    s.expires_at = now + timedelta(days=settings.app_refresh_days)
    await db.commit()
    return {"access_token": create_app_token(str(s.app_user_id), str(s.id)), "refresh_token": new,
            "expires_in": settings.app_access_minutes * 60}


async def revoke_session(db: AsyncSession, refresh: str) -> None:
    await db.execute(update(AppSession).where(AppSession.token_hash == _sha(refresh or ""), AppSession.revoked_at.is_(None))
                     .values(revoked_at=datetime.utcnow()))
    await db.commit()


# ─── Consentimientos ───

async def consents(db: AsyncSession, user_id) -> dict[str, bool]:
    rows = (await db.execute(
        select(AppConsent.kind, AppConsent.granted).where(AppConsent.app_user_id == user_id).order_by(AppConsent.created_at)
    )).all()
    state = {k: False for k in CONSENTS}
    for kind, granted in rows:
        state[kind] = granted
    return state


def record_consent(db: AsyncSession, user_id, kind: str, granted: bool) -> None:
    if kind not in CONSENTS:
        raise HTTPException(status_code=422, detail="Consentimiento desconocido")
    db.add(AppConsent(app_user_id=user_id, kind=kind, granted=granted, version=settings.app_terms_version))


# ─── Vínculo con la ficha del gimnasio ───

def _normalize_link_code(code: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (code or "").upper())


async def create_link_code(db: AsyncSession, tenant: Tenant, member_id, created_by=None) -> tuple[str, datetime]:
    """Código para que el socio vincule su app. Los anteriores de ese socio dejan de servir."""
    now = datetime.utcnow()
    await db.execute(update(AppLinkCode).where(AppLinkCode.tenant_id == tenant.id, AppLinkCode.member_id == member_id,
                                               AppLinkCode.used_at.is_(None)).values(used_at=now))
    raw = "".join(secrets.choice(_LINK_ALPHABET) for _ in range(8))
    expires = now + timedelta(hours=LINK_CODE_HOURS)
    db.add(AppLinkCode(code_hash=_sha(raw), tenant_id=tenant.id, member_id=member_id, created_by=created_by,
                       expires_at=expires))
    await db.commit()
    return f"{raw[:4]}-{raw[4:]}", expires


async def find_link_code(db: AsyncSession, code: str) -> Optional[AppLinkCode]:
    row = (await db.execute(
        select(AppLinkCode).where(AppLinkCode.code_hash == _sha(_normalize_link_code(code))).with_for_update()
    )).scalar_one_or_none()
    if row is None or row.used_at is not None or row.expires_at <= datetime.utcnow() \
            or row.attempts >= LINK_CODE_MAX_ATTEMPTS:
        return None
    return row


async def active_links(db: AsyncSession, user_id) -> list[tuple[MemberLink, Tenant]]:
    return list((await db.execute(
        select(MemberLink, Tenant).join(Tenant, Tenant.id == MemberLink.tenant_id)
        .where(MemberLink.app_user_id == user_id, MemberLink.revoked_at.is_(None))
        .order_by(MemberLink.created_at)
    )).all())


async def delete_account(db: AsyncSession, user: AppUser) -> None:
    """Borra la cuenta y todo lo que es de la app. La ficha del gimnasio no se
    toca: es del gimnasio, que responde por ella ante el socio."""
    from app.db.app_db import app_session
    from app.models.app import (AppProfile, CreditEntry, Food, FoodFavorite, MealEntry, PlanJob, SavedPlan,
                                WaterEntry, WeightLog, Workout)
    async with app_session() as adb:
        for model in (Workout, MealEntry, WaterEntry, SavedPlan, PlanJob, CreditEntry, FoodFavorite, WeightLog,
                      AppProfile):
            await adb.execute(delete(model).where(model.app_user_id == user.id))
        await adb.execute(delete(Food).where(Food.owner_id == user.id))
        await adb.commit()
    for model in (AppPushToken, AppConsent, AppSession, MemberLink):
        await db.execute(delete(model).where(model.app_user_id == user.id))
    await db.execute(delete(AppLoginCode).where(AppLoginCode.email == user.email))
    await db.delete(user)
    await db.commit()
