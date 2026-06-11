import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    key = settings.settings_encryption_key
    if not key:
        # Fallback derivado de secret_key para entornos de desarrollo sin la env var.
        # En producción definir SETTINGS_ENCRYPTION_KEY explícitamente.
        digest = hashlib.sha256(settings.secret_key.encode()).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plaintext: str | None) -> str | None:
    if not plaintext:
        return plaintext
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str | None) -> str | None:
    if not ciphertext:
        return ciphertext
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        # Valor guardado en claro antes de habilitar cifrado: devolver tal cual.
        return ciphertext
