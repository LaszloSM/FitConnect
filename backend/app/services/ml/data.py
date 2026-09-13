"""De la base del gimnasio a arreglos para los modelos.

Se carga el historial una vez (socios, membresías, visitas y pagos) y todos los
rasgos se calculan en Python sobre esa foto, para poder "ver" a cada socio en
fechas de corte pasadas sin repetir consultas.
"""
from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import utc_day_bounds
from app.models.tenant.checkin import CheckIn
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.payment import Payment, PaymentStatus
from app.services.payment_ledger import net_amount
from app.services.report_data import _to_bogota

NEVER = 180
SNAPSHOTS = 6


@dataclass
class MemberInfo:
    created: date
    active: bool
    full_name: str
    phone: str | None


@dataclass
class Stint:
    start: date
    end: date
    duration: int
    price: float
    plan_name: str


@dataclass
class History:
    today: date
    start: date
    members: dict = field(default_factory=dict)
    stints: dict = field(default_factory=dict)
    visits: dict = field(default_factory=dict)
    hours: dict = field(default_factory=dict)
    visit_times: list = field(default_factory=list)
    paid: dict = field(default_factory=dict)
    daily_revenue: dict = field(default_factory=dict)
    daily_checkins: dict = field(default_factory=dict)

    def finalize(self) -> "History":
        for lst in self.stints.values():
            lst.sort(key=lambda s: s.start)
        for lst in self.visits.values():
            lst.sort()
        return self

    @property
    def first_activity(self) -> date | None:
        dias = list(self.daily_revenue) + list(self.daily_checkins)
        return min(dias) if dias else None


async def load_history(db: AsyncSession, today: date, days: int = 300) -> History:
    start = today - timedelta(days=days)
    desde, _ = utc_day_bounds(start)
    h = History(today=today, start=start)

    for mid, created, status, name, phone in (await db.execute(
        select(Member.id, Member.created_at, Member.status, Member.full_name, Member.phone)
        .where(Member.member_type == "member")
    )).all():
        h.members[mid] = MemberInfo(_to_bogota(created).date(), status == MemberStatus.active, name, phone)

    for mid, s, e, dur, price, plan in (await db.execute(
        select(Membership.member_id, Membership.start_date, Membership.end_date, Membership.duration_days,
               Membership.price, Membership.plan_name)
        .where(Membership.status != MembershipStatus.cancelled.value)
    )).all():
        if mid in h.members:
            h.stints.setdefault(mid, []).append(Stint(s, e, dur or (e - s).days, float(price or 0), plan))

    for mid, ts in (await db.execute(
        select(CheckIn.member_id, CheckIn.created_at)
        .where(CheckIn.created_at >= desde, CheckIn.decision != "denied")
    )).all():
        local = _to_bogota(ts)
        d = local.date()
        h.daily_checkins[d] = h.daily_checkins.get(d, 0) + 1
        h.visit_times.append(local.replace(tzinfo=None))
        if mid in h.members:
            h.visits.setdefault(mid, []).append(d)
            h.hours.setdefault(mid, []).append((d, local.hour))

    for mid, ts, amount in (await db.execute(
        select(Payment.member_id, Payment.created_at, net_amount())
        .where(Payment.status == PaymentStatus.paid, Payment.created_at >= desde)
    )).all():
        d = _to_bogota(ts).date()
        monto = float(amount or 0)
        h.daily_revenue[d] = h.daily_revenue.get(d, 0.0) + monto
        if mid in h.members:
            h.paid.setdefault(mid, []).append((d, monto))

    return h.finalize()


def _between(dates: list[date], lo: date, hi: date) -> int:
    """Cuántas fechas caen en (lo, hi]."""
    return bisect.bisect_right(dates, hi) - bisect.bisect_right(dates, lo)


def features_at(h: History, mid, T: date) -> list[float]:
    """Rasgos del socio vistos en la fecha T, en el orden de `churn.FEATURES`."""
    info = h.members[mid]
    fechas = h.visits.get(mid, [])
    corte = bisect.bisect_right(fechas, T)
    ultima = fechas[corte - 1] if corte else None
    dias_sin = min((T - ultima).days, NEVER) if ultima else NEVER
    v30 = _between(fechas, T - timedelta(days=30), T)
    vprev = _between(fechas, T - timedelta(days=60), T - timedelta(days=30))
    semanas = {d.weekday() for d in fechas[:corte] if d > T - timedelta(days=60)}

    tramos = [s for s in h.stints.get(mid, []) if s.start <= T]
    inicio = min([info.created] + [s.start for s in tramos])
    vigentes = [s for s in tramos if s.start <= T <= s.end]
    actual = vigentes[-1] if vigentes else (max(tramos, key=lambda s: s.end) if tramos else None)
    pagado = sum(m for d, m in h.paid.get(mid, []) if T - timedelta(days=180) < d <= T)

    return [
        float(dias_sin),
        float(v30),
        float(vprev),
        (v30 + 1) / (vprev + 1),
        float(min(max((T - inicio).days, 0), 1095)),
        float(max(len(tramos) - 1, 0)),
        float(min(max((actual.end - T).days, -90), 90)) if actual else -90.0,
        1.0 if vigentes else 0.0,
        float(len(semanas)),
        float(actual.duration) if actual else 0.0,
        pagado / 1000,
    ]


def churn_dataset(h: History, snapshots: int = SNAPSHOTS) -> tuple[list, list, list]:
    """Fotos pasadas etiquetadas: ¿a los 30-45 días seguía con membresía o viniendo?"""
    X, y, snap = [], [], []
    for k in range(snapshots):
        T = h.today - timedelta(days=45 + 30 * k)
        if T - timedelta(days=60) < h.start:
            break
        w0, w1 = T + timedelta(days=30), T + timedelta(days=45)
        for mid, info in h.members.items():
            if info.created > T:
                continue
            tramos = h.stints.get(mid, [])
            if not any(s.start <= T and s.end >= T - timedelta(days=30) for s in tramos):
                continue
            siguio = any(s.start <= w1 and s.end >= w0 for s in tramos) or _between(h.visits.get(mid, []), w0 - timedelta(days=1), w1) > 0
            X.append(features_at(h, mid, T))
            y.append(0 if siguio else 1)
            snap.append(k)
    return X, y, snap


def current_matrix(h: History) -> tuple[list, list]:
    ids = [mid for mid, info in h.members.items() if info.active and h.stints.get(mid)]
    return ids, [features_at(h, mid, h.today) for mid in ids]


def current_stint(h: History, mid) -> Stint | None:
    tramos = h.stints.get(mid, [])
    vigentes = [s for s in tramos if s.start <= h.today <= s.end]
    if vigentes:
        return vigentes[-1]
    return max(tramos, key=lambda s: s.end) if tramos else None


def segment_matrix(h: History) -> tuple[list, list]:
    """Socios activos con algo de historia: recencia, frecuencia, gasto, antigüedad, horario."""
    hoy = h.today
    horas_todas = [hr for lst in h.hours.values() for d, hr in lst if d > hoy - timedelta(days=90)]
    hora_media = sum(horas_todas) / len(horas_todas) if horas_todas else 12.0
    ids, filas = [], []
    for mid, info in h.members.items():
        if not info.active:
            continue
        fechas = h.visits.get(mid, [])
        tramos = h.stints.get(mid, [])
        if not fechas and not tramos:
            continue
        ultima = fechas[-1] if fechas else None
        horas = [hr for d, hr in h.hours.get(mid, []) if d > hoy - timedelta(days=90)]
        inicio = min([info.created] + [s.start for s in tramos])
        filas.append([
            float(min((hoy - ultima).days, NEVER)) if ultima else float(NEVER),
            float(_between(fechas, hoy - timedelta(days=90), hoy)),
            sum(m for d, m in h.paid.get(mid, []) if d > hoy - timedelta(days=180)),
            float(max((hoy - inicio).days, 0)),
            sum(horas) / len(horas) if horas else hora_media,
        ])
        ids.append(mid)
    return ids, filas


def daily_arrays(h: History, since: date, until: date) -> tuple[list[date], list[float], list[int]]:
    """Serie diaria [since, until) con ceros donde no hubo movimiento."""
    dias, ingresos, entradas = [], [], []
    d = since
    while d < until:
        dias.append(d)
        ingresos.append(h.daily_revenue.get(d, 0.0))
        entradas.append(h.daily_checkins.get(d, 0))
        d += timedelta(days=1)
    return dias, ingresos, entradas


async def revenue_series(db: AsyncSession, today: date, days: int = 365) -> list[float]:
    """Ingresos diarios desde el primer pago (máximo `days`) hasta ayer."""
    desde, _ = utc_day_bounds(today - timedelta(days=days))
    hasta, _ = utc_day_bounds(today)
    por_dia: dict[date, float] = {}
    for ts, amount in (await db.execute(
        select(Payment.created_at, net_amount())
        .where(Payment.status == PaymentStatus.paid, Payment.created_at >= desde, Payment.created_at < hasta)
    )).all():
        d = _to_bogota(ts).date()
        por_dia[d] = por_dia.get(d, 0.0) + float(amount or 0)
    if not por_dia:
        return []
    d, serie = min(por_dia), []
    while d < today:
        serie.append(por_dia.get(d, 0.0))
        d += timedelta(days=1)
    return serie


def pricing_rows(h: History) -> list[dict]:
    """Membresías ya terminadas y si el socio renovó dentro de los 30 días siguientes."""
    filas = []
    limite = h.today - timedelta(days=15)
    for tramos in h.stints.values():
        for s in tramos:
            if s.end > limite or s.price <= 0:
                continue
            renovo = any(o is not s and o.start > s.start and s.end - timedelta(days=7) <= o.start <= s.end + timedelta(days=30) for o in tramos)
            filas.append({"plan_name": s.plan_name, "price": s.price, "renewed": renovo})
    return filas


def local_visits(h: History) -> list[datetime]:
    return h.visit_times
