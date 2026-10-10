"""Seguridad de la cuenta propia (Ajustes › Seguridad).

- Verificación en dos pasos: app autenticadora, código por correo, llaves de
  acceso y códigos de respaldo. Todo opcional y recomendado.
- Cambiar la contraseña: contraseña actual + un código (correo o app).
- Cambiar el correo de acceso: se confirma con un código enviado al correo nuevo.
- Cerrar sesión en todos los equipos.

Cada cambio deja un registro en la auditoría y un aviso por correo.
"""
import hashlib
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_staff, get_tenant_db_from_token, security
from app.api.v1.auth import _tokens_for
from app.core import totp
from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.rate_limit import limiter
from app.core.security import decode_token, hash_password, verify_password
from app.db.master_session import get_master_db
from app.models.master.owner import Owner
from app.models.master.staff_directory import StaffDirectory
from app.models.tenant.staff_passkey import StaffPasskey
from app.models.tenant.user_staff import UserStaff
from app.services import account_security, emails, mailer, mfa, passkeys
from app.services.audit import audit

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD = 8


# ─── Utilidades ────────────────────────────────────────────────────────────

def _role(staff: UserStaff) -> str:
    return staff.role.value if hasattr(staff.role, "value") else str(staff.role)


def _new_session(row: UserStaff, credentials: HTTPAuthorizationCredentials):
    """Sesión nueva para quien acaba de cambiar algo de su seguridad: la anterior
    queda inválida (cerrar las demás no debe sacar a quien hizo el cambio)."""
    claims = decode_token(credentials.credentials)
    kind = "owner" if claims.get("role") == "owner" and claims.get("tenant_id") else "staff"
    return claims, _tokens_for(row, kind=kind, db_name=claims["db_name"], tenant_id=claims.get("tenant_id"),
                               owner_id=claims.get("sub"))


async def _check_factor(row: UserStaff, method: str, code: str, purpose: str) -> bool:
    """Segundo factor para acciones sensibles: código de la app o del correo."""
    if method == "totp":
        return bool(row.totp_enabled) and totp.verify(decrypt_secret(row.totp_secret_enc) or "", code) \
            and await account_security.claim_code(f"staff:{row.id}", code)
    return await mfa.check_code(row.id, purpose, code)


def _fresh_backup_codes(row: UserStaff) -> list[str]:
    """Al activar el primer método se entregan códigos de respaldo (una sola vez)."""
    if row.backup_codes:
        return []
    codes = totp.new_backup_codes()
    row.backup_codes = [totp.hash_backup_code(c) for c in codes]
    return codes


def _after_disable(row: UserStaff) -> None:
    if not mfa.is_on(row):
        row.backup_codes = None
        row.mfa_preferred = None
    elif row.mfa_preferred not in mfa.methods(row):
        row.mfa_preferred = None


async def _notify(row: UserStaff, event: str, detail: str | None = None, to: str | None = None) -> None:
    await mailer.send_email(to or row.email, emails.security_notice(event, row.full_name, detail))


# ─── Estado ────────────────────────────────────────────────────────────────

@router.get("/mfa/status")
async def mfa_status(staff: UserStaff = Depends(get_current_staff), db: AsyncSession = Depends(get_tenant_db_from_token)):
    keys = (await db.execute(
        select(StaffPasskey).where(StaffPasskey.staff_id == staff.id).order_by(StaffPasskey.created_at)
    )).scalars().all()
    return {
        "enabled": mfa.is_on(staff),
        "required": _role(staff) in settings.mfa_required_roles,
        "methods": {"totp": staff.totp_enabled, "email": staff.mfa_email_enabled, "passkey": staff.mfa_passkey_enabled},
        "preferred": mfa.preferred(staff),
        "backup_codes_left": len(staff.backup_codes or []),
        "email": staff.email,
        "email_hint": mfa.mask_email(staff.email),
        "passkeys": [{"id": str(k.id), "name": k.name, "created_at": k.created_at.isoformat(),
                      "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None} for k in keys],
    }


# ─── Código por correo para acciones de la cuenta ──────────────────────────

CodePurpose = Literal["password", "mfa_email", "mfa_disable", "backup"]
PURPOSE_ACTIONS = {
    "password": "cambiar tu contraseña",
    "mfa_email": "activar el código por correo",
    "mfa_disable": "desactivar un método de verificación",
    "backup": "generar códigos de respaldo nuevos",
}


class CodeRequest(BaseModel):
    purpose: CodePurpose


@router.post("/security/code")
@limiter.limit("5/minute")
async def send_security_code(request: Request, payload: CodeRequest, staff: UserStaff = Depends(get_current_staff)):
    await mfa.send_code(staff, payload.purpose, action=PURPOSE_ACTIONS[payload.purpose])
    return {"sent": True, "email_hint": mfa.mask_email(staff.email), "expires_in": mfa.CODE_MINUTES * 60}


# ─── App autenticadora ─────────────────────────────────────────────────────

class CodeOnly(BaseModel):
    code: str


@router.post("/mfa/setup")
async def mfa_setup(staff: UserStaff = Depends(get_current_staff), db: AsyncSession = Depends(get_tenant_db_from_token)):
    """Genera el secreto y el QR para la app autenticadora. Queda pendiente hasta
    confirmar un código válido."""
    if staff.totp_enabled:
        raise HTTPException(status_code=409, detail="La app autenticadora ya está activa")
    secret = totp.new_secret()
    row = await db.get(UserStaff, staff.id)
    row.totp_secret_enc = encrypt_secret(secret)
    await db.commit()
    return {"secret": secret, "otpauth_uri": totp.provisioning_uri(secret, staff.email)}


@router.post("/mfa/enable")
async def mfa_enable(
    payload: CodeOnly,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    row = await db.get(UserStaff, staff.id)
    secret = decrypt_secret(row.totp_secret_enc) if row.totp_secret_enc else None
    if not secret or not totp.verify(secret, payload.code):
        raise HTTPException(status_code=400, detail="Código incorrecto. Revisa la hora del celular y escribe el código actual.")
    await account_security.claim_code(f"staff:{row.id}", payload.code)
    row.totp_enabled = True
    codes = _fresh_backup_codes(row)
    audit(db, row, "security.mfa_enable", "user", row.id, {"method": "totp"})
    await db.commit()
    claims, session = _new_session(row, credentials)
    await account_security.revoke_jti(claims.get("jti"), claims.get("exp"))
    await _notify(row, "mfa_enabled", "Método: aplicación autenticadora.")
    return {"backup_codes": codes, "session": session}


# ─── Código por correo ─────────────────────────────────────────────────────

@router.post("/mfa/email/enable")
async def mfa_email_enable(
    payload: CodeOnly,
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Activa el código por correo. Antes se pide un código (purpose=mfa_email)
    para comprobar que el correo de la cuenta sí le llega a la persona."""
    row = await db.get(UserStaff, staff.id)
    if row.mfa_email_enabled:
        raise HTTPException(status_code=409, detail="El código por correo ya está activo")
    if not await mfa.check_code(row.id, "mfa_email", payload.code):
        raise HTTPException(status_code=400, detail="Código incorrecto o vencido")
    row.mfa_email_enabled = True
    codes = _fresh_backup_codes(row)
    audit(db, row, "security.mfa_enable", "user", row.id, {"method": "email"})
    await db.commit()
    await _notify(row, "mfa_enabled", "Método: código por correo.")
    return {"backup_codes": codes}


# ─── Llaves de acceso ──────────────────────────────────────────────────────

@router.post("/mfa/passkeys/options")
async def passkey_options(staff: UserStaff = Depends(get_current_staff), db: AsyncSession = Depends(get_tenant_db_from_token)):
    existing = (await db.execute(
        select(StaffPasskey.credential_id).where(StaffPasskey.staff_id == staff.id)
    )).scalars().all()
    if len(existing) >= 10:
        raise HTTPException(status_code=409, detail="Ya tienes 10 llaves de acceso. Borra una para agregar otra.")
    return await passkeys.registration_options(staff, list(existing))


class PasskeyRegister(BaseModel):
    credential: dict
    name: str = Field(default="Llave de acceso", min_length=1, max_length=100)


@router.post("/mfa/passkeys", status_code=201)
async def passkey_register(
    payload: PasskeyRegister,
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    data = await passkeys.verify_registration(staff, payload.credential)
    row = await db.get(UserStaff, staff.id)
    key = StaffPasskey(staff_id=row.id, name=payload.name.strip(), **data)
    db.add(key)
    row.mfa_passkey_enabled = True
    codes = _fresh_backup_codes(row)
    audit(db, row, "security.mfa_enable", "user", row.id, {"method": "passkey"})
    await db.commit()
    await _notify(row, "passkey_added", f"Nombre de la llave: {key.name}.")
    return {"id": str(key.id), "name": key.name, "backup_codes": codes}


class PasswordOnly(BaseModel):
    password: str


@router.post("/mfa/passkeys/{passkey_id}/delete")
async def passkey_delete(
    passkey_id: uuid.UUID,
    payload: PasswordOnly,
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    row = await db.get(UserStaff, staff.id)
    if not verify_password(payload.password, row.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña incorrecta")
    key = await db.get(StaffPasskey, passkey_id)
    if not key or key.staff_id != row.id:
        raise HTTPException(status_code=404, detail="Llave no encontrada")
    await db.delete(key)
    await db.flush()
    left = await db.scalar(select(func.count()).select_from(StaffPasskey).where(StaffPasskey.staff_id == row.id))
    row.mfa_passkey_enabled = bool(left)
    _after_disable(row)
    audit(db, row, "security.mfa_disable", "user", row.id, {"method": "passkey"})
    await db.commit()
    await _notify(row, "mfa_disabled", f"Se borró la llave de acceso «{key.name}».")
    return {"deleted": True, "enabled": mfa.is_on(row)}


# ─── Método preferido, respaldo y desactivar ───────────────────────────────

class PreferredRequest(BaseModel):
    method: Literal["totp", "email", "passkey"]


@router.patch("/mfa/preferred")
async def mfa_preferred(payload: PreferredRequest, staff: UserStaff = Depends(get_current_staff),
                        db: AsyncSession = Depends(get_tenant_db_from_token)):
    row = await db.get(UserStaff, staff.id)
    if payload.method not in mfa.methods(row):
        raise HTTPException(status_code=400, detail="Ese método no está activo")
    row.mfa_preferred = payload.method
    await db.commit()
    return {"preferred": row.mfa_preferred}


class FactorRequest(BaseModel):
    code: str
    #: Con qué se confirma: app autenticadora o código enviado al correo.
    method: Literal["totp", "email"] = "totp"


@router.post("/mfa/backup-codes")
async def mfa_new_backup_codes(payload: FactorRequest, staff: UserStaff = Depends(get_current_staff),
                               db: AsyncSession = Depends(get_tenant_db_from_token)):
    row = await db.get(UserStaff, staff.id)
    if not mfa.is_on(row):
        raise HTTPException(status_code=409, detail="Primero activa un método de verificación")
    if not await _check_factor(row, payload.method, payload.code, "backup"):
        raise HTTPException(status_code=400, detail="Código incorrecto")
    codes = totp.new_backup_codes()
    row.backup_codes = [totp.hash_backup_code(c) for c in codes]
    audit(db, row, "security.mfa_backup_codes", "user", row.id, {})
    await db.commit()
    return {"backup_codes": codes}


class DisableRequest(BaseModel):
    method: Literal["totp", "email"] = "totp"
    password: str
    code: str


@router.post("/mfa/disable")
async def mfa_disable(payload: DisableRequest, staff: UserStaff = Depends(get_current_staff),
                      db: AsyncSession = Depends(get_tenant_db_from_token)):
    """Apaga un método. Pide la contraseña y un código: con la app para apagar la
    app, con el correo para apagar el correo."""
    row = await db.get(UserStaff, staff.id)
    others = [m for m in mfa.methods(row) if m != payload.method]
    if _role(row) in settings.mfa_required_roles and not others:
        raise HTTPException(status_code=409, detail="Tu rol exige al menos un método de verificación en dos pasos")
    if not verify_password(payload.password, row.hashed_password) \
            or not await _check_factor(row, payload.method, payload.code, "mfa_disable"):
        raise HTTPException(status_code=400, detail="Contraseña o código incorrecto")
    if payload.method == "totp":
        row.totp_enabled = False
        row.totp_secret_enc = None
    else:
        row.mfa_email_enabled = False
    _after_disable(row)
    audit(db, row, "security.mfa_disable", "user", row.id, {"method": payload.method})
    await db.commit()
    await _notify(row, "mfa_disabled", f"Método: {mfa.METHOD_LABELS[payload.method]}.")
    return {"enabled": mfa.is_on(row)}


# ─── Contraseña ────────────────────────────────────────────────────────────

class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=MIN_PASSWORD, max_length=128)
    code: str
    method: Literal["totp", "email"] = "email"


async def _set_password_everywhere(master: AsyncSession, row: UserStaff, hashed: str) -> None:
    """El dueño entra por la base maestra (`owners`) y además existe en su gimnasio:
    las dos contraseñas deben quedar iguales o la vieja sigue sirviendo."""
    row.hashed_password = hashed
    if _role(row) == "owner":
        owner = (await master.execute(
            select(Owner).where(func.lower(Owner.email) == row.email.lower())
        )).scalars().first()
        if owner:
            owner.hashed_password = hashed


@router.post("/password/change")
@limiter.limit("10/minute")
async def change_password(
    request: Request,
    payload: PasswordChange,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    master: AsyncSession = Depends(get_master_db),
):
    row = await db.get(UserStaff, staff.id)
    if not verify_password(payload.current_password, row.hashed_password):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="La contraseña nueva debe ser distinta de la actual")
    if not await _check_factor(row, payload.method, payload.code, "password"):
        raise HTTPException(status_code=400, detail="Código incorrecto o vencido")
    await _set_password_everywhere(master, row, hash_password(payload.new_password))
    audit(db, row, "security.password_change", "user", row.id, {})
    await master.commit()
    await db.commit()
    # Toda sesión abierta con la contraseña anterior se cierra; quien la cambió sigue dentro.
    await account_security.end_sessions_before_now(row.id)
    _, session = _new_session(row, credentials)
    await _notify(row, "password_changed")
    return {"ok": True, "session": session}


# ─── Correo de acceso ──────────────────────────────────────────────────────

class EmailChangeStart(BaseModel):
    new_email: EmailStr
    current_password: str


class EmailChangeConfirm(BaseModel):
    new_email: EmailStr
    code: str


def _email_purpose(new_email: str) -> str:
    return "email_change:" + hashlib.sha256(new_email.lower().encode()).hexdigest()[:16]


async def _email_taken(master: AsyncSession, db: AsyncSession, email: str, staff_id) -> bool:
    lowered = email.lower()
    if (await master.execute(select(Owner.id).where(func.lower(Owner.email) == lowered))).first():
        return True
    if (await master.execute(select(StaffDirectory.id).where(func.lower(StaffDirectory.email) == lowered))).first():
        return True
    return bool((await db.execute(
        select(UserStaff.id).where(func.lower(UserStaff.email) == lowered, UserStaff.id != staff_id)
    )).first())


@router.post("/email/change/code")
@limiter.limit("5/minute")
async def email_change_code(
    request: Request,
    payload: EmailChangeStart,
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    master: AsyncSession = Depends(get_master_db),
):
    """Manda un código al correo NUEVO: así se comprueba que es de la persona."""
    row = await db.get(UserStaff, staff.id)
    new_email = payload.new_email.strip().lower()
    if not verify_password(payload.current_password, row.hashed_password):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    if new_email == row.email.lower():
        raise HTTPException(status_code=400, detail="Ese ya es tu correo")
    if await _email_taken(master, db, new_email, row.id):
        raise HTTPException(status_code=409, detail="Ese correo ya está en uso en LSMFit")
    await mfa.send_code(row, _email_purpose(new_email), to=new_email, action="confirmar tu correo nuevo")
    return {"sent": True, "email_hint": mfa.mask_email(new_email)}


@router.post("/email/change")
async def email_change(
    payload: EmailChangeConfirm,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    master: AsyncSession = Depends(get_master_db),
):
    row = await db.get(UserStaff, staff.id)
    new_email = payload.new_email.strip().lower()
    if not await mfa.check_code(row.id, _email_purpose(new_email), payload.code):
        raise HTTPException(status_code=400, detail="Código incorrecto o vencido")
    if await _email_taken(master, db, new_email, row.id):
        raise HTTPException(status_code=409, detail="Ese correo ya está en uso en LSMFit")
    old_email = row.email
    entry = (await master.execute(select(StaffDirectory).where(StaffDirectory.staff_id == row.id))).scalars().first()
    if entry:
        entry.email = new_email
    if _role(row) == "owner":
        owner = (await master.execute(
            select(Owner).where(func.lower(Owner.email) == old_email.lower())
        )).scalars().first()
        if owner:
            owner.email = new_email
    row.email = new_email
    audit(db, row, "security.email_change", "user", row.id, {})
    await master.commit()
    await db.commit()
    _, session = _new_session(row, credentials)
    await _notify(row, "email_changed", f"Correo nuevo: {mfa.mask_email(new_email)}.", to=old_email)
    return {"email": new_email, "session": session}


# ─── Sesiones ──────────────────────────────────────────────────────────────

@router.post("/sessions/revoke-all")
async def revoke_all_sessions(credentials: HTTPAuthorizationCredentials = Depends(security),
                              staff: UserStaff = Depends(get_current_staff)):
    """Cierra la sesión en todos los equipos menos en el que se pidió."""
    await account_security.end_sessions_before_now(staff.id)
    _, session = _new_session(staff, credentials)
    await _notify(staff, "sessions_closed")
    return {"ok": True, "session": session}
