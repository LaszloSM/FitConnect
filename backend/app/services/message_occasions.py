"""Las ocasiones en las que el gym le escribe a un socio — un solo registro.

Antes había DOS catálogos paralelos que nadie reconciliaba: `CATALOG`, con el
texto editable y claves tipo `membership_expiring`, y `TEMPLATES`, con los
nombres de plantilla de Meta y claves tipo `membership.expiring`. El dueño
editaba el texto, lo guardaba, y el socio recibía otra cosa: en 4 de las 6
ocasiones el cuerpo editable no se leía en ningún sitio.

Ahora la ocasión es la unidad: lleva su evento, su texto editable (que sí
gobierna la notificación in-app) y el nombre de la plantilla de WhatsApp.

Por qué siguen siendo dos cosas: en WhatsApp los mensajes proactivos los
aprueba Meta, así que el gym no puede inventar el texto que sale por ahí — solo
registrar el nombre de SU plantilla aprobada y qué variable va en cada
parámetro. El texto libre vive en lo in-app y en los anuncios.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Occasion:
    key: str
    event: str
    label: str
    description: str
    variables: list[str]
    default_body: str
    """Nombre sugerido de la plantilla en Meta. El gym puede cambiarlo por el suyo."""
    default_meta_template: str | None = None
    """Una ocasión sin plantilla de Meta solo genera notificación in-app."""
    whatsapp: bool = True
    tone: str = "info"
    extra: dict = field(default_factory=dict)


OCCASIONS: dict[str, Occasion] = {
    "membership_expiring": Occasion(
        key="membership_expiring",
        event="membership.expiring",
        label="Membresía por vencer",
        description="A 3 días del vencimiento y el mismo día.",
        variables=["nombre", "plan", "fecha", "link"],
        default_body="Hola {nombre} 👋 Tu plan {plan} vence el {fecha}. Renuévalo aquí: {link}",
        default_meta_template="recordatorio_vencimiento",
        tone="warning",
    ),
    "membership_overdue": Occasion(
        key="membership_overdue",
        event="membership.overdue",
        label="Membresía vencida",
        description="Tres días después del vencimiento, para recuperar cartera.",
        variables=["nombre", "plan", "fecha", "link"],
        default_body="Hola {nombre} 👋 Tu plan {plan} venció el {fecha}. Renuévalo y sigue entrenando: {link}",
        default_meta_template="recordatorio_vencido",
        tone="warning",
    ),
    "payment_confirmed": Occasion(
        key="payment_confirmed",
        event="payment.confirmed",
        label="Pago confirmado",
        description="Al confirmar un pago (recepción, Wompi o conciliación).",
        variables=["nombre", "plan", "fecha"],
        default_body="¡Gracias {nombre}! Confirmamos tu pago de {plan}. Tu membresía está activa. 💪",
        default_meta_template="confirmacion_pago",
        tone="success",
    ),
    "welcome": Occasion(
        key="welcome",
        event="member.welcome",
        label="Bienvenida",
        description="Cuando das de alta a un socio nuevo.",
        variables=["nombre", "gym"],
        default_body="¡Bienvenido a {gym}, {nombre}! 🎉 Nos alegra que entrenes con nosotros.",
        default_meta_template="bienvenida",
        tone="success",
    ),
    "birthday": Occasion(
        key="birthday",
        event="member.birthday",
        label="Cumpleaños",
        description="El día del cumpleaños del socio.",
        variables=["nombre", "gym"],
        default_body="¡Feliz cumpleaños, {nombre}! 🎂 De parte de todo el equipo de {gym}.",
        default_meta_template="cumpleanos",
        tone="success",
    ),
    "winback": Occasion(
        key="winback",
        event="member.winback",
        label="Te extrañamos",
        description="Socio con membresía vigente que no viene hace 21 días.",
        variables=["nombre", "gym"],
        default_body="Hola {nombre}, te extrañamos en {gym}. ¡Vuelve cuando quieras, te esperamos! 🏋️",
        default_meta_template="te_extranamos",
        tone="info",
    ),
    "maintenance_due": Occasion(
        key="maintenance_due",
        event="maintenance.due",
        label="Mantenimiento pendiente",
        description="Aviso interno: una máquina pasó su fecha de mantenimiento.",
        variables=["maquina", "dias"],
        default_body="La máquina {maquina} tiene el mantenimiento preventivo vencido.",
        whatsapp=False,  # es para el equipo, no para un socio
        tone="warning",
    ),
    "announcement": Occasion(
        key="announcement",
        event="announcement.sent",
        label="Anuncio",
        description="Mensaje que el gym escribe y envía a un grupo de socios.",
        variables=["nombre", "gym"],
        default_body="",
        default_meta_template="anuncio",
        tone="info",
    ),
}

#: event_type -> ocasión, para el camino inverso (outbox, historial).
BY_EVENT: dict[str, Occasion] = {o.event: o for o in OCCASIONS.values()}

#: Ocasiones que el dueño edita en la pantalla de Mensajes.
EDITABLE = [o for o in OCCASIONS.values() if o.key != "announcement"]

SAMPLE_VALUES = {
    "nombre": "María",
    "plan": "Mensual",
    "fecha": "30/06/2026",
    "link": "https://pago.fitconnect.co/abc",
    "gym": "Tu Gimnasio",
    "maquina": "Trotadora 3",
    "dias": "12",
}
