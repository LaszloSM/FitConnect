"""Crea (o reactiva) una cuenta del panel de plataforma. No hay registro público:
las cuentas solo nacen aquí, en el servidor.

    python scripts/create_platform_admin.py --email tu@correo.com --name "Tu Nombre"

Pide la contraseña sin mostrarla. La app autenticadora se configura en el
primer ingreso al panel (admin.<dominio>), con el código QR que muestra.

    --reset-2fa   borra la app autenticadora registrada (celular perdido)
"""
import argparse
import asyncio
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.master_session import MasterSessionLocal  # noqa: E402
from app.models.master.platform import PlatformAdmin, PlatformAuditLog  # noqa: E402


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--name", default="")
    ap.add_argument("--reset-2fa", action="store_true")
    args = ap.parse_args()
    email = args.email.strip().lower()

    async with MasterSessionLocal() as db:
        admin = (await db.execute(
            select(PlatformAdmin).where(func.lower(PlatformAdmin.email) == email)
        )).scalar_one_or_none()
        if admin and args.reset_2fa:
            admin.totp_enabled = False
            admin.totp_secret_enc = None
            admin.backup_codes = None
            db.add(PlatformAuditLog(admin_id=admin.id, admin_email=admin.email, action="auth.mfa_reset_console",
                                    details={}))
            await db.commit()
            print(f"Se borró la app autenticadora de {email}. En el próximo ingreso verá un QR nuevo.")
            return 0

        password = getpass.getpass("Contraseña (mínimo 12 caracteres): ")
        if len(password) < 12:
            print("La contraseña es muy corta.", file=sys.stderr)
            return 1
        if getpass.getpass("Repítela: ") != password:
            print("Las contraseñas no coinciden.", file=sys.stderr)
            return 1

        if admin is None:
            admin = PlatformAdmin(email=email, full_name=args.name or email, hashed_password=hash_password(password))
            db.add(admin)
            action = "admin.create_console"
        else:
            admin.hashed_password = hash_password(password)
            admin.is_active = True
            admin.failed_logins = 0
            admin.locked_until = None
            if args.name:
                admin.full_name = args.name
            action = "admin.password_console"
        await db.flush()
        db.add(PlatformAuditLog(admin_id=admin.id, admin_email=admin.email, action=action, details={}))
        await db.commit()
    print(f"Listo: {email}. Entra al panel y configura la app autenticadora.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
