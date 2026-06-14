import logging

from datetime import timedelta

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import now_bogota, today_bogota
from app.db.master_session import master_engine
from app.models.master.tenant import Tenant
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.payment_link import PaymentLink
from app.services.gym_settings import get_gym_settings, secret
from app.services.job_monitor import record_end, record_start
from app.services.payment_confirmation import confirm_payment
from app.services.tenant_iterator import for_each_tenant
from app.services.wompi import WompiClient

logger = logging.getLogger(__name__)

# Locks globales en Master DB: evitan doble ejecución cuando hay más de una réplica
# corriendo el scheduler in-process. Una clave por job (los de intervalo también la
# necesitan: sin esto, N réplicas duplican WhatsApp y reconciliación).
_EXPIRE_LOCK_KEY = 815001
_RECONCILE_LOCK_KEY = 815002
_OUTBOX_LOCK_KEY = 815003


async def _run_with_advisory_lock(key: int, name: str, work) -> None:
    """Corre `work` (callable que devuelve un coroutine) solo si se obtiene el
    advisory lock en Master DB. Si otra réplica lo tiene, salta sin error.
    Registra la corrida en job_monitor para exponerla en /health."""
    run = record_start(name)
    async with master_engine.connect() as conn:
        got_lock = (await conn.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": key}
        )).scalar()
        if not got_lock:
            logger.info("%s: otra réplica tiene el lock, salto", name)
            record_end(run, "skipped")
            return
        try:
            await work()
            record_end(run, "ok")
        except Exception as e:  # noqa: BLE001
            logger.exception("%s falló", name)
            record_end(run, "error", str(e)[:200])
            raise
        finally:
            await conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})


async def _expire_tenant_memberships(session: AsyncSession, tenant: Tenant) -> None:
    result = await session.execute(
        update(Membership)
        .where(
            Membership.status == MembershipStatus.active.value,
            Membership.end_date < today_bogota(),
        )
        .values(status=MembershipStatus.expired.value, expired_at=now_bogota())
    )
    await session.commit()
    if result.rowcount:
        logger.info("Tenant %s: %d membresías expiradas", tenant.slug, result.rowcount)


async def _has_renewal_after(session: AsyncSession, membership: Membership) -> bool:
    """True si el miembro ya tiene otra membresía vigente/programada que arranca
    después de esta — ya renovó, no hay nada que recordarle."""
    renewal = (await session.execute(
        select(Membership.id).where(
            Membership.member_id == membership.member_id,
            Membership.id != membership.id,
            Membership.status.in_([MembershipStatus.active.value, MembershipStatus.frozen.value]),
            Membership.end_date > membership.end_date,
        ).limit(1)
    )).scalar_one_or_none()
    return renewal is not None


async def _renewal_checkout_url(session: AsyncSession, tenant: Tenant, membership: Membership, member_name: str) -> str | None:
    """Link Wompi de renovación para incluir en recordatorios. Reutiliza un link
    pendiente del mismo miembro+plan; None si Wompi no está configurado o el
    plan ya no existe. Un fallo de Wompi no tumba el job."""
    from decimal import Decimal
    from app.models.tenant.member_plan import MemberPlan
    from app.services.payment_links import create_payment_link_for

    gym = await get_gym_settings(session)
    if not (gym.wompi_public_key and secret(gym, "wompi_private_key")):
        return None
    if not membership.plan_id:
        return None
    plan = (await session.execute(
        select(MemberPlan).where(MemberPlan.id == membership.plan_id)
    )).scalar_one_or_none()
    if not plan or not plan.is_active:
        return None

    existing = (await session.execute(
        select(PaymentLink)
        .join(Payment, Payment.id == PaymentLink.payment_id)
        .where(
            Payment.member_id == membership.member_id,
            Payment.status == PaymentStatus.pending,
            PaymentLink.status == "created",
            PaymentLink.membership_intent["plan_id"].astext == str(plan.id),
        )
        .limit(1)
    )).scalar_one_or_none()
    if existing:
        return existing.checkout_url

    payment = Payment(
        member_id=membership.member_id,
        amount=Decimal(str(plan.price)),
        method=PaymentMethod.wompi,
        status=PaymentStatus.pending,
        concept=f"Renovación {plan.name}",
    )
    session.add(payment)
    await session.flush()
    try:
        link = await create_payment_link_for(
            session, payment, tenant.slug, member_name=member_name,
            membership_intent={"member_id": str(membership.member_id), "plan_id": str(plan.id)},
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("Tenant %s: no se pudo crear link Wompi para recordatorio: %s", tenant.slug, e)
        await session.delete(payment)
        return None
    return link.checkout_url


async def _emit_expiry_reminders(session: AsyncSession, tenant: Tenant) -> None:
    """Encola recordatorios de vencimiento a D-3, D-0 y vencida D+3 (idempotente
    por key). Si Wompi está configurado, incluye link de pago de renovación.
    No recuerda a quien ya tiene una renovación encadenada."""
    from app.models.tenant.member import Member
    from app.services.events import emit
    today = today_bogota()

    for days in (3, 0):
        target = today + timedelta(days=days)
        rows = (await session.execute(
            select(Membership, Member.full_name, Member.phone)
            .join(Member, Member.id == Membership.member_id)
            .where(
                Membership.status == MembershipStatus.active.value,
                Membership.end_date == target,
                Membership.start_date <= today,
            )
        )).all()
        for m, name, phone in rows:
            if await _has_renewal_after(session, m):
                continue
            link = await _renewal_checkout_url(session, tenant, m, name)
            label = "hoy" if days == 0 else f"en {days} días"
            pay_hint = link or "en recepción"
            await emit(
                session, "membership.expiring",
                idempotency_key=f"expiring:{m.id}:{m.end_date.isoformat()}:{days}",
                title="Membresía por vencer",
                message=f"La membresía de {name} ({m.plan_name}) vence {label} ({m.end_date.isoformat()}).",
                member_id=m.member_id, phone=phone,
                template_params=[name, m.plan_name, m.end_date.isoformat(), pay_hint],
            )

    # Vencida hace 3 días: el empujón que recupera cartera
    overdue_date = today - timedelta(days=3)
    rows = (await session.execute(
        select(Membership, Member.full_name, Member.phone)
        .join(Member, Member.id == Membership.member_id)
        .where(
            Membership.status.in_([MembershipStatus.active.value, MembershipStatus.expired.value]),
            Membership.end_date == overdue_date,
        )
    )).all()
    for m, name, phone in rows:
        if await _has_renewal_after(session, m):
            continue
        link = await _renewal_checkout_url(session, tenant, m, name)
        pay_hint = link or "en recepción"
        await emit(
            session, "membership.overdue",
            idempotency_key=f"overdue:{m.id}:{m.end_date.isoformat()}",
            title="Membresía vencida",
            message=f"La membresía de {name} ({m.plan_name}) venció hace 3 días ({m.end_date.isoformat()}).",
            member_id=m.member_id, phone=phone,
            template_params=[name, m.plan_name, m.end_date.isoformat(), pay_hint],
        )
    await session.commit()


async def _emit_maintenance_alerts(session: AsyncSession, tenant: Tenant) -> None:
    """Alerta de mantenimiento preventivo vencido (idempotente por día)."""
    from app.models.tenant.machine import Machine
    from app.services.events import emit
    today = today_bogota()
    machines = (await session.execute(
        select(Machine).where(Machine.maintenance_interval_days.isnot(None))
    )).scalars().all()
    for machine in machines:
        if not machine.last_maintenance_date:
            due = today  # nunca se le hizo: vencido
        else:
            due = machine.last_maintenance_date + timedelta(days=machine.maintenance_interval_days)
        if due <= today:
            await emit(
                session, "maintenance.due",
                idempotency_key=f"maint:{machine.id}:{today.isoformat()}",
                title="Mantenimiento preventivo pendiente",
                message=f"La máquina {machine.name} tiene mantenimiento preventivo vencido.",
            )
    await session.commit()


async def _emit_birthday_greetings(session: AsyncSession, tenant: Tenant) -> None:
    """Saludo de cumpleaños del día con el mensaje que editó el dueño
    (idempotente por año). Engagement = retención."""
    from sqlalchemy import extract
    from app.models.tenant.member import Member, MemberStatus
    from app.services.events import emit
    from app.services.message_templates import CATALOG, get_body, render

    body = await get_body(session, "birthday")
    if not body:
        return
    today = today_bogota()
    gym = await get_gym_settings(session)
    gym_name = getattr(gym, "legal_name", None) or tenant.name
    rows = (await session.execute(
        select(Member).where(
            Member.status == MemberStatus.active,
            Member.birth_date.isnot(None),
            extract("month", Member.birth_date) == today.month,
            extract("day", Member.birth_date) == today.day,
        )
    )).scalars().all()
    variables = CATALOG["birthday"]["variables"]
    for m in rows:
        values = {"nombre": m.full_name.split(" ")[0], "gym": gym_name}
        await emit(
            session, "member.birthday",
            idempotency_key=f"birthday:{m.id}:{today.year}",
            title="Cumpleaños", message=render(body, values),
            member_id=m.id, phone=m.phone,
            template_params=[values.get(v, "") for v in variables],
        )
    await session.commit()


async def _emit_winback(session: AsyncSession, tenant: Tenant) -> None:
    """Win-back: socio activo con membresía vigente que no viene hace 21 días.
    Una sola vez por 'ausencia' (idempotencia por su último check-in)."""
    from sqlalchemy import func
    from app.core.timeutil import utcnow_naive
    from app.models.tenant.member import Member, MemberStatus
    from app.models.tenant.checkin import CheckIn
    from app.services.events import emit
    from app.services.message_templates import CATALOG, get_body, render

    body = await get_body(session, "winback")
    if not body:
        return
    today = today_bogota()
    # checkins.created_at es UTC naive: el cutoff debe ser naive (no aware).
    cutoff = utcnow_naive() - timedelta(days=21)
    gym = await get_gym_settings(session)
    gym_name = getattr(gym, "legal_name", None) or tenant.name

    with_membership = (
        select(Membership.member_id).where(
            Membership.status == MembershipStatus.active.value,
            Membership.end_date >= today,
        ).distinct().scalar_subquery()
    )
    recent = select(CheckIn.member_id).where(CheckIn.created_at >= cutoff).distinct().scalar_subquery()
    rows = (await session.execute(
        select(Member).where(
            Member.status == MemberStatus.active,
            Member.id.in_(with_membership),
            Member.id.not_in(recent),
        )
    )).scalars().all()
    if not rows:
        return
    ids = [m.id for m in rows]
    last_map = {
        r[0]: r[1]
        for r in (await session.execute(
            select(CheckIn.member_id, func.max(CheckIn.created_at))
            .where(CheckIn.member_id.in_(ids)).group_by(CheckIn.member_id)
        )).all()
    }
    variables = CATALOG["winback"]["variables"]
    for m in rows:
        last = last_map.get(m.id)
        episode = last.date().isoformat() if last else "never"
        values = {"nombre": m.full_name.split(" ")[0], "gym": gym_name}
        await emit(
            session, "member.winback",
            idempotency_key=f"winback:{m.id}:{episode}",
            title="Te extrañamos", message=render(body, values),
            member_id=m.id, phone=m.phone,
            template_params=[values.get(v, "") for v in variables],
        )
    await session.commit()


async def _daily_tenant_tasks(session: AsyncSession, tenant: Tenant) -> None:
    from app.services.class_sessions import materialize_sessions
    await _expire_tenant_memberships(session, tenant)
    await materialize_sessions(session, horizon_days=14)
    await _emit_expiry_reminders(session, tenant)
    await _emit_maintenance_alerts(session, tenant)
    await _emit_birthday_greetings(session, tenant)
    await _emit_winback(session, tenant)


async def expire_memberships_job() -> None:
    """Job diario: expira membresías vencidas y genera sesiones de clase futuras.
    Idempotente. Las congeladas no expiran."""
    await _run_with_advisory_lock(
        _EXPIRE_LOCK_KEY, "expire_memberships_job",
        lambda: for_each_tenant(_daily_tenant_tasks),
    )


async def _reconcile_tenant_payments(session: AsyncSession, tenant: Tenant) -> None:
    gym = await get_gym_settings(session)
    private_key = secret(gym, "wompi_private_key")
    if not private_key:
        return
    cutoff = now_bogota() - timedelta(days=7)
    pending_links = (await session.execute(
        select(PaymentLink)
        .join(Payment, Payment.id == PaymentLink.payment_id)
        .where(
            PaymentLink.status == "created",
            Payment.status == PaymentStatus.pending,
            PaymentLink.created_at >= cutoff.replace(tzinfo=None),
        )
    )).scalars().all()
    if not pending_links:
        return
    client = WompiClient(gym.wompi_public_key, private_key)
    for link in pending_links:
        tx = await client.find_transaction_by_reference(link.reference)
        if not tx:
            continue
        status = tx.get("status")
        if status == "APPROVED":
            await confirm_payment(session, link.payment_id, tx.get("id"))
            link.status = "paid"
        elif status in ("DECLINED", "ERROR"):
            await session.execute(
                update(Payment).where(
                    Payment.id == link.payment_id, Payment.status == PaymentStatus.pending
                ).values(status=PaymentStatus.failed)
            )
    await session.commit()


async def reconcile_payments_job() -> None:
    """Red de seguridad si se pierde un webhook: consulta Wompi por links
    pendientes recientes y aplica la misma transición que el webhook."""
    await _run_with_advisory_lock(
        _RECONCILE_LOCK_KEY, "reconcile_payments_job",
        lambda: for_each_tenant(_reconcile_tenant_payments),
    )


async def _process_tenant_outbox(session: AsyncSession, tenant: Tenant) -> None:
    from app.models.tenant.notification_outbox import NotificationOutbox
    from app.services.whatsapp import send_template
    gym = await get_gym_settings(session)
    wa_phone = gym.whatsapp_phone_number_id
    wa_token = secret(gym, "whatsapp_access_token")

    pending = (await session.execute(
        select(NotificationOutbox)
        .where(
            NotificationOutbox.channel == "whatsapp",
            NotificationOutbox.status == "pending",
            NotificationOutbox.scheduled_for <= now_bogota(),
        )
        .limit(50)
    )).scalars().all()
    for item in pending:
        if not wa_phone or not wa_token:
            item.status = "skipped"
            item.last_error = "WhatsApp no configurado"
            continue
        try:
            params = (item.template_params or {}).get("params", [])
            await send_template(
                phone_number_id=wa_phone, access_token=wa_token,
                to=item.recipient_phone, template_name=item.template_name, params=params,
            )
            item.status = "sent"
            item.sent_at = now_bogota()
        except Exception as e:  # noqa: BLE001
            item.attempts += 1
            item.last_error = str(e)[:500]
            if item.attempts >= 3:
                item.status = "failed"
    await session.commit()


async def process_outbox_job() -> None:
    """Procesa la cola de WhatsApp con backoff (3 intentos)."""
    await _run_with_advisory_lock(
        _OUTBOX_LOCK_KEY, "process_outbox_job",
        lambda: for_each_tenant(_process_tenant_outbox),
    )


# Registro de jobs invocables manualmente (endpoint dev /admin/run-job/{name})
JOBS = {
    "expire_memberships": expire_memberships_job,
    "reconcile_payments": reconcile_payments_job,
    "process_outbox": process_outbox_job,
}
