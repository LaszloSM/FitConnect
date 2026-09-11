"""Encolado de notificaciones: una ocasión entra, in-app y WhatsApp salen.

El cambio de fondo respecto a antes: el cuerpo que el dueño edita en la pantalla
de Mensajes es el que se guarda como notificación in-app, para TODAS las
ocasiones. Antes solo lo leían cumpleaños y win-back; en las otras cuatro el
dueño editaba un texto que no llegaba a ninguna parte.
"""
import logging

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import now_bogota
from app.models.tenant.notification import Notification
from app.models.tenant.notification_outbox import NotificationOutbox
from app.services.gym_settings import get_gym_settings
from app.services.message_occasions import OCCASIONS, Occasion
from app.services.message_templates import render, resolve
from app.services.whatsapp import normalize_phone

logger = logging.getLogger(__name__)


async def emit_occasion(
    db: AsyncSession,
    occasion: str,
    *,
    idempotency_key: str,
    values: dict[str, str],
    member_id=None,
    phone: str | None = None,
    fallback_message: str | None = None,
) -> None:
    """Notifica una ocasión del catálogo con el texto que el gym editó.

    `values` son las variables de la ocasión: se usan tanto para renderizar el
    cuerpo in-app como para los parámetros posicionales de la plantilla de
    WhatsApp, en el orden que declara la ocasión.
    """
    occ = OCCASIONS.get(occasion)
    if occ is None:
        raise ValueError(f"Ocasión desconocida: {occasion}")

    body, meta_template = await resolve(db, occ)
    if body is None:
        return  # el gym apagó esta ocasión

    message = render(body, values) if body else (fallback_message or occ.label)
    await _enqueue(
        db, occ,
        idempotency_key=idempotency_key,
        title=occ.label,
        message=message,
        member_id=member_id,
        phone=phone,
        meta_template=meta_template if occ.whatsapp else None,
        params=[values.get(v, "") for v in occ.variables],
    )


async def try_emit_occasion(db: AsyncSession, occasion: str, **kwargs) -> None:
    """Emite sin poder tumbar la operación que la disparó.

    Dar de alta un socio y confirmar un pago son el camino crítico; el saludo no.
    Si el render revienta o falta un dato, se registra y se sigue. Un fallo de
    base de datos sí deja la transacción abortada aguas arriba: esto cubre los
    errores de Python, que son los que se ven en la práctica.
    """
    try:
        await emit_occasion(db, occasion, **kwargs)
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo emitir la ocasión %s", occasion)


async def emit_announcement(
    db: AsyncSession,
    *,
    idempotency_key: str,
    title: str,
    message: str,
    member_id=None,
    phone: str | None = None,
    meta_template: str | None = None,
    params: list[str] | None = None,
) -> None:
    """Anuncio escrito por el gym: el texto es suyo, no sale del catálogo."""
    occ = OCCASIONS["announcement"]
    await _enqueue(
        db, occ,
        idempotency_key=idempotency_key,
        title=title,
        message=message,
        member_id=member_id,
        phone=phone,
        meta_template=meta_template,
        params=params or [],
    )


async def _enqueue(
    db: AsyncSession,
    occ: Occasion,
    *,
    idempotency_key: str,
    title: str,
    message: str,
    member_id,
    phone: str | None,
    meta_template: str | None,
    params: list[str],
) -> None:
    # In-app: siempre. La fila de outbox es solo el registro de idempotencia.
    inapp_key = f"inapp:{idempotency_key}"
    exists = (await db.execute(
        select(NotificationOutbox.id).where(NotificationOutbox.idempotency_key == inapp_key).limit(1)
    )).scalar_one_or_none()
    if not exists:
        # `type` es el EVENTO, no el color: es dato, y por él se filtra el
        # historial. El tono es presentación y lo deriva la UI.
        db.add(Notification(title=title, message=message, type=occ.event, member_id=member_id))
        await db.execute(
            pg_insert(NotificationOutbox)
            .values(
                event_type=occ.event, channel="in_app", member_id=member_id,
                status="sent", idempotency_key=inapp_key, scheduled_for=now_bogota(),
                sent_at=now_bogota(),
            )
            .on_conflict_do_nothing(index_elements=["idempotency_key"])
        )

    if not occ.whatsapp or not meta_template:
        return

    gym = await get_gym_settings(db)
    if not (gym.whatsapp_phone_number_id and gym.whatsapp_access_token):
        return

    e164 = normalize_phone(phone)
    if not e164:
        # Antes esto se descartaba en silencio: el gym creía haber avisado a 300
        # socios y había avisado a 240. Ahora queda la fila con el motivo.
        await db.execute(
            pg_insert(NotificationOutbox)
            .values(
                event_type=occ.event, channel="whatsapp", recipient_phone=phone,
                member_id=member_id, template_name=meta_template,
                template_params={"params": params},
                status="skipped",
                last_error=(
                    "Sin teléfono registrado" if not phone
                    else f"Teléfono no utilizable para WhatsApp: {phone}"
                ),
                idempotency_key=f"wa:{idempotency_key}", scheduled_for=now_bogota(),
            )
            .on_conflict_do_nothing(index_elements=["idempotency_key"])
        )
        return

    await db.execute(
        pg_insert(NotificationOutbox)
        .values(
            event_type=occ.event, channel="whatsapp", recipient_phone=e164,
            member_id=member_id, template_name=meta_template,
            template_params={"params": params},
            status="pending", idempotency_key=f"wa:{idempotency_key}",
            scheduled_for=now_bogota(),
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
    )
