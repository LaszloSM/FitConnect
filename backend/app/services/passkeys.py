"""Llaves de acceso (passkeys / WebAuthn) como segundo paso del personal.

La llave vive en el equipo de la persona (huella, rostro o PIN del celular o
del computador) y nunca sale de ahí: el servidor solo guarda la parte pública.
El "desafío" de cada registro o ingreso se guarda en Redis 5 minutos y sirve
una sola vez.
"""
from __future__ import annotations

import json
from urllib.parse import urlparse

from fastapi import HTTPException
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import settings
from app.services import account_security

CHALLENGE_SECONDS = 300


def rp_id() -> str:
    return settings.webauthn_rp_id or urlparse(settings.frontend_url).hostname or "localhost"


def origins() -> list[str]:
    parsed = urlparse(settings.frontend_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    return [base, *settings.webauthn_extra_origins]


async def _remember(kind: str, staff_id, challenge: bytes) -> None:
    try:
        await account_security._redis().setex(f"webauthn:{kind}:{staff_id}", CHALLENGE_SECONDS,
                                              bytes_to_base64url(challenge))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail="No se pudo iniciar la llave de acceso. Intenta de nuevo.") from exc


async def _take(kind: str, staff_id) -> bytes:
    redis = account_security._redis()
    key = f"webauthn:{kind}:{staff_id}"
    try:
        raw = await redis.get(key)
        await redis.delete(key)
    except Exception:  # noqa: BLE001
        raw = None
    if not raw:
        raise HTTPException(status_code=400, detail="La solicitud de la llave venció. Vuelve a intentarlo.")
    return base64url_to_bytes(raw.decode() if isinstance(raw, bytes) else raw)


async def registration_options(staff, existing: list[str]) -> dict:
    options = generate_registration_options(
        rp_id=rp_id(),
        rp_name="LSMFit",
        user_id=staff.id.bytes,
        user_name=staff.email,
        user_display_name=staff.full_name,
        exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(c)) for c in existing],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    await _remember("reg", staff.id, options.challenge)
    return json.loads(options_to_json(options))


async def verify_registration(staff, credential: dict) -> dict:
    challenge = await _take("reg", staff.id)
    try:
        verified = verify_registration_response(
            credential=credential, expected_challenge=challenge, expected_rp_id=rp_id(),
            expected_origin=origins(), require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001 — la librería lanza varias clases
        raise HTTPException(status_code=400, detail="No se pudo registrar la llave. Intenta de nuevo.") from exc
    transports = (credential.get("response") or {}).get("transports")
    return {
        "credential_id": bytes_to_base64url(verified.credential_id),
        "public_key": bytes_to_base64url(verified.credential_public_key),
        "sign_count": verified.sign_count,
        "transports": transports if isinstance(transports, list) else None,
    }


async def authentication_options(staff_id, credentials: list[tuple[str, list | None]]) -> dict:
    options = generate_authentication_options(
        rp_id=rp_id(),
        allow_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(cid)) for cid, _ in credentials],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    await _remember("auth", staff_id, options.challenge)
    return json.loads(options_to_json(options))


async def verify_authentication(staff_id, credential: dict, public_key: str, sign_count: int) -> int:
    """Devuelve el contador nuevo. Lanza 401 si la firma no es válida."""
    challenge = await _take("auth", staff_id)
    try:
        verified = verify_authentication_response(
            credential=credential, expected_challenge=challenge, expected_rp_id=rp_id(),
            expected_origin=origins(), credential_public_key=base64url_to_bytes(public_key),
            credential_current_sign_count=sign_count, require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="La llave de acceso no se pudo verificar.") from exc
    return verified.new_sign_count
