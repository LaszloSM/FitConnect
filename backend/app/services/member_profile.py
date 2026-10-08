"""Qué le falta a la ficha de un socio y enlaces para que él mismo la complete.

Los socios importados del software anterior llegan con huecos (sin contacto de
emergencia, sin cuestionario de salud, sin autorización de datos). En vez de que
recepción los llame uno por uno, se les manda un enlace por WhatsApp o correo, o
la app se los pide al entrar.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.tenant.member import Member, MemberType
from app.models.tenant.profile_link import ProfileLink

LINK_DAYS = 7
#: No se reenvía a un mismo socio antes de esto en los envíos masivos.
RESEND_AFTER = timedelta(days=3)
BULK_MAX = 300

#: Lo que hace falta para que la ficha cuente como completa.
REQUIRED: dict[str, str] = {
    "id_number": "Documento",
    "phone": "Celular",
    "birth_date": "Fecha de nacimiento",
    "emergency_contact": "Contacto de emergencia",
    "parq": "Cuestionario de salud (PAR-Q)",
    "consent_data": "Autorización de tratamiento de datos",
}
#: Útil pero no bloquea nada.
OPTIONAL: dict[str, str] = {
    "email": "Correo",
    "address": "Dirección",
    "eps": "EPS",
    "blood_type": "RH",
    "photo": "Foto",
}


def _filled(member: Member, key: str) -> bool:
    if key == "emergency_contact":
        return bool(member.emergency_contact_name and member.emergency_contact_phone)
    if key == "parq":
        return member.parq_completed_at is not None
    if key == "consent_data":
        return member.consent_data_at is not None
    if key == "photo":
        return bool(member.photo_url)
    return bool(getattr(member, key, None))


def status(member: Member) -> dict:
    missing = [k for k in REQUIRED if not _filled(member, k)]
    optional = [k for k in OPTIONAL if not _filled(member, k)]
    done = len(REQUIRED) - len(missing)
    return {
        "complete": not missing,
        "percent": round(100 * done / len(REQUIRED)),
        "missing": missing,
        "missing_optional": optional,
        "labels": {**REQUIRED, **OPTIONAL},
    }


def incomplete_condition():
    """El mismo criterio de `status`, en SQL, para filtrar el listado."""
    return or_(
        Member.id_number.is_(None),
        Member.phone.is_(None),
        Member.birth_date.is_(None),
        Member.emergency_contact_name.is_(None),
        Member.emergency_contact_phone.is_(None),
        Member.parq_completed_at.is_(None),
        Member.consent_data_at.is_(None),
    )


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def link_url(slug: str, token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/completar/{slug}/{token}"


async def create_link(db: AsyncSession, member: Member, *, channel: str, created_by=None) -> tuple[ProfileLink, str]:
    """Nuevo enlace (los anteriores sin usar de ese socio dejan de servir)."""
    now = datetime.utcnow()
    for old in (await db.execute(
        select(ProfileLink).where(ProfileLink.member_id == member.id, ProfileLink.used_at.is_(None),
                                  ProfileLink.expires_at > now)
    )).scalars().all():
        old.expires_at = now
    token = secrets.token_urlsafe(24)
    link = ProfileLink(member_id=member.id, token_hash=_hash(token), channel=channel,
                       expires_at=now + timedelta(days=LINK_DAYS), created_by=created_by)
    db.add(link)
    await db.flush()
    return link, token


async def find_link(db: AsyncSession, token: str) -> Optional[ProfileLink]:
    link = (await db.execute(
        select(ProfileLink).where(ProfileLink.token_hash == _hash(token)).with_for_update()
    )).scalar_one_or_none()
    if link is None or link.used_at is not None or link.expires_at <= datetime.utcnow():
        return None
    return link


def message_text(member: Member, gym_name: str, url: str) -> str:
    nombre = (member.full_name or "").split(" ")[0].title()
    return (f"Hola {nombre}, en {gym_name} estamos actualizando la ficha de cada socio. "
            f"Completa tus datos aquí (toma 2 minutos): {url}\n"
            f"El enlace es personal y vence en {LINK_DAYS} días.")


async def recently_sent(db: AsyncSession, member_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    if not member_ids:
        return set()
    since = datetime.utcnow() - RESEND_AFTER
    rows = await db.execute(
        select(ProfileLink.member_id).where(ProfileLink.member_id.in_(member_ids), ProfileLink.created_at >= since)
    )
    return {r for r in rows.scalars().all()}


async def bulk_candidates(db: AsyncSession, channel: str, limit: int) -> list[Member]:
    stmt = select(Member).where(Member.member_type == MemberType.member.value, incomplete_condition())
    if channel == "whatsapp":
        stmt = stmt.where(Member.phone.is_not(None))
    elif channel == "email":
        stmt = stmt.where(Member.email.is_not(None))
    members = (await db.execute(stmt.order_by(Member.created_at).limit(limit * 3))).scalars().all()
    skip = await recently_sent(db, [m.id for m in members])
    return [m for m in members if m.id not in skip][:limit]


async def sent_recently(db: AsyncSession, member_id, minutes: int = 10) -> bool:
    """Un mismo socio no recibe otro WhatsApp o correo con enlace antes de esto."""
    since = datetime.utcnow() - timedelta(minutes=minutes)
    return (await db.execute(
        select(ProfileLink.id).where(ProfileLink.member_id == member_id, ProfileLink.created_at >= since,
                                     ProfileLink.channel.in_(["whatsapp", "email"])).limit(1)
    )).first() is not None


_BLOOD_TYPES = {"A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"}
_SELF_FIELDS = {"id_number", "phone", "email", "birth_date", "gender", "address", "city",
                "emergency_contact_name", "emergency_contact_phone", "eps", "blood_type"}


async def apply_self_update(db: AsyncSession, member: Member, data: dict, *, actor_name: str) -> dict:
    """El socio completa su ficha (enlace o app). Solo escribe los campos VACÍOS:
    no sirve para cambiar lo que el gimnasio ya tiene registrado. No hace commit."""
    import re
    from fastapi import HTTPException
    from app.core.timeutil import today_bogota
    from app.schemas.member import PARQ_REQUIRED_KEYS, MemberBase, normalize_id_number
    from app.services.audit import audit

    accept_data = bool(data.pop("accept_data", False))
    accept_image = bool(data.pop("accept_image", False))
    if member.consent_data_at is None and not accept_data:
        raise HTTPException(status_code=422, detail="Para guardar tus datos debes aceptar la política de tratamiento de datos.")
    parq = data.pop("parq_answers", None)
    data = {k: v for k, v in data.items() if k in _SELF_FIELDS and v is not None}
    for key in ("phone", "emergency_contact_phone"):
        if data.get(key):
            data[key] = MemberBase.normalize_colombian_phone(data[key])
    if "blood_type" in data:
        data["blood_type"] = data["blood_type"].upper()
        if data["blood_type"] not in _BLOOD_TYPES:
            raise HTTPException(status_code=422, detail="RH no válido")
    if "email" in data:
        data["email"] = data["email"].strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", data["email"]):
            raise HTTPException(status_code=422, detail="Correo no válido")
    id_conflict = False
    if "id_number" in data:
        data["id_number"] = normalize_id_number(data["id_number"])
        if member.id_number is None:
            taken = (await db.execute(
                select(Member.id).where(Member.id_number == data["id_number"], Member.id != member.id)
            )).first()
            if taken:
                # No se le dice a quien escribe: sería una forma de averiguar
                # quién es socio del gimnasio. Recepción lo ve en la auditoría.
                data.pop("id_number")
                id_conflict = True
    filled: list[str] = []
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        if value in ("", None) or getattr(member, key, None):
            continue
        setattr(member, key, value)
        filled.append(key)
    if parq is not None and member.parq_completed_at is None:
        if PARQ_REQUIRED_KEYS - {k for k, v in parq.items() if isinstance(v, bool)}:
            raise HTTPException(status_code=422, detail="Responde las 7 preguntas del cuestionario de salud.")
        member.parq_answers = {k: bool(parq[k]) for k in sorted(PARQ_REQUIRED_KEYS)}
        member.parq_completed_at = today_bogota()
        filled.append("parq")
    now = datetime.utcnow()
    if accept_data and member.consent_data_at is None:
        member.consent_data_at = now
        filled.append("consent_data")
    if accept_image and member.consent_image_at is None:
        member.consent_image_at = now
        filled.append("consent_image")
    audit(db, None, "member.profile_self_update", "member", member.id,
          {"fields": filled, **({"id_number_conflict": True} if id_conflict else {})}, actor_name=actor_name)
    return {"ok": True, "filled": filled, "parq_alert": bool(parq and any(parq.values())),
            "complete": status(member)["complete"]}
