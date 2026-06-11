from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import now_bogota
from app.models.tenant.notification import Notification
from app.models.tenant.notification_outbox import NotificationOutbox
from app.services.gym_settings import get_gym_settings
from app.services.whatsapp import TEMPLATES, normalize_phone


async def emit(
    db: AsyncSession,
    event_type: str,
    *,
    idempotency_key: str,
    title: str,
    message: str,
    member_id=None,
    phone: str | None = None,
    template_params: list[str] | None = None,
) -> None:
    """Encola una notificación. Siempre crea la in-app; si el gym tiene WhatsApp
    configurado y hay teléfono + plantilla, encola también el envío externo.
    idempotency_key evita duplicados (ON CONFLICT DO NOTHING)."""
    # In-app (modelo Notification existente) — idempotencia por outbox key.
    inapp_key = f"inapp:{idempotency_key}"
    exists = (await db.execute(
        select(NotificationOutbox).where(NotificationOutbox.idempotency_key == inapp_key)
    )).scalar_one_or_none()
    if not exists:
        db.add(Notification(title=title, message=message, type=event_type, member_id=member_id))
        await db.execute(
            pg_insert(NotificationOutbox)
            .values(
                event_type=event_type, channel="in_app", member_id=member_id,
                status="sent", idempotency_key=inapp_key, scheduled_for=now_bogota(),
                sent_at=now_bogota(),
            )
            .on_conflict_do_nothing(index_elements=["idempotency_key"])
        )

    gym = await get_gym_settings(db)
    template = TEMPLATES.get(event_type)
    e164 = normalize_phone(phone)
    if gym.whatsapp_phone_number_id and gym.whatsapp_access_token and template and e164:
        await db.execute(
            pg_insert(NotificationOutbox)
            .values(
                event_type=event_type, channel="whatsapp", recipient_phone=e164,
                member_id=member_id, template_name=template,
                template_params={"params": template_params or []},
                status="pending", idempotency_key=f"wa:{idempotency_key}",
                scheduled_for=now_bogota(),
            )
            .on_conflict_do_nothing(index_elements=["idempotency_key"])
        )
