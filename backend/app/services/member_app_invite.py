"""Invitación por correo a la app de socios.

El correo lleva un código de vinculación (48 h) y los pasos: el socio entra a la
app con su correo (le llega un código, no hay contraseña) y vincula su ficha con
el código y su documento. Solo si el plan del gimnasio incluye la app.
"""
from __future__ import annotations

import logging

from app.db.master_session import MasterSessionLocal
from app.models.master.tenant import Tenant
from app.models.tenant.member import Member
from app.services import app_accounts, emails, mailer, subscription

logger = logging.getLogger(__name__)


def can_invite(tenant: Tenant, member: Member) -> str | None:
    """Motivo por el que no se puede invitar, o None si se puede."""
    if "member_app" not in subscription.effective(tenant)["modules"]:
        return "La app para socios no está activa en tu plan."
    if not member.email:
        return "El socio no tiene correo registrado."
    if not member.id_number:
        return "El socio necesita un documento registrado para vincular la app."
    return None


async def send(tenant: Tenant, member: Member, gym_name: str, created_by=None) -> bool:
    if can_invite(tenant, member):
        return False
    async with MasterSessionLocal() as master:
        code, _ = await app_accounts.create_link_code(master, tenant, member.id, created_by=created_by)
    email = emails.member_app_welcome(member.full_name, gym_name, member.email, code, app_accounts.LINK_CODE_HOURS)
    return await mailer.send_email(member.email, email)


async def send_quietly(tenant: Tenant, member: Member, gym_name: str, created_by=None) -> None:
    """Para tareas en segundo plano: un correo que falla nunca rompe el alta."""
    try:
        if not await send(tenant, member, gym_name, created_by):
            logger.info("Invitación a la app no enviada al socio %s", member.id)
    except Exception:
        logger.exception("Falló la invitación a la app del socio %s", member.id)
