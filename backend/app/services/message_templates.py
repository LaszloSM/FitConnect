"""Catálogo de ocasiones de mensajes y defaults editables.

Cada gym arranca con un mensaje por ocasión que el dueño puede personalizar.
Las variables disponibles dependen de la ocasión y se reemplazan al enviar."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.message_template import MessageTemplate

# occasion -> (label, variables disponibles, cuerpo por defecto)
CATALOG: dict[str, dict] = {
    "membership_expiring": {
        "label": "Membresía por vencer",
        "variables": ["nombre", "plan", "fecha", "link"],
        "default": "Hola {nombre} 👋 Tu plan {plan} vence el {fecha}. Renuévalo aquí: {link}",
    },
    "membership_overdue": {
        "label": "Membresía vencida",
        "variables": ["nombre", "plan", "fecha", "link"],
        "default": "Hola {nombre} 👋 Tu plan {plan} venció el {fecha}. Renuévalo y sigue entrenando: {link}",
    },
    "payment_confirmed": {
        "label": "Pago confirmado",
        "variables": ["nombre", "plan", "fecha"],
        "default": "¡Gracias {nombre}! Confirmamos tu pago de {plan}. Tu membresía está activa. 💪",
    },
    "welcome": {
        "label": "Bienvenida",
        "variables": ["nombre", "gym"],
        "default": "¡Bienvenido a {gym}, {nombre}! 🎉 Nos alegra que entrenes con nosotros.",
    },
    "birthday": {
        "label": "Cumpleaños",
        "variables": ["nombre", "gym"],
        "default": "¡Feliz cumpleaños, {nombre}! 🎂 De parte de todo el equipo de {gym}.",
    },
    "winback": {
        "label": "Te extrañamos",
        "variables": ["nombre", "gym"],
        "default": "Hola {nombre}, te extrañamos en {gym}. ¡Vuelve cuando quieras, te esperamos! 🏋️",
    },
}


async def get_or_seed_templates(db: AsyncSession) -> list[MessageTemplate]:
    """Devuelve los templates del tenant, creando los faltantes con su default."""
    existing = {
        t.occasion: t
        for t in (await db.execute(select(MessageTemplate))).scalars().all()
    }
    created = False
    for occasion, meta in CATALOG.items():
        if occasion not in existing:
            t = MessageTemplate(occasion=occasion, body=meta["default"])
            db.add(t)
            existing[occasion] = t
            created = True
    if created:
        await db.commit()
    # Orden estable según el catálogo
    return [existing[o] for o in CATALOG if o in existing]


async def get_body(db: AsyncSession, occasion: str) -> str | None:
    """Cuerpo activo que el dueño guardó para una ocasión; default si no lo tocó;
    None si la ocasión está desactivada."""
    t = (await db.execute(
        select(MessageTemplate).where(MessageTemplate.occasion == occasion)
    )).scalar_one_or_none()
    if t is None:
        return CATALOG.get(occasion, {}).get("default")
    return t.body if t.is_active else None


def render(body: str, values: dict[str, str]) -> str:
    """Reemplaza {variable} con su valor; deja intactas las que no se conozcan."""
    out = body
    for key, val in values.items():
        out = out.replace("{" + key + "}", str(val))
    return out
