from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.tenant.gym_settings import GymSettings

# Campos secretos cifrados en reposo con Fernet.
_SECRET_FIELDS = (
    "wompi_private_key",
    "wompi_events_secret",
    "wompi_integrity_secret",
    "whatsapp_access_token",
)


async def get_gym_settings(db: AsyncSession) -> GymSettings:
    """Devuelve la fila única de configuración del gym, creándola con
    defaults si el tenant aún no la tiene."""
    row = (await db.execute(select(GymSettings).limit(1))).scalar_one_or_none()
    if row is None:
        row = GymSettings()
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def secret(gym: GymSettings, field: str) -> str | None:
    """Lee y descifra un campo secreto de gym_settings."""
    return decrypt_secret(getattr(gym, field, None))


def set_secret(gym: GymSettings, field: str, value: str | None) -> None:
    """Cifra y asigna un campo secreto (no hace commit)."""
    if field not in _SECRET_FIELDS:
        raise ValueError(f"{field} no es un campo secreto")
    setattr(gym, field, encrypt_secret(value))
