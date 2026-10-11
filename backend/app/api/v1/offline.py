"""Recepción sin conexión (internet o servidor caídos).

El navegador de recepción guarda una copia de quién puede entrar (`/snapshot`)
y, sin red, decide con ella. Al volver la conexión sube las entradas que anotó
(`/checkins`), idempotente por `client_event_id`. El servidor sigue siendo la
autoridad: si alguien entró sin estar al día según el servidor, se marca para
revisar en vez de borrarlo (la persona ya entró).
"""
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import desc, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_staff, get_tenant_db_from_token, require_perm
from app.core import permissions as perm
from app.core.permissions import has_perm
from app.core.timeutil import today_bogota, utcnow_naive
from app.models.tenant.access import AccessEvent
from app.models.tenant.checkin import CheckIn, CheckInType
from app.models.tenant.day_pass import DayPass, DayPassStatus
from app.models.tenant.member import Member
from app.models.tenant.member_plan import MemberPlan
from app.models.tenant.membership import Membership
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.checkin import checkin_status, consume_entry, entries_left, status_from_memberships
from app.services.gym_settings import get_gym_settings
from app.services.staff_member import STAFF_PLAN_NAME

router = APIRouter(prefix="/offline", tags=["offline"])

SNAPSHOT_MAX = 20_000
BATCH_MAX = 500
STATUS_ES = {
    "expired": "membresía vencida", "frozen": "membresía congelada", "no_membership": "sin membresía",
    "no_entries": "ticketera sin entradas", "scheduled": "su plan aún no inicia",
}
#: Lo que se acepta como "pasó sin conexión": más viejo que esto es un error del reloj.
MAX_AGE = timedelta(days=7)


@router.get("/snapshot", dependencies=[Depends(require_perm(perm.CHECKINS_WRITE))])
async def snapshot(db: AsyncSession = Depends(get_tenant_db_from_token)):
    """Lo mínimo para decidir una entrada sin red: sin teléfonos, correos ni salud."""
    gym = await get_gym_settings(db)
    today = today_bogota()
    members = (await db.execute(
        select(Member.id, Member.full_name, Member.id_number, Member.member_type, Member.status)
        .order_by(Member.full_name).limit(SNAPSHOT_MAX)
    )).all()
    by_member: dict = defaultdict(list)
    for m in (await db.execute(select(Membership).order_by(desc(Membership.end_date)))).scalars().all():
        by_member[m.member_id].append(m)
    passes = set((await db.execute(
        select(DayPass.member_id).where(DayPass.valid_on == today, DayPass.status == DayPassStatus.active.value)
    )).scalars().all())

    out = []
    for row in members:
        if row.member_type == "visitor" and row.id not in passes:
            continue
        status, ms = status_from_memberships(by_member.get(row.id, []), today=today, grace_days=gym.grace_days,
                                             has_pass_today=row.id in passes)
        if status == "no_membership":
            ms = None  # la "más relevante" sería una cancelada: no se muestra como su plan
        out.append({
            "id": str(row.id), "name": row.full_name, "id_number": row.id_number,
            "type": row.member_type, "status": status,
            "plan": ms.plan_name if ms else None,
            "end_date": ms.end_date.isoformat() if ms and ms.end_date else None,
            "entries_left": entries_left(ms) if ms else None,
        })
    plans = (await db.execute(
        select(MemberPlan).where(MemberPlan.is_active.is_(True), MemberPlan.name != STAFF_PLAN_NAME)
        .order_by(MemberPlan.price)
    )).scalars().all()
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "today": today.isoformat(),
        "grace_days": gym.grace_days,
        "members": out,
        "plans": [{"id": str(p.id), "name": p.name, "price": float(p.price), "duration_days": p.duration_days,
                   "entries_total": p.entries_total} for p in plans],
    }


class OfflineCheckin(BaseModel):
    client_event_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_:-]+$")
    member_id: uuid.UUID
    occurred_at: datetime
    # Lo que recepción decidió con la copia local.
    decision: Literal["allowed", "override"]
    reason: Optional[str] = Field(default=None, max_length=255)


class OfflineBatch(BaseModel):
    events: list[OfflineCheckin] = Field(max_length=BATCH_MAX)


def _naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


@router.post("/checkins", dependencies=[Depends(require_perm(perm.CHECKINS_WRITE))])
async def upload_checkins(
    payload: OfflineBatch,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    gym = await get_gym_settings(db)
    now = utcnow_naive()
    can_override = has_perm(current_user.role, perm.ACCESS_OVERRIDE)
    results = []
    for e in payload.events:
        # Solo quien puede autorizar online puede autorizar sin conexión; si no,
        # cuenta como una entrada normal y, si no estaba al día, va a revisión.
        decision = e.decision if (e.decision != "override" or can_override) else "allowed"
        cid = f"web:{e.client_event_id}"
        # Dos pestañas sincronizando a la vez no deben duplicar: candado por evento.
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": cid})
        done = (await db.execute(
            select(AccessEvent.id).where(AccessEvent.device_id.is_(None), AccessEvent.client_event_id == cid)
        )).first()
        if done:
            results.append({"client_event_id": e.client_event_id, "result": "duplicate"})
            continue
        at = _naive_utc(e.occurred_at)
        if at > now + timedelta(minutes=5) or at < now - MAX_AGE:
            results.append({"client_event_id": e.client_event_id, "result": "rejected",
                            "detail": "La hora del equipo de recepción no es válida"})
            continue
        member = await db.get(Member, e.member_id)
        if member is None:
            results.append({"client_event_id": e.client_event_id, "result": "rejected", "detail": "Socio no encontrado"})
            continue
        status, ms = await checkin_status(member.id, db, gym.grace_days)
        server_allows = status in ("ok", "in_grace")
        if ms is not None and server_allows:
            await consume_entry(db, ms, enforce=False)
        ci = CheckIn(
            member_id=member.id, type=CheckInType.entry, decision=decision,
            denial_reason=None if server_allows else status, source="offline", created_at=at,
            override_by=current_user.id if decision == "override" else None,
            override_reason=(e.reason or "Autorizado sin conexión") if decision == "override" else None,
            notes="Registrada sin conexión",
        )
        db.add(ci)
        await db.flush()
        db.add(AccessEvent(
            device_id=None, member_id=member.id, credential_kind="reception", credential_ref=None,
            direction="entry", decision=decision, reason=None if server_allows else status,
            offline=True, client_event_id=cid, checkin_id=ci.id, occurred_at=at,
        ))
        review = not server_allows and decision == "allowed"
        if decision == "override":
            audit(db, current_user, "checkin.override", "member", member.id,
                  {"reason": ci.override_reason, "offline": True})
        results.append({"client_event_id": e.client_event_id, "result": "review" if review else "ok",
                        "detail": (f"Entró sin conexión sin estar al día ({STATUS_ES.get(status, status)}). "
                                   "La entrada quedó registrada: cobra o regulariza.") if review else None,
                        "member_name": member.full_name})
    await db.commit()
    return {"results": results}
