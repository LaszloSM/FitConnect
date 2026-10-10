"""Catálogo de correos de LSMFit: un constructor por cada correo que sale.

Todos devuelven un `Email` que `mailer.send_email` renderiza. El texto está
escrito para quien lo recibe: sin términos técnicos, con una sola acción clara.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services.email_templates import Button, Code, Email, Note, P, Steps

BOGOTA = ZoneInfo("America/Bogota")


def _first_name(full_name: str | None) -> str:
    name = (full_name or "").strip().split(" ")[0]
    return name.title() if name else ""


def _hello(full_name: str | None) -> str:
    name = _first_name(full_name)
    return f"Hola, {name}" if name else "Hola"


def _when(at: datetime | None = None) -> str:
    at = (at or datetime.now(BOGOTA)).astimezone(BOGOTA)
    return at.strftime("%d/%m/%Y a las %H:%M")


# ─── Cuenta del gimnasio (dueño y equipo) ──────────────────────────────────

def password_reset(url: str, minutes: int, full_name: str | None = None) -> Email:
    return Email(
        subject="Restablece tu contraseña de LSMFit",
        heading="Restablece tu contraseña",
        preheader=f"El enlace vence en {minutes} minutos.",
        blocks=[
            P(f"{_hello(full_name)}. Recibimos una solicitud para cambiar la contraseña de tu cuenta de LSMFit."),
            Button("Crear una contraseña nueva", url),
            P(f"El enlace funciona una sola vez y vence en **{minutes} minutos**.", muted=True),
            Note("¿No fuiste tú? Ignora este correo: tu contraseña sigue igual y nadie puede entrar sin ella."),
        ],
    )


def staff_invite(url: str, gym_name: str, role_label: str, hours: int, invited_by: str | None = None) -> Email:
    who = f"{invited_by} te invitó" if invited_by else "Te invitaron"
    return Email(
        subject=f"Te invitaron al equipo de {gym_name} en LSMFit",
        heading=f"Únete al equipo de {gym_name}",
        preheader=f"Crea tu contraseña para entrar como {role_label}.",
        blocks=[
            P(f"Hola. {who} a trabajar en **{gym_name}** con el rol de **{role_label}**."),
            P("LSMFit es el sistema que usa el gimnasio para registrar entradas, cobros y socios. "
              "Para empezar solo tienes que crear tu contraseña."),
            Button("Crear mi contraseña", url),
            Steps([
                "Abre el botón de arriba y escribe una contraseña de al menos 8 caracteres.",
                "Entra con tu correo y esa contraseña desde cualquier computador o celular.",
                "Te recomendamos activar la verificación en dos pasos en **Ajustes › Seguridad**.",
            ]),
            P(f"La invitación vence en **{hours} horas**. Si vence, pídele al dueño del gimnasio una nueva.",
              muted=True),
        ],
        footer=f"Recibes este correo porque {gym_name} te invitó a su equipo en LSMFit.",
    )


def mfa_email_code(code: str, minutes: int, full_name: str | None = None) -> Email:
    return Email(
        subject=f"{code} es tu código de verificación de LSMFit",
        heading="Tu código de verificación",
        preheader=f"Vence en {minutes} minutos.",
        blocks=[
            P(f"{_hello(full_name)}. Escribe este código para terminar de entrar a LSMFit:"),
            Code(code, caption=f"Vence en {minutes} minutos"),
            Note("Si no estás intentando entrar, alguien conoce tu contraseña. Cámbiala ya en "
                 "**Ajustes › Seguridad** y no compartas este código con nadie."),
        ],
    )


def security_code(code: str, minutes: int, action: str, full_name: str | None = None) -> Email:
    """Código para confirmar una acción sensible (cambiar contraseña o correo, desactivar 2 pasos)."""
    return Email(
        subject=f"{code} es tu código para {action}",
        heading=f"Confirma que quieres {action}",
        preheader=f"Código de un solo uso. Vence en {minutes} minutos.",
        blocks=[
            P(f"{_hello(full_name)}. Para {action} en LSMFit escribe este código:"),
            Code(code, caption=f"Vence en {minutes} minutos"),
            Note("Si no lo pediste, no hagas nada: sin este código no se puede hacer el cambio. "
                 "Te recomendamos cambiar tu contraseña."),
        ],
    )


SECURITY_EVENTS = {
    "password_changed": ("Tu contraseña cambió", "La contraseña de tu cuenta de LSMFit se cambió"),
    "password_reset": ("Tu contraseña se restableció", "Se creó una contraseña nueva para tu cuenta de LSMFit"),
    "mfa_enabled": ("Activaste la verificación en dos pasos", "Activaste un método de verificación en dos pasos"),
    "mfa_disabled": ("Desactivaste la verificación en dos pasos", "Desactivaste un método de verificación en dos pasos"),
    "email_changed": ("Tu correo de acceso cambió", "El correo con el que entras a LSMFit cambió"),
    "passkey_added": ("Agregaste una llave de acceso", "Agregaste una llave de acceso (huella, rostro o PIN del equipo)"),
    "sessions_closed": ("Cerraste sesión en todos tus equipos", "Se cerró la sesión de tu cuenta en todos los equipos"),
}


def security_notice(event: str, full_name: str | None = None, detail: str | None = None) -> Email:
    title, sentence = SECURITY_EVENTS[event]
    blocks = [P(f"{_hello(full_name)}. {sentence} el {_when()} (hora de Colombia).")]
    if detail:
        blocks.append(P(detail))
    blocks += [
        Note("¿No fuiste tú? Restablece tu contraseña ahora desde la pantalla de ingreso "
             "(«¿Olvidaste tu contraseña?») y avísale al dueño del gimnasio."),
        P("Este aviso se envía siempre que cambia algo de la seguridad de tu cuenta. No tienes que responderlo.",
          muted=True),
    ]
    return Email(subject=f"Aviso de seguridad: {title.lower()}", heading=title, blocks=blocks)


# ─── Socios ────────────────────────────────────────────────────────────────

def profile_link(full_name: str | None, gym_name: str, url: str, days: int) -> Email:
    return Email(
        subject=f"{gym_name}: completa tus datos de socio",
        heading="Completa tus datos de socio",
        preheader="Toma unos 2 minutos. El enlace es personal.",
        gym_name=gym_name,
        blocks=[
            P(f"{_hello(full_name)}. En **{gym_name}** estamos actualizando la ficha de cada socio "
              "para atenderte mejor y avisarte a tiempo de tus vencimientos."),
            P("Solo tienes que revisar y completar lo que falta. Toma unos 2 minutos."),
            Button("Completar mis datos", url),
            P(f"El enlace es personal: no lo compartas. Vence en **{days} días**.", muted=True),
        ],
    )


def member_app_welcome(full_name: str | None, gym_name: str, email: str, code: str, hours: int) -> Email:
    android, ios = settings.member_app_android_url, settings.member_app_ios_url
    download = []
    if android:
        download.append(f"Android: {android}")
    if ios:
        download.append(f"iPhone: {ios}")
    get_app = ("Descarga la app **LSMFit** (" + " · ".join(download) + ")."
               if download else "Descarga la app **LSMFit** en tu celular.")
    return Email(
        subject=f"{gym_name} te invita a la app de socios",
        heading="Tu gimnasio, ahora en tu celular",
        preheader="Clases, rutinas, pagos y tu progreso en un solo lugar.",
        gym_name=gym_name,
        blocks=[
            P(f"{_hello(full_name)}. Ya eres socio de **{gym_name}** y tienes acceso a la app de socios: "
              "ves tu plan y su vencimiento, reservas clases, sigues tus rutinas y registras tu progreso."),
            Steps([
                get_app,
                f"Entra con este correo (**{email}**). Te llegará un código de 6 dígitos para confirmar que eres tú: "
                "no necesitas contraseña.",
                "Toca **Vincular mi gimnasio** y escribe este código y tu número de documento:",
            ]),
            Code(code, caption=f"Código para vincular tu cuenta · vence en {hours} horas"),
            P("Si el código vence, pídelo de nuevo en la recepción del gimnasio.", muted=True),
        ],
    )


def app_login_code(code: str, minutes: int) -> Email:
    return Email(
        subject=f"{code} es tu código de LSMFit",
        heading="Tu código para entrar",
        preheader=f"Vence en {minutes} minutos.",
        blocks=[
            P("Escribe este código en la app LSMFit para entrar:"),
            Code(code, caption=f"Vence en {minutes} minutos"),
            P("Si no lo pediste, ignora este correo: nadie puede entrar sin el código.", muted=True),
        ],
        footer="Recibes este correo porque alguien pidió entrar a la app LSMFit con esta dirección.",
    )


# ─── Plataforma → dueños de gimnasio ───────────────────────────────────────

def subscription_extended(owner_name: str | None, gym_name: str, until: str, kind: str, reason: str | None) -> Email:
    what = "días de prueba gratis" if kind == "trial" else "acceso de cortesía"
    blocks = [
        P(f"{_hello(owner_name)}. Te dimos {what} para **{gym_name}**: puedes usar LSMFit completo "
          f"hasta el **{until}** sin pagar nada."),
    ]
    if reason:
        blocks.append(P(f"Motivo: {reason}", muted=True))
    blocks += [
        Button("Entrar a LSMFit", f"{settings.frontend_url.rstrip('/')}/login"),
        P("Si tienes preguntas, responde este correo o escríbenos a lsmfit.business@gmail.com.", muted=True),
    ]
    return Email(subject=f"Tienes {what} en LSMFit hasta el {until}", heading=f"Disfruta LSMFit hasta el {until}",
                 blocks=blocks)
