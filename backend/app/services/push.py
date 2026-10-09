"""Avisos en el celular (Expo Push) para socios con la app vinculada.

Solo a quien dio el consentimiento `notifications`. Fuera de producción no se
llama a Expo: los avisos quedan en `OUTBOX` (como el correo) para las pruebas.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.db.master_session import MasterSessionLocal
from app.models.master.app_user import AppConsent, AppPushToken, MemberLink

logger = logging.getLogger(__name__)
EXPO_URL = "https://exp.host/--/api/v2/push/send"


@dataclass
class Push:
    token: str
    title: str
    body: str
    data: dict


OUTBOX: list[Push] = []


async def _tokens_for_members(db_name: str, member_ids: list[uuid.UUID]) -> list[str]:
    if not member_ids:
        return []
    async with MasterSessionLocal() as master:
        users = set((await master.execute(select(MemberLink.app_user_id).where(
            MemberLink.db_name == db_name, MemberLink.member_id.in_(member_ids), MemberLink.revoked_at.is_(None)
        ))).scalars().all())
        if not users:
            return []
        consents = (await master.execute(
            select(AppConsent.app_user_id, AppConsent.granted).where(
                AppConsent.app_user_id.in_(users), AppConsent.kind == "notifications")
            .order_by(AppConsent.created_at)
        )).all()
        state: dict = {}
        for uid, granted in consents:
            state[uid] = granted
        allowed = [u for u in users if state.get(u)]
        if not allowed:
            return []
        return list((await master.execute(
            select(AppPushToken.token).where(AppPushToken.app_user_id.in_(allowed))
        )).scalars().all())


async def notify_members(db_name: str, member_ids: list[uuid.UUID], title: str, body: str,
                         data: dict | None = None) -> int:
    """Envía y devuelve a cuántos celulares. Un fallo de Expo nunca rompe a quien llama."""
    try:
        tokens = await _tokens_for_members(db_name, member_ids)
        messages = [Push(t, title[:120], body[:500], data or {}) for t in tokens]
        if settings.environment != "production":
            OUTBOX.extend(messages)
            return len(messages)
        async with httpx.AsyncClient(timeout=10) as client:
            for i in range(0, len(messages), 100):
                chunk = messages[i:i + 100]
                await client.post(EXPO_URL, json=[
                    {"to": m.token, "title": m.title, "body": m.body, "data": m.data, "sound": "default"} for m in chunk
                ])
        return len(messages)
    except Exception:
        logger.exception("No se pudieron enviar los avisos push")
        return 0
