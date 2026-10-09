"""Gimnasios suscritos: lista, cifras agregadas y gestión de la suscripción.

Privacidad por diseño: aquí solo hay metadatos del gimnasio y conteos. Ningún
endpoint devuelve nombres, cédulas, teléfonos ni pagos de socios.
"""
import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.platform.deps import current_admin, log, master_db
from app.core.timeutil import today_bogota
from app.models.master.owner import Owner
from app.models.master.platform import PlatformAdmin, PlatformAuditLog
from app.models.master.tenant import SubscriptionPlan, Tenant, TenantStatus
from app.services import device_directory, subscription

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tenants", tags=["platform"])

_METRICS_SQL = text("""
    SELECT
      (SELECT count(*) FROM members WHERE member_type = 'member') AS members,
      (SELECT count(DISTINCT ms.member_id) FROM memberships ms JOIN members m ON m.id = ms.member_id
         WHERE m.member_type = 'member' AND ms.status <> 'cancelled'
           AND ms.start_date <= :today AND ms.end_date >= :today) AS active_members,
      (SELECT max(created_at) FROM checkins) AS last_checkin,
      (SELECT count(*) FROM checkins WHERE created_at >= :since30) AS checkins_30d,
      (SELECT max(created_at) FROM payments) AS last_payment,
      (SELECT count(*) FROM kiosk_devices WHERE is_active AND kind IN ('turnstile','reader')) AS turnstiles,
      (SELECT count(*) FROM kiosk_devices WHERE is_active AND kind IN ('turnstile','reader')
         AND last_seen_at >= :since5m) AS turnstiles_online,
      (SELECT count(*) FROM users WHERE is_active) AS staff
""")


async def tenant_metrics(db_name: str) -> dict:
    """Conteos del gimnasio (sin datos personales). Si su base no responde, se dice."""
    try:
        async with device_directory.tenant_session(db_name) as db:
            now = datetime.utcnow()
            row = (await asyncio.wait_for(db.execute(_METRICS_SQL, {
                "today": today_bogota(), "since30": now - timedelta(days=30), "since5m": now - timedelta(minutes=5),
            }), timeout=5)).mappings().one()
            out = dict(row)
            for k in ("last_checkin", "last_payment"):
                out[k] = out[k].isoformat() if out[k] else None
            return out
    except Exception as exc:  # noqa: BLE001
        logger.warning("Métricas de %s no disponibles: %s", db_name, exc)
        return {"error": "Base del gimnasio no disponible"}


async def _gather_metrics(tenants: list[Tenant]) -> dict[str, dict]:
    sem = asyncio.Semaphore(8)

    async def one(t: Tenant):
        async with sem:
            return str(t.id), await tenant_metrics(t.db_name)
    return dict(await asyncio.gather(*(one(t) for t in tenants)))


def _out(t: Tenant, owner: Optional[Owner], metrics: Optional[dict] = None) -> dict:
    eff = subscription.effective(t)
    return {
        "id": str(t.id), "name": t.name, "slug": t.slug, "city": t.city, "country": t.country, "phone": t.phone,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "owner_email": owner.email if owner else None, "owner_name": owner.full_name if owner else None,
        "stored_status": t.status.value if hasattr(t.status, "value") else t.status,
        "subscription": eff, "comp_reason": t.comp_reason, "internal_notes": t.internal_notes,
        "modules": t.modules or {},
        "monthly_price": subscription.PLAN_PRICE_COP.get(t.plan, 0),
        "metrics": metrics,
    }


async def _tenant(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[Tenant, Optional[Owner]]:
    t = await db.get(Tenant, tenant_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Gimnasio no encontrado")
    owner = (await db.execute(select(Owner).where(Owner.tenant_id == t.id))).scalars().first()
    return t, owner


@router.get("/overview")
async def overview(db: AsyncSession = Depends(master_db), _admin: PlatformAdmin = Depends(current_admin)):
    tenants = (await db.execute(select(Tenant))).scalars().all()
    counts: dict[str, int] = {}
    mrr = 0
    ending: list[dict] = []
    today = today_bogota()
    for t in tenants:
        eff = subscription.effective(t, today)
        counts[eff["status"]] = counts.get(eff["status"], 0) + 1
        if eff["status"] == "active":
            mrr += subscription.PLAN_PRICE_COP.get(t.plan, 0)
        if eff["status"] in ("trialing", "comp") and eff["days_left"] is not None and eff["days_left"] <= 7:
            ending.append({"id": str(t.id), "name": t.name, "status": eff["status"], "days_left": eff["days_left"]})
    since = datetime.utcnow() - timedelta(days=30)
    new_30d = sum(1 for t in tenants if t.created_at and t.created_at >= since)
    return {
        "total": len(tenants), "by_status": counts, "mrr_cop": mrr, "new_30d": new_30d,
        "ending_soon": sorted(ending, key=lambda x: x["days_left"]),
    }


@router.get("")
async def list_tenants(
    q: str = Query("", max_length=100),
    status: Optional[str] = Query(None),
    with_metrics: bool = Query(True),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(master_db),
    _admin: PlatformAdmin = Depends(current_admin),
):
    stmt = select(Tenant)
    if q:
        like = f"%{q.strip()}%"
        owner_ids = select(Owner.tenant_id).where(Owner.email.ilike(like))
        stmt = stmt.where(or_(Tenant.name.ilike(like), Tenant.city.ilike(like), Tenant.slug.ilike(like),
                              Tenant.id.in_(owner_ids)))
    rows = (await db.execute(stmt.order_by(Tenant.created_at.desc()))).scalars().all()
    if status:
        rows = [t for t in rows if subscription.effective(t)["status"] == status]
    total = len(rows)
    page = rows[offset:offset + limit]
    owners = {o.tenant_id: o for o in (await db.execute(
        select(Owner).where(Owner.tenant_id.in_([t.id for t in page]))
    )).scalars().all()} if page else {}
    metrics = await _gather_metrics(page) if with_metrics else {}
    return {"items": [_out(t, owners.get(t.id), metrics.get(str(t.id))) for t in page], "total": total}


@router.get("/{tenant_id}")
async def tenant_detail(tenant_id: uuid.UUID, db: AsyncSession = Depends(master_db),
                        _admin: PlatformAdmin = Depends(current_admin)):
    t, owner = await _tenant(db, tenant_id)
    history = (await db.execute(
        select(PlatformAuditLog).where(PlatformAuditLog.tenant_id == t.id)
        .order_by(PlatformAuditLog.created_at.desc()).limit(30)
    )).scalars().all()
    return {
        **_out(t, owner, await tenant_metrics(t.db_name)),
        "history": [{"action": h.action, "admin_email": h.admin_email, "details": h.details,
                     "created_at": h.created_at.isoformat()} for h in history],
    }


class TrialIn(BaseModel):
    days: int = Field(ge=1, le=365)


@router.post("/{tenant_id}/trial")
async def set_trial(tenant_id: uuid.UUID, payload: TrialIn, request: Request,
                    db: AsyncSession = Depends(master_db), admin: PlatformAdmin = Depends(current_admin)):
    """Prueba gratis por N días desde hoy (o extiende la que tiene)."""
    t, owner = await _tenant(db, tenant_id)
    base = max(today_bogota(), t.trial_ends_at or today_bogota()) if t.status == TenantStatus.trialing else today_bogota()
    t.trial_ends_at = base + timedelta(days=payload.days)
    subscription.set_status(t, TenantStatus.trialing)
    log(db, request, admin, "tenant.trial", t.id, {"days": payload.days, "until": t.trial_ends_at.isoformat()})
    await db.commit()
    subscription.forget(t.db_name)
    return _out(t, owner)


class CompIn(BaseModel):
    until: Optional[date] = None
    reason: str = Field(default="", max_length=255)


@router.post("/{tenant_id}/comp")
async def set_comp(tenant_id: uuid.UUID, payload: CompIn, request: Request,
                   db: AsyncSession = Depends(master_db), admin: PlatformAdmin = Depends(current_admin)):
    """Cortesía: acceso completo sin cobro hasta una fecha (until=null la quita)."""
    t, owner = await _tenant(db, tenant_id)
    if payload.until and payload.until < today_bogota():
        raise HTTPException(status_code=422, detail="La fecha de la cortesía ya pasó")
    if payload.until and len(payload.reason.strip()) < 3:
        raise HTTPException(status_code=422, detail="Escribe el motivo de la cortesía")
    t.comp_until = payload.until
    t.comp_reason = payload.reason.strip() or None if payload.until else None
    if payload.until and t.status in (TenantStatus.past_due, TenantStatus.read_only):
        subscription.set_status(t, TenantStatus.active)
    log(db, request, admin, "tenant.comp", t.id,
        {"until": payload.until.isoformat() if payload.until else None, "reason": payload.reason})
    await db.commit()
    subscription.forget(t.db_name)
    return _out(t, owner)


class TenantPatch(BaseModel):
    plan: Optional[SubscriptionPlan] = None
    modules: Optional[dict[str, bool]] = None
    internal_notes: Optional[str] = Field(default=None, max_length=5000)
    status: Optional[Literal["active", "past_due", "read_only"]] = None


@router.patch("/{tenant_id}")
async def update_tenant(tenant_id: uuid.UUID, payload: TenantPatch, request: Request,
                        db: AsyncSession = Depends(master_db), admin: PlatformAdmin = Depends(current_admin)):
    t, owner = await _tenant(db, tenant_id)
    changes = payload.model_dump(exclude_unset=True)
    if "modules" in changes:
        unknown = set(changes["modules"]) - set(subscription.MODULES)
        if unknown:
            raise HTTPException(status_code=422, detail=f"Módulos desconocidos: {', '.join(sorted(unknown))}")
        t.modules = {**(t.modules or {}), **changes["modules"]}
    if "plan" in changes:
        t.plan = payload.plan
    if "internal_notes" in changes:
        t.internal_notes = payload.internal_notes
    if "status" in changes:
        subscription.set_status(t, TenantStatus(payload.status))
    log(db, request, admin, "tenant.update", t.id,
        {k: (v.value if hasattr(v, "value") else v) for k, v in changes.items() if k != "internal_notes"})
    await db.commit()
    subscription.forget(t.db_name)
    return _out(t, owner)


class SuspendIn(BaseModel):
    reason: str = Field(min_length=3, max_length=255)


@router.post("/{tenant_id}/suspend")
async def suspend(tenant_id: uuid.UUID, payload: SuspendIn, request: Request,
                  db: AsyncSession = Depends(master_db), admin: PlatformAdmin = Depends(current_admin)):
    """Suspende el acceso del personal al sistema. Los socios siguen entrando al gimnasio."""
    t, owner = await _tenant(db, tenant_id)
    subscription.set_status(t, TenantStatus.suspended)
    log(db, request, admin, "tenant.suspend", t.id, {"reason": payload.reason})
    await db.commit()
    subscription.forget(t.db_name)
    return _out(t, owner)


@router.post("/{tenant_id}/reactivate")
async def reactivate(tenant_id: uuid.UUID, request: Request,
                     db: AsyncSession = Depends(master_db), admin: PlatformAdmin = Depends(current_admin)):
    t, owner = await _tenant(db, tenant_id)
    subscription.set_status(t, TenantStatus.active)
    log(db, request, admin, "tenant.reactivate", t.id, {})
    await db.commit()
    subscription.forget(t.db_name)
    return _out(t, owner)


@router.get("/-/audit")
async def platform_audit(limit: int = Query(100, ge=1, le=500), db: AsyncSession = Depends(master_db),
                         _admin: PlatformAdmin = Depends(current_admin)):
    rows = (await db.execute(
        select(PlatformAuditLog, Tenant.name).outerjoin(Tenant, Tenant.id == PlatformAuditLog.tenant_id)
        .order_by(PlatformAuditLog.created_at.desc()).limit(limit)
    )).all()
    return [{"action": r.action, "admin_email": r.admin_email, "tenant": name, "details": r.details, "ip": r.ip,
             "created_at": r.created_at.isoformat()} for r, name in rows]




class ResetMfaIn(BaseModel):
    reason: str = Field(min_length=5, max_length=255)


@router.post("/{tenant_id}/reset-owner-mfa")
async def reset_owner_mfa(tenant_id: uuid.UUID, payload: ResetMfaIn, request: Request,
                          db: AsyncSession = Depends(master_db), admin: PlatformAdmin = Depends(current_admin)):
    """El dueño perdió el celular y los códigos de respaldo: se borra su app
    autenticadora y en el próximo ingreso configura una nueva. Verificar antes su
    identidad por un canal aparte (llamada al teléfono registrado)."""
    from sqlalchemy import func as sa_func
    from app.models.tenant.user_staff import UserStaff
    from app.services.account_security import end_sessions_before_now

    t, owner = await _tenant(db, tenant_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="El gimnasio no tiene dueño registrado")
    async with device_directory.tenant_session(t.db_name) as tdb:
        staff = (await tdb.execute(
            select(UserStaff).where(sa_func.lower(UserStaff.email) == owner.email.lower())
        )).scalars().first()
        if staff is None:
            raise HTTPException(status_code=404, detail="No se encontró la cuenta del dueño en el gimnasio")
        staff.totp_enabled = False
        staff.totp_secret_enc = None
        staff.backup_codes = None
        await tdb.commit()
        staff_id = staff.id
    await end_sessions_before_now(staff_id)
    log(db, request, admin, "tenant.reset_owner_mfa", t.id, {"reason": payload.reason})
    await db.commit()
    return {"ok": True}
