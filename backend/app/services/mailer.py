"""Envío de correos transaccionales.

Tres formas de enviar, según `MAIL_BACKEND`:
- `ses`: Amazon SES con el remitente `SES_FROM_EMAIL` (verificado en SES).
- `smtp`: cualquier servidor SMTP. En desarrollo apunta a Mailpit
  (http://localhost:8025), donde se ven los correos tal como llegan.
- `log`: no sale nada; el correo queda en `OUTBOX` y en el log. Es lo que usan
  las pruebas.
`auto` (por defecto) elige `ses` si hay remitente y `log` si no.

`send()` devuelve True solo si el correo quedó en manos del proveedor (o en el
OUTBOX fuera de producción). Quien llama debe respetarlo: decir "enviado"
cuando no salió es peor que decir que falló.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings
from app.services.email_templates import Email, Rendered, render

logger = logging.getLogger(__name__)


@dataclass
class Mail:
    to: str
    subject: str
    text: str
    html: str | None = None
    from_name: str = "LSMFit"
    reply_to: str | None = None


OUTBOX: list[Mail] = []
OUTBOX_MAX = 500


def backend() -> str:
    chosen = settings.mail_backend
    if chosen == "auto":
        return "ses" if settings.ses_from_email else "log"
    return chosen


def configured() -> bool:
    """¿Los correos salen de verdad? (para /health y el panel de plataforma)."""
    b = backend()
    return (b == "ses" and bool(settings.ses_from_email)) or (b == "smtp" and bool(settings.smtp_host))


def _from_address() -> str:
    return settings.ses_from_email or settings.smtp_from or "no-responder@localhost"


def _send_ses(mail: Mail) -> None:
    import boto3
    body = {"Text": {"Data": mail.text, "Charset": "UTF-8"}}
    if mail.html:
        body["Html"] = {"Data": mail.html, "Charset": "UTF-8"}
    kwargs = {}
    if mail.reply_to:
        kwargs["ReplyToAddresses"] = [mail.reply_to]
    boto3.client("ses", region_name=settings.ses_region or settings.s3_region or "us-east-1").send_email(
        Source=formataddr((mail.from_name, _from_address())),
        Destination={"ToAddresses": [mail.to]},
        Message={"Subject": {"Data": mail.subject, "Charset": "UTF-8"}, "Body": body},
        **kwargs,
    )


def _send_smtp(mail: Mail) -> None:
    msg = EmailMessage()
    msg["Subject"] = mail.subject
    msg["From"] = formataddr((mail.from_name, _from_address()))
    msg["To"] = mail.to
    if mail.reply_to:
        msg["Reply-To"] = mail.reply_to
    msg.set_content(mail.text)
    if mail.html:
        msg.add_alternative(mail.html, subtype="html")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_tls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


def _keep(mail: Mail) -> None:
    OUTBOX.append(mail)
    del OUTBOX[:-OUTBOX_MAX]


async def deliver(mail: Mail) -> bool:
    b = backend()
    if b == "log":
        _keep(mail)
        logger.info("Correo (sin envío real) a %s: %s", mail.to, mail.subject)
        if settings.environment == "production":
            logger.error("MAIL_BACKEND sin configurar en producción: el correo a %s NO salió", mail.to)
            return False
        return True
    try:
        await asyncio.to_thread(_send_ses if b == "ses" else _send_smtp, mail)
        if settings.environment != "production":
            _keep(mail)
        return True
    except Exception:
        logger.exception("No se pudo enviar el correo a %s", mail.to)
        return False


async def send(to: str, subject: str, text: str, html: str | None = None, *,
               from_name: str = "LSMFit", reply_to: str | None = None) -> bool:
    return await deliver(Mail(to=to, subject=subject, text=text, html=html, from_name=from_name, reply_to=reply_to))


async def send_email(to: str, email: Email | Rendered, *, reply_to: str | None = None) -> bool:
    """Envía una plantilla. Los correos de un gimnasio salen como "Gym vía LSMFit"."""
    gym_name = email.gym_name if isinstance(email, Email) else None
    rendered = render(email) if isinstance(email, Email) else email
    from_name = f"{gym_name} vía LSMFit" if gym_name else "LSMFit"
    return await send(to, rendered.subject, rendered.text, rendered.html, from_name=from_name, reply_to=reply_to)
