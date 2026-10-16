"""Ciclo de la suscripción de un gimnasio a LSMFit.

  trialing ─(vence la prueba)→ past_due ─(N días de gracia)→ read_only
  active   ─(vence paid_until)→ past_due ─(N días de gracia)→ read_only
  un pago registrado en el panel extiende paid_until y lo deja en active
  comp_until vigente = cortesía: acceso completo sin cobro (pilotos, aliados)
  suspended: solo lo decide el panel de plataforma

`read_only` deja consultar pero no registrar cambios. Los socios SIEMPRE
pueden entrar (torniquete, kiosko): un gimnasio que no pagó no puede dejar
a su gente en la calle.
"""
from __future__ import annotations

import time

from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select

from app.core.config import settings
from app.core.timeutil import today_bogota
from app.models.master.tenant import SubscriptionPlan, Tenant, TenantStatus

#: Precio mensual de referencia por plan (COP), para el ingreso recurrente estimado.
PLAN_PRICE_COP = {
    SubscriptionPlan.basic: 160_000,
    SubscriptionPlan.advanced: 300_000,
    SubscriptionPlan.premium_ai: 480_000,
}
PLAN_LABEL = {
    SubscriptionPlan.basic: "Básico",
    SubscriptionPlan.advanced: "Avanzado",
    SubscriptionPlan.premium_ai: "Premium IA",
}
#: Módulos que se pueden encender por gimnasio además de los del plan.
MODULES = {"member_app": "App para socios", "ai": "Inteligencia y asistente"}
PLAN_MODULES = {
    SubscriptionPlan.basic: set(),
    SubscriptionPlan.advanced: {"member_app"},
    SubscriptionPlan.premium_ai: {"member_app", "ai"},
}


def monthly_price(t: Tenant) -> int:
    """Lo que paga este gimnasio al mes: el precio acordado o el de lista del plan."""
    return t.price_cop if t.price_cop is not None else PLAN_PRICE_COP.get(t.plan, 0)


def _status(t: Tenant) -> TenantStatus:
    return t.status if isinstance(t.status, TenantStatus) else TenantStatus(t.status)


def effective(t: Tenant, today: Optional[date] = None) -> dict:
    """Estado real hoy (lo guardado puede ir un día atrás del job)."""
    today = today or today_bogota()
    status = _status(t)
    grace = settings.past_due_grace_days
    comp = bool(t.comp_until and t.comp_until >= today)
    days_left: Optional[int] = None
    if status == TenantStatus.suspended:
        eff = "suspended"
    elif comp:
        eff = "comp"
        days_left = (t.comp_until - today).days
    elif status == TenantStatus.trialing and t.trial_ends_at:
        if t.trial_ends_at >= today:
            eff, days_left = "trialing", (t.trial_ends_at - today).days
        elif (today - t.trial_ends_at).days <= grace:
            eff, days_left = "past_due", grace - (today - t.trial_ends_at).days
        else:
            eff = "read_only"
    elif status == TenantStatus.active and t.paid_until and t.paid_until < today:
        late = (today - t.paid_until).days
        if late <= grace:
            eff, days_left = "past_due", grace - late
        else:
            eff = "read_only"
    elif status == TenantStatus.past_due:
        since = (t.status_changed_at.date() if t.status_changed_at else today)
        if (today - since).days <= grace:
            eff, days_left = "past_due", grace - (today - since).days
        else:
            eff = "read_only"
    else:
        eff = status.value
    modules = set(PLAN_MODULES.get(t.plan, set())) | {k for k, v in (t.modules or {}).items() if v}
    return {
        "status": eff,
        "can_write": eff not in ("read_only", "suspended"),
        "days_left": days_left,
        "trial_ends_at": t.trial_ends_at.isoformat() if t.trial_ends_at else None,
        "comp_until": t.comp_until.isoformat() if t.comp_until else None,
        "paid_until": t.paid_until.isoformat() if t.paid_until else None,
        "plan": t.plan.value if hasattr(t.plan, "value") else t.plan,
        "plan_label": PLAN_LABEL.get(t.plan, str(t.plan)),
        "modules": sorted(modules),
    }


def set_status(t: Tenant, status: TenantStatus) -> None:
    if _status(t) != status:
        t.status = status
        t.status_changed_at = datetime.utcnow()


def new_tenant_defaults() -> dict:
    return {
        "status": TenantStatus.trialing,
        "trial_ends_at": today_bogota() + timedelta(days=settings.default_trial_days),
        "status_changed_at": datetime.utcnow(),
    }


async def advance_all(master_db) -> int:
    """Job diario: persiste las transiciones por fecha (fin de prueba, fin de gracia)."""
    changed = 0
    for t in (await master_db.execute(select(Tenant))).scalars().all():
        eff = effective(t)["status"]
        target = {"past_due": TenantStatus.past_due, "read_only": TenantStatus.read_only}.get(eff)
        if target and _status(t) != target and _status(t) != TenantStatus.suspended:
            prev = _status(t)
            set_status(t, target)
            # La gracia cuenta desde que terminó la prueba o el periodo pagado, no desde que corrió el job.
            ended = t.trial_ends_at if prev == TenantStatus.trialing else t.paid_until if prev == TenantStatus.active else None
            # Se guarda el último día cubierto: así el conteo de gracia es el mismo antes y después del job.
            if ended:
                t.status_changed_at = datetime.combine(ended, datetime.min.time())
            changed += 1
    await master_db.commit()
    return changed


# ─── Caché del estado por gimnasio (middleware de solo lectura y sesiones) ──

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL = 30.0
_MAX = 5000
_OPEN = {"can_write": True, "suspended": False}


async def access_state(db_name: str) -> dict:
    """{"can_write", "suspended"} del gimnasio. Solo se guardan en caché los
    gimnasios que existen (un db_name inventado no llena la memoria), y si la
    base maestra no responde se deja pasar: el control de verdad es el token."""
    hit = _CACHE.get(db_name)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    from app.db.master_session import MasterSessionLocal
    try:
        async with MasterSessionLocal() as master:
            t = (await master.execute(select(Tenant).where(Tenant.db_name == db_name))).scalar_one_or_none()
    except Exception:  # noqa: BLE001
        return _OPEN
    if t is None:
        return _OPEN
    eff = effective(t)
    value = {"can_write": eff["can_write"], "suspended": eff["status"] == "suspended"}
    if len(_CACHE) >= _MAX:
        _CACHE.clear()
    _CACHE[db_name] = (time.monotonic(), value)
    return value


async def can_write(db_name: str) -> bool:
    return (await access_state(db_name))["can_write"]


def forget(db_name: Optional[str] = None) -> None:
    if db_name:
        _CACHE.pop(db_name, None)
    else:
        _CACHE.clear()
