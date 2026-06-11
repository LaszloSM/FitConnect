import logging

from datetime import timedelta

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import now_bogota, today_bogota
from app.db.master_session import master_engine
from app.models.master.tenant import Tenant
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.payment import Payment, PaymentStatus
from app.models.tenant.payment_link import PaymentLink
from app.services.gym_settings import get_gym_settings, secret
from app.services.payment_confirmation import confirm_payment
from app.services.tenant_iterator import for_each_tenant
from app.services.wompi import WompiClient

logger = logging.getLogger(__name__)

# Lock global en Master DB: evita doble ejecución si algún día hay más de un worker
_EXPIRE_LOCK_KEY = 815001


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


async def _emit_expiry_reminders(session: AsyncSession, tenant: Tenant) -> None:
    """Encola recordatorios de vencimiento a D-3 y D-0 (idempotente por key)."""
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
            )
        )).all()
        for m, name, phone in rows:
            label = "hoy" if days == 0 else f"en {days} días"
            await emit(
                session, "membership.expiring",
                idempotency_key=f"expiring:{m.id}:{m.end_date.isoformat()}:{days}",
                title="Membresía por vencer",
                message=f"La membresía de {name} ({m.plan_name}) vence {label} ({m.end_date.isoformat()}).",
                member_id=m.member_id, phone=phone,
                template_params=[name, m.plan_name, m.end_date.isoformat()],
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


async def _daily_tenant_tasks(session: AsyncSession, tenant: Tenant) -> None:
    from app.services.class_sessions import materialize_sessions
    await _expire_tenant_memberships(session, tenant)
    await materialize_sessions(session, horizon_days=14)
    await _emit_expiry_reminders(session, tenant)
    await _emit_maintenance_alerts(session, tenant)


async def expire_memberships_job() -> None:
    """Job diario: expira membresías vencidas y genera sesiones de clase futuras.
    Idempotente. Las congeladas no expiran."""
    async with master_engine.connect() as conn:
        got_lock = (await conn.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": _EXPIRE_LOCK_KEY}
        )).scalar()
        if not got_lock:
            logger.info("expire_memberships_job: otro worker tiene el lock, salto")
            return
        try:
            await for_each_tenant(_daily_tenant_tasks)
        finally:
            await conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _EXPIRE_LOCK_KEY})


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
    await for_each_tenant(_reconcile_tenant_payments)


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
    await for_each_tenant(_process_tenant_outbox)


# Registro de jobs invocables manualmente (endpoint dev /admin/run-job/{name})
JOBS = {
    "expire_memberships": expire_memberships_job,
    "reconcile_payments": reconcile_payments_job,
    "process_outbox": process_outbox_job,
}
