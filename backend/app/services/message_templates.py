"""El texto que el gym edita para cada ocasión.

El cuerpo editable gobierna de verdad la notificación in-app de TODAS las
ocasiones (antes solo lo leían cumpleaños y win-back), y `meta_template_name`
es el nombre de la plantilla que el gym tiene aprobada en su WhatsApp Business.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.message_template import MessageTemplate
from app.services.message_occasions import OCCASIONS, Occasion


async def get_or_seed_templates(db: AsyncSession) -> list[MessageTemplate]:
    """Templates del tenant, creando los faltantes con su default."""
    existing = {
        t.occasion: t
        for t in (await db.execute(select(MessageTemplate))).scalars().all()
    }
    created = False
    for key, occ in OCCASIONS.items():
        if key not in existing:
            t = MessageTemplate(
                occasion=key,
                body=occ.default_body,
                meta_template_name=occ.default_meta_template,
            )
            db.add(t)
            existing[key] = t
            created = True
    if created:
        await db.commit()
    return [existing[k] for k in OCCASIONS if k in existing]


async def get_template(db: AsyncSession, occasion: str) -> MessageTemplate | None:
    return (await db.execute(
        select(MessageTemplate).where(MessageTemplate.occasion == occasion)
    )).scalar_one_or_none()


async def resolve(db: AsyncSession, occ: Occasion) -> tuple[str | None, str | None]:
    """(cuerpo in-app, nombre de plantilla de WhatsApp) para una ocasión.

    Cuerpo `None` = la ocasión está apagada y no se notifica por ningún canal.
    Ese interruptor existía en el modelo y la UI nunca lo expuso.
    """
    t = await get_template(db, occ.key)
    if t is None:
        return occ.default_body, occ.default_meta_template
    if not t.is_active:
        return None, None
    return t.body, (t.meta_template_name or occ.default_meta_template)


def render(body: str, values: dict[str, str]) -> str:
    """Reemplaza {variable} con su valor; deja intactas las que no se conozcan."""
    out = body
    for key, val in values.items():
        out = out.replace("{" + key + "}", str(val))
    return out
