"""Login del panel: contraseña + app autenticadora (obligatoria desde el primer ingreso)."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.platform.deps import bearer, check_ip, current_admin, log, master_db
from app.core import totp
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.rate_limit import limiter
from app.core.security import create_platform_token, decode_platform_token, verify_password
from app.models.master.platform import PlatformAdmin
from app.services.account_security import claim_code, is_revoked, revoke_jti

router = APIRouter(prefix="/auth", tags=["platform"])

MAX_FAILURES = 5
LOCK_MINUTES = 30


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CodeIn(BaseModel):
    ticket: str
    code: str


def _session(admin: PlatformAdmin) -> dict:
    return {"access_token": create_platform_token(str(admin.id)), "email": admin.email, "full_name": admin.full_name}


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, payload: LoginIn, db: AsyncSession = Depends(master_db)):
    check_ip(request)
    admin = (await db.execute(
        select(PlatformAdmin).where(func.lower(PlatformAdmin.email) == payload.email.lower())
    )).scalar_one_or_none()
    now = datetime.utcnow()
    if admin and admin.locked_until and admin.locked_until > now:
        raise HTTPException(status_code=429, detail="Cuenta bloqueada temporalmente por intentos fallidos")
    if not admin or not admin.is_active or not verify_password(payload.password, admin.hashed_password):
        if admin:
            _register_failure(admin)
        log(db, request, None, "auth.login_failed", details={}, email=payload.email)
        await db.commit()
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if not admin.totp_enabled:
        # Primer ingreso: no hay sesión hasta configurar la app autenticadora.
        secret = totp.new_secret()
        admin.totp_secret_enc = encrypt_secret(secret)
        await db.commit()
        return {
            "step": "enroll",
            "ticket": create_platform_token(str(admin.id), scope="platform_enroll", minutes=10),
            "secret": secret,
            "otpauth_uri": totp.provisioning_uri(secret, admin.email, issuer="FitConnect Plataforma"),
        }
    await db.commit()
    return {"step": "otp", "ticket": create_platform_token(str(admin.id), scope="platform_otp", minutes=5)}


async def _ticket_admin(db: AsyncSession, ticket: str, scope: str) -> tuple[dict, PlatformAdmin]:
    """El ticket del paso intermedio sirve una sola vez y no salta el bloqueo."""
    claims = decode_platform_token(ticket, scope=scope)
    if await is_revoked(claims.get("jti")):
        raise HTTPException(status_code=401, detail="Este paso ya se usó. Vuelve a entrar.")
    admin = await db.get(PlatformAdmin, claims["sub"])
    if admin is None or not admin.is_active:
        raise HTTPException(status_code=401, detail="Cuenta no válida")
    if admin.locked_until and admin.locked_until > datetime.utcnow():
        raise HTTPException(status_code=429, detail="Cuenta bloqueada temporalmente por intentos fallidos")
    return claims, admin


def _register_failure(admin: PlatformAdmin) -> None:
    admin.failed_logins += 1
    if admin.failed_logins >= MAX_FAILURES:
        admin.locked_until = datetime.utcnow() + timedelta(minutes=LOCK_MINUTES)
        admin.failed_logins = 0


@router.post("/enroll")
@limiter.limit("10/minute")
async def enroll(request: Request, payload: CodeIn, db: AsyncSession = Depends(master_db)):
    check_ip(request)
    claims, admin = await _ticket_admin(db, payload.ticket, "platform_enroll")
    if admin.totp_enabled:
        raise HTTPException(status_code=409, detail="La app autenticadora ya está configurada")
    code = totp.normalize(payload.code)
    secret = decrypt_secret(admin.totp_secret_enc) if admin.totp_secret_enc else None
    if not secret or not totp.verify(secret, code):
        _register_failure(admin)
        log(db, request, admin, "auth.otp_failed")
        await db.commit()
        raise HTTPException(status_code=400, detail="Código incorrecto")
    await claim_code(f"platform:{admin.id}", code)
    await revoke_jti(claims.get("jti"), claims.get("exp"))
    codes = totp.new_backup_codes()
    admin.totp_enabled = True
    admin.backup_codes = [totp.hash_backup_code(c) for c in codes]
    admin.last_login_at = datetime.utcnow()
    admin.failed_logins = 0
    log(db, request, admin, "auth.mfa_enabled")
    await db.commit()
    return {**_session(admin), "backup_codes": codes}


@router.post("/verify")
@limiter.limit("10/minute")
async def verify(request: Request, payload: CodeIn, db: AsyncSession = Depends(master_db)):
    check_ip(request)
    claims, admin = await _ticket_admin(db, payload.ticket, "platform_otp")
    if not admin.totp_enabled:
        raise HTTPException(status_code=401, detail="Cuenta no válida")
    code = totp.normalize(payload.code)
    ok = totp.verify(decrypt_secret(admin.totp_secret_enc) or "", code) \
        and await claim_code(f"platform:{admin.id}", code)
    if not ok:
        await db.refresh(admin, with_for_update=True)
        remaining = totp.consume_backup_code(admin.backup_codes, payload.code)
        if remaining is not None:
            admin.backup_codes = remaining
            ok = True
            log(db, request, admin, "auth.backup_code_used", details={"left": len(remaining)})
    if not ok:
        _register_failure(admin)
        log(db, request, admin, "auth.otp_failed")
        await db.commit()
        raise HTTPException(status_code=401, detail="Código incorrecto")
    admin.failed_logins = 0
    admin.last_login_at = datetime.utcnow()
    await revoke_jti(claims.get("jti"), claims.get("exp"))
    log(db, request, admin, "auth.login")
    await db.commit()
    return _session(admin)


@router.get("/me")
async def me(admin: PlatformAdmin = Depends(current_admin)):
    return {"email": admin.email, "full_name": admin.full_name, "backup_codes_left": len(admin.backup_codes or [])}


@router.post("/logout")
async def logout(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    admin: PlatformAdmin = Depends(current_admin),
    db: AsyncSession = Depends(master_db),
):
    claims = decode_platform_token(credentials.credentials)
    await revoke_jti(claims.get("jti"), claims.get("exp"))
    log(db, request, admin, "auth.logout")
    await db.commit()
    return {"ok": True}
