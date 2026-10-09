"""Envío de correos transaccionales (recuperar contraseña, avisos de la suscripción).

Producción: Amazon SES con el remitente `SES_FROM_EMAIL` (dominio verificado en
SES). Sin remitente configurado (desarrollo, pruebas) el correo se registra en
el log y queda en `OUTBOX` para que las pruebas lo lean.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class Mail:
    to: str
    subject: str
    text: str


OUTBOX: list[Mail] = []


def _send_ses(mail: Mail) -> None:
    import boto3
    boto3.client("ses", region_name=settings.s3_region or "us-east-1").send_email(
        Source=settings.ses_from_email,
        Destination={"ToAddresses": [mail.to]},
        Message={"Subject": {"Data": mail.subject, "Charset": "UTF-8"},
                 "Body": {"Text": {"Data": mail.text, "Charset": "UTF-8"}}},
    )


async def send(to: str, subject: str, text: str) -> bool:
    mail = Mail(to=to, subject=subject, text=text)
    if not settings.ses_from_email:
        OUTBOX.append(mail)
        logger.info("Correo (sin SES configurado) a %s: %s", to, subject)
        return False
    try:
        await asyncio.to_thread(_send_ses, mail)
        return True
    except Exception:
        logger.exception("No se pudo enviar el correo a %s", to)
        return False
