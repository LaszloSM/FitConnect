"""Cerebro único de acceso: kiosko, recepción, torniquete y lectores llaman
aquí. Resuelve la credencial → socio, decide con las reglas de check-in
(membresía, gracia, pase del día) y deja bitácora en access_events."""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import uuid

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import utcnow_naive
from app.models.tenant.access import AccessEvent, MemberCredential
from app.models.tenant.checkin import CheckIn, CheckInType
from app.models.tenant.kiosk_device import KioskDevice
from app.models.tenant.member import Member
from app.services.checkin import register_checkin, DuplicateCheckin, checkin_status, consume_entry, decision_for
from app.services.gym_settings import get_gym_settings
from app.services.storage import resolve_media_url

DENIAL_MESSAGES = {
    "expired": "Plan vencido. Pasa por recepción.",
    "frozen": "Plan congelado. Pasa por recepción.",
    "scheduled": "Tu plan empieza más adelante. Pasa por recepción.",
    "no_membership": "Sin plan activo. Pasa por recepción.",
    "no_entries": "Se acabaron las entradas de tu plan. Pasa por recepción.",
    "not_found": "Credencial no reconocida. Pasa por recepción.",
    "device_inactive": "Dispositivo desactivado.",
}


@dataclass
class AccessDecision:
    allow: bool
    decision: str            # allowed | denied | not_found | duplicate
    reason: str | None
    message: str
    member_id: str | None = None
    member_name: str | None = None
    photo_url: str | None = None
    membership_status: str | None = None
    checkin_id: str | None = None
    upcoming_class: dict | None = None
    extra: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "allow": self.allow, "decision": self.decision, "reason": self.reason, "message": self.message,
            "member_id": self.member_id, "member_name": self.member_name, "photo_url": self.photo_url,
            "membership_status": self.membership_status, "checkin_id": self.checkin_id, "upcoming_class": self.upcoming_class,
        }


async def resolve_member(
    db: AsyncSession, *, id_number: str | None = None, qr_code: str | None = None,
    device_user_id: str | None = None, device_id: uuid.UUID | None = None,
) -> tuple[Member | None, str, str | None]:
    """→ (socio, tipo de credencial usada, referencia). El ID de usuario dentro
    del lector se mapea por member_credentials; si no hay mapeo, por convención
    el ID del lector es la cédula."""
    if qr_code:
        m = (await db.execute(select(Member).where(Member.qr_code == qr_code.strip()))).scalar_one_or_none()
        return m, "qr", qr_code.strip()[:64]
    if device_user_id:
        ref = device_user_id.strip()
        cred = (await db.execute(
            select(MemberCredential).where(
                MemberCredential.device_user_id == ref, MemberCredential.revoked_at.is_(None),
                (MemberCredential.device_id.is_(None)) | (MemberCredential.device_id == device_id),
            ).order_by(desc(MemberCredential.device_id))
        )).scalars().first()
        if cred:
            m = (await db.execute(select(Member).where(Member.id == cred.member_id))).scalar_one_or_none()
            return m, cred.kind, ref
        m = (await db.execute(select(Member).where(Member.id_number == ref))).scalar_one_or_none()
        return m, "id_number", ref
    if id_number:
        ref = id_number.strip()
        m = (await db.execute(select(Member).where(Member.id_number == ref))).scalar_one_or_none()
        return m, "id_number", ref
    return None, "id_number", None


def _log(db: AsyncSession, device: KioskDevice | None, member: Member | None, kind: str, ref: str | None,
         direction: str, decision: str, reason: str | None, *, offline: bool = False,
         client_event_id: str | None = None, checkin_id=None, occurred_at: datetime | None = None) -> AccessEvent:
    ev = AccessEvent(
        device_id=device.id if device else None, member_id=member.id if member else None,
        credential_kind=kind, credential_ref=ref, direction=direction, decision=decision, reason=reason,
        offline=offline, client_event_id=client_event_id, checkin_id=checkin_id,
        occurred_at=occurred_at or utcnow_naive(),
    )
    db.add(ev)
    return ev


async def verify_access(
    db: AsyncSession, device: KioskDevice, *, id_number: str | None = None, qr_code: str | None = None,
    device_user_id: str | None = None, direction: str = "entry", db_name: str | None = None,
) -> AccessDecision:
    member, kind, ref = await resolve_member(db, id_number=id_number, qr_code=qr_code, device_user_id=device_user_id, device_id=device.id)
    if not member:
        _log(db, device, None, kind, ref, direction, "not_found", "not_found")
        return AccessDecision(False, "not_found", "not_found", DENIAL_MESSAGES["not_found"])

    first_name = member.full_name.split(" ")[0]
    if direction == "exit":
        _log(db, device, member, kind, ref, "exit", "allowed", None)
        return AccessDecision(True, "allowed", None, f"Hasta pronto, {first_name}.", member_id=str(member.id),
                              member_name=member.full_name)

    try:
        checkin, status, upcoming = await register_checkin(db, member, source=device.kind, db_name=db_name)
    except DuplicateCheckin:
        # Torniquete: ya registró entrada hace minutos (salió a la calle y volvió). Pasa sin duplicar asistencia.
        _log(db, device, member, kind, ref, direction, "duplicate", None)
        return AccessDecision(True, "duplicate", None, f"Bienvenido de nuevo, {first_name}.", member_id=str(member.id),
                              member_name=member.full_name, photo_url=resolve_media_url(member.photo_url))
    await db.flush()
    allow = checkin.decision == "allowed"
    if allow:
        message = f"¡Bienvenido, {first_name}!"
        if status == "in_grace":
            message = f"Bienvenido, {first_name}. Tu plan venció, recuerda pagar."
    else:
        message = DENIAL_MESSAGES.get(checkin.denial_reason or "", DENIAL_MESSAGES["no_membership"])
    _log(db, device, member, kind, ref, direction, checkin.decision, checkin.denial_reason, checkin_id=checkin.id)
    return AccessDecision(
        allow, checkin.decision, checkin.denial_reason, message, member_id=str(member.id), member_name=member.full_name,
        photo_url=resolve_media_url(member.photo_url) if allow else None, membership_status=status,
        checkin_id=str(checkin.id), upcoming_class=upcoming,
    )


async def record_offline_events(db: AsyncSession, device: KioskDevice, events: list[dict]) -> dict:
    """Lote que el agente reporta tras un corte de red. Idempotente por
    client_event_id. Las entradas que el equipo autorizó offline se registran
    como asistencia (source = tipo de dispositivo)."""
    existing = set((await db.execute(
        select(AccessEvent.client_event_id).where(
            AccessEvent.device_id == device.id,
            AccessEvent.client_event_id.in_([e["client_event_id"] for e in events]),
        )
    )).scalars().all())
    accepted = skipped = checkins = 0
    for e in events:
        if e["client_event_id"] in existing:
            skipped += 1
            continue
        member, kind, ref = await resolve_member(db, id_number=e.get("id_number"), qr_code=e.get("qr_code"),
                                                 device_user_id=e.get("device_user_id"), device_id=device.id)
        decision = e["decision"] if member else "not_found"
        checkin_id = None
        if member and decision == "allowed" and e.get("direction", "entry") == "entry":
            # El equipo ya lo dejó pasar: la entrada se descuenta aunque agote el saldo.
            _, ms = await checkin_status(member.id, db, (await get_gym_settings(db)).grace_days)
            if ms is not None:
                await consume_entry(db, ms, enforce=False)
            ci = CheckIn(member_id=member.id, type=CheckInType.entry, decision="allowed", denial_reason=None,
                         source=device.kind, created_at=e["occurred_at"])
            db.add(ci)
            await db.flush()
            checkin_id = ci.id
            checkins += 1
        _log(db, device, member, kind, ref, e.get("direction", "entry"), decision,
             None if decision == "allowed" else (e.get("reason") or decision),
             offline=True, client_event_id=e["client_event_id"], checkin_id=checkin_id, occurred_at=e["occurred_at"])
        existing.add(e["client_event_id"])
        accepted += 1
    return {"accepted": accepted, "skipped": skipped, "checkins": checkins}


ALLOWLIST_MAX = 2000


async def allowlist(db: AsyncSession, hours: int = 24) -> list[dict]:
    """Socios que pueden pasar si el dispositivo queda sin red (policy
    allow_recent): quienes están al día hoy y entraron en las últimas N horas."""
    cutoff = utcnow_naive() - timedelta(hours=hours)
    member_ids = (await db.execute(
        select(CheckIn.member_id).where(CheckIn.decision == "allowed", CheckIn.created_at >= cutoff)
        .distinct().limit(ALLOWLIST_MAX)
    )).scalars().all()
    if not member_ids:
        return []
    gym = await get_gym_settings(db)
    members = (await db.execute(select(Member).where(Member.id.in_(member_ids)))).scalars().all()
    creds = (await db.execute(
        select(MemberCredential).where(MemberCredential.member_id.in_(member_ids), MemberCredential.revoked_at.is_(None))
    )).scalars().all()
    by_member: dict = {}
    for c in creds:
        by_member.setdefault(c.member_id, []).append({"kind": c.kind, "device_user_id": c.device_user_id})
    out = []
    for m in members:
        status, _ = await checkin_status(m.id, db, gym.grace_days)
        if decision_for(status)[0] != "allowed":
            continue
        out.append({"member_id": str(m.id), "id_number": m.id_number, "credentials": by_member.get(m.id, [])})
    return out
