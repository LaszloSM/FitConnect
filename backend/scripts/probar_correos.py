"""Envía una muestra de cada correo de LSMFit para revisarlos en una bandeja real.

    # Contra Mailpit (desarrollo): los ves en http://localhost:8025
    MAIL_BACKEND=smtp SMTP_HOST=localhost python scripts/probar_correos.py --to tu@correo.com

    # Contra SES (producción): llegan de verdad
    MAIL_BACKEND=ses SES_FROM_EMAIL=no-responder@tudominio.co python scripts/probar_correos.py --to tu@correo.com

Sale con código 1 si algún correo no se pudo enviar.
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.services import emails, mailer  # noqa: E402


def samples(to: str):
    base = settings.frontend_url.rstrip("/")
    return [
        emails.password_reset(f"{base}/restablecer?token=muestra", 60, "Ana Pérez"),
        emails.staff_invite(f"{base}/aceptar-invitacion?token=muestra", "Gimnasio Demo", "recepción", 48, "Laura Gómez"),
        emails.mfa_email_code("482913", 10, "Ana Pérez"),
        emails.security_code("771204", 10, "cambiar tu contraseña", "Ana Pérez"),
        emails.security_notice("password_changed", "Ana Pérez"),
        emails.security_notice("mfa_enabled", "Ana Pérez", "Método: aplicación autenticadora."),
        emails.profile_link("ANA PEREZ", "Gimnasio Demo", f"{base}/completar/demo/muestra", 7),
        emails.member_app_welcome("Ana Pérez", "Gimnasio Demo", to, "K7MP-29QX", 48),
        emails.app_login_code("305718", 10),
        emails.subscription_extended("Ana Pérez", "Gimnasio Demo", "10/12/2026", "comp", "Gimnasio piloto"),
    ]


async def main(to: str) -> int:
    print(f"Enviando con el backend '{mailer.backend()}' a {to}")
    failed = 0
    for email in samples(to):
        ok = await mailer.send_email(to, email)
        failed += not ok
        print(("  OK    " if ok else "  FALLÓ ") + email.subject)
    return 1 if failed else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", required=True)
    sys.exit(asyncio.run(main(ap.parse_args().to)))
