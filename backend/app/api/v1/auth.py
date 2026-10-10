from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import settings
from app.core.permissions import ROLE_PERMISSIONS
from app.services.staff_member import ensure_staff_member
from app.api.deps import get_current_staff, security
from app.core.security import (
    verify_password,
    hash_password,
    create_access_token,
    create_staff_token,
    hash_invite_token,
    generate_invite_token,
    decode_token,
    create_challenge_token,
)
from app.core.rate_limit import limiter
from app.db.master_session import get_master_db
from app.db.tenant_session import get_tenant_engine
from app.models.master.owner import Owner
from app.models.master.tenant import Tenant
from app.models.master.staff_directory import StaffDirectory
from app.models.master.staff_invitation import StaffInvitation
from app.models.tenant.user_staff import UserStaff, UserRole
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, AcceptInviteRequest, MfaChallenge, MfaVerifyRequest,
    MfaCodeRequest, MfaDisableRequest, ForgotPasswordRequest, ResetPasswordRequest,
)
from app.models.master.platform import PasswordReset
from app.services import mailer
from app.core import totp
from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.master.tenant import TenantStatus
from app.services import account_security
from app.services.audit import audit
from app.api.deps import get_tenant_db_from_token
from app.services.tenant_service import create_tenant


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, payload: RegisterRequest, db: AsyncSession = Depends(get_master_db)):
    # Verificar email único en Master DB
    result = await db.execute(select(Owner).where(Owner.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    # Crear tenant completo (Master DB + Tenant DB física + Alembic + UserStaff owner)
    tenant = await create_tenant(
        owner_email=payload.email,
        gym_name=payload.gym_name,
        city=payload.city,
        country=payload.country,
        phone=payload.phone,
        owner_full_name=payload.full_name,
        password=payload.password,
    )

    return {
        "email": payload.email,
        "role": "owner",
        "tenant_id": str(tenant.id),
        "db_name": tenant.db_name,
    }


def _tokens_for(staff: UserStaff, *, kind: str, db_name: str, tenant_id: str | None = None,
                owner_id: str | None = None) -> TokenResponse:
    """Emite el token de sesión. Si el rol exige verificación en dos pasos y aún
    no la configuró, el token solo sirve para configurarla."""
    role = staff.role.value if hasattr(staff.role, "value") else str(staff.role)
    needs_setup = (not staff.totp_enabled) and role in settings.mfa_required_roles
    extra = {"mfa": "setup_required"} if needs_setup else {}
    if kind == "owner":
        token = create_access_token(owner_id=owner_id, tenant_id=tenant_id, db_name=db_name, role="owner",
                                    staff_id=str(staff.id), **extra)
    else:
        token = create_staff_token(staff_id=str(staff.id), db_name=db_name, role=role, **extra)
    return TokenResponse(
        access_token=token, role=role, tenant_id=tenant_id or "", db_name=db_name, full_name=staff.full_name,
        permissions=sorted(ROLE_PERMISSIONS.get(UserRole(role), frozenset())), mfa_setup_required=needs_setup,
    )


async def _staff_in(db_name: str, *, staff_id=None, email: str | None = None) -> UserStaff | None:
    engine = get_tenant_engine(settings.tenant_database_url_template.replace("{db_name}", db_name))
    async with async_sessionmaker(engine, expire_on_commit=False)() as ts:
        stmt = select(UserStaff)
        stmt = stmt.where(UserStaff.id == staff_id) if staff_id else stmt.where(UserStaff.email == email)
        return (await ts.execute(stmt)).scalar_one_or_none()


async def _tenant_allows_login(db: AsyncSession, tenant_id) -> Tenant:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Gym no encontrado")
    if tenant.status == TenantStatus.suspended:
        raise HTTPException(status_code=403, detail="La cuenta de este gimnasio está suspendida. Escribe a soporte de LSMFit.")
    return tenant


def _challenge_or_tokens(staff: UserStaff, **ctx) -> TokenResponse | MfaChallenge:
    if staff.totp_enabled:
        return MfaChallenge(challenge_token=create_challenge_token(
            "login", staff_id=str(staff.id), db_name=ctx["db_name"], kind=ctx["kind"],
            tenant_id=ctx.get("tenant_id"), owner_id=ctx.get("owner_id"),
        ))
    return _tokens_for(staff, **ctx)


@router.post("/login", response_model=TokenResponse | MfaChallenge)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_master_db)):
    if await account_security.too_many_failures(payload.email):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos o recupera tu contraseña.")
    result = await db.execute(select(Owner).where(Owner.email == payload.email))
    owner = result.scalar_one_or_none()

    if not owner or not verify_password(payload.password, owner.hashed_password):
        # El login unificado del frontend prueba primero aquí y luego como personal:
        # el fallo se cuenta solo cuando el correo es de un dueño.
        if owner:
            await account_security.register_failure(payload.email)
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if not owner.is_active:
        raise HTTPException(status_code=401, detail="Cuenta desactivada")

    if not owner.tenant_id:
        raise HTTPException(status_code=400, detail="Owner no tiene gym asignado")
    tenant = await _tenant_allows_login(db, owner.tenant_id)
    await account_security.clear_failures(payload.email)

    staff = await _staff_in(tenant.db_name, email=owner.email)
    if staff is None:
        raise HTTPException(status_code=409, detail="La cuenta del dueño no está completa en el gimnasio")
    return _challenge_or_tokens(staff, kind="owner", db_name=tenant.db_name, tenant_id=str(tenant.id),
                                owner_id=str(owner.id))


@router.post("/staff/login", response_model=TokenResponse | MfaChallenge)
@limiter.limit("10/minute")
async def staff_login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_master_db)):
    """Login de staff (admin/recepción): resuelve el tenant por el índice global
    email→tenant y valida las credenciales contra la tenant DB del gym."""
    if await account_security.too_many_failures(payload.email):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos o recupera tu contraseña.")
    result = await db.execute(select(StaffDirectory).where(StaffDirectory.email == payload.email))
    entry = result.scalar_one_or_none()
    if not entry or not entry.is_active:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    staff = await _staff_in(entry.db_name, staff_id=entry.staff_id)
    if not staff or not staff.is_active or not verify_password(payload.password, staff.hashed_password):
        await account_security.register_failure(payload.email)
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    await _tenant_allows_login(db, entry.tenant_id)
    await account_security.clear_failures(payload.email)
    return _challenge_or_tokens(staff, kind="staff", db_name=entry.db_name, tenant_id=str(entry.tenant_id))


@router.post("/mfa/verify", response_model=TokenResponse)
@limiter.limit("10/minute")
async def mfa_verify(request: Request, payload: MfaVerifyRequest, db: AsyncSession = Depends(get_master_db)):
    """Segundo paso del login: código de la app autenticadora o un código de respaldo."""
    claims = decode_token(payload.challenge_token)
    if claims.get("scope") != "mfa_login":
        raise HTTPException(status_code=401, detail="El paso de verificación venció. Vuelve a entrar.")
    if await account_security.too_many_failures(f"mfa:{claims['staff_id']}"):
        raise HTTPException(status_code=429, detail="Demasiados códigos incorrectos. Espera 15 minutos.")
    engine = get_tenant_engine(settings.tenant_database_url_template.replace("{db_name}", claims["db_name"]))
    async with async_sessionmaker(engine, expire_on_commit=False)() as ts:
        staff = (await ts.execute(
            select(UserStaff).where(UserStaff.id == claims["staff_id"]).with_for_update()
        )).scalar_one_or_none()
        if not staff or not staff.is_active or not staff.totp_enabled:
            raise HTTPException(status_code=401, detail="Credenciales incorrectas")
        ok = totp.verify(decrypt_secret(staff.totp_secret_enc) or "", payload.code) \
            and await account_security.claim_code(f"staff:{staff.id}", payload.code)
        if not ok:
            remaining = totp.consume_backup_code(staff.backup_codes, payload.code)
            if remaining is not None:
                staff.backup_codes = remaining
                await ts.commit()
                ok = True
        if not ok:
            await account_security.register_failure(f"mfa:{claims['staff_id']}")
            raise HTTPException(status_code=401, detail="Código incorrecto")
    await account_security.clear_failures(f"mfa:{claims['staff_id']}")
    await _tenant_allows_login(db, claims["tenant_id"]) if claims.get("tenant_id") else None
    return _tokens_for(staff, kind=claims["kind"], db_name=claims["db_name"], tenant_id=claims.get("tenant_id"),
                       owner_id=claims.get("owner_id"))


@router.post("/staff/accept-invite", response_model=TokenResponse)
@limiter.limit("10/minute")
async def accept_invite(request: Request, payload: AcceptInviteRequest, db: AsyncSession = Depends(get_master_db)):
    """El invitado fija su contraseña con el token del link. Crea el UserStaff en
    la tenant DB del gym + el índice global, y consume la invitación (un solo uso)."""
    result = await db.execute(
        select(StaffInvitation).where(StaffInvitation.token_hash == hash_invite_token(payload.token))
    )
    invite = result.scalar_one_or_none()
    if not invite or invite.used_at is not None or invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invitación inválida o expirada")

    # Crear el staff en la tenant DB del gym
    connection_string = settings.tenant_database_url_template.replace("{db_name}", invite.db_name)
    engine = get_tenant_engine(connection_string)
    async with async_sessionmaker(engine, expire_on_commit=False)() as ts:
        existing = await ts.execute(select(UserStaff).where(UserStaff.email == invite.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="El usuario ya existe en el gym")
        staff = UserStaff(
            email=invite.email,
            full_name=invite.full_name,
            role=UserRole(invite.role),
            hashed_password=hash_password(payload.password),
            email_verified=True,
        )
        ts.add(staff)
        await ts.flush()

        if staff.role == UserRole.trainer:
            # El entrenador necesita una ficha en `instructors`: es lo que lo
            # vincula con sus clases y sus socios. Si ya existe una con su
            # nombre y sin cuenta (el catálogo de siempre), se enlaza en vez de
            # duplicarla; el historial de clases queda intacto.
            from app.models.tenant.instructor import Instructor
            ficha = (await ts.execute(
                select(Instructor).where(
                    Instructor.staff_id.is_(None),
                    func.lower(Instructor.full_name) == invite.full_name.strip().lower(),
                )
            )).scalars().first()
            if ficha is None:
                ficha = Instructor(full_name=invite.full_name)
                ts.add(ficha)
            ficha.staff_id = staff.id
            ficha.is_active = True

        # El personal entrena en el gimnasio donde trabaja: su ficha de socio le
        # da QR, huella y torniquete sin tocar el motor de acceso.
        await ensure_staff_member(
            ts, full_name=staff.full_name, email=staff.email, staff_id=staff.id
        )

        await ts.commit()
        await ts.refresh(staff)
        staff_id = staff.id

    # Índice global (login de staff) + consumir la invitación
    db.add(StaffDirectory(
        email=invite.email,
        tenant_id=invite.tenant_id,
        db_name=invite.db_name,
        staff_id=staff_id,
    ))
    invite.used_at = datetime.now(timezone.utc)
    await db.commit()

    # Por _tokens_for: un administrador invitado también debe configurar el segundo paso.
    return _tokens_for(staff, kind="staff", db_name=invite.db_name, tenant_id=str(invite.tenant_id))


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("60/minute")
async def refresh(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    staff: UserStaff = Depends(get_current_staff),
):
    """Renueva el token de una sesión todavía vigente (misma identidad, mismas
    capacidades; si faltaba configurar el segundo paso, sigue faltando)."""
    payload = decode_token(credentials.credentials)
    kind = "owner" if payload.get("tenant_id") and payload.get("role") == "owner" else "staff"
    response = _tokens_for(staff, kind=kind, db_name=payload.get("db_name"), tenant_id=payload.get("tenant_id"),
                           owner_id=payload.get("sub"))
    await account_security.revoke_jti(payload.get("jti"), payload.get("exp"))
    return response


@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Cierra la sesión de verdad: el token deja de servir aunque no haya vencido."""
    try:
        payload = decode_token(credentials.credentials)
    except HTTPException:
        return {"ok": True}
    await account_security.revoke_jti(payload.get("jti"), payload.get("exp"))
    return {"ok": True}


# ─── Verificación en dos pasos (cuenta propia) ──────────────────────────────

@router.get("/mfa/status")
async def mfa_status(staff: UserStaff = Depends(get_current_staff)):
    role = staff.role.value if hasattr(staff.role, "value") else str(staff.role)
    return {
        "enabled": staff.totp_enabled,
        "required": role in settings.mfa_required_roles,
        "backup_codes_left": len(staff.backup_codes or []),
    }


@router.post("/mfa/setup")
async def mfa_setup(
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Genera el secreto y el QR para la app autenticadora. Queda pendiente hasta
    confirmar un código válido."""
    if staff.totp_enabled:
        raise HTTPException(status_code=409, detail="La verificación en dos pasos ya está activa")
    secret = totp.new_secret()
    row = await db.get(UserStaff, staff.id)
    row.totp_secret_enc = encrypt_secret(secret)
    await db.commit()
    return {"secret": secret, "otpauth_uri": totp.provisioning_uri(secret, staff.email)}


@router.post("/mfa/enable")
async def mfa_enable(
    payload: MfaCodeRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    row = await db.get(UserStaff, staff.id)
    secret = decrypt_secret(row.totp_secret_enc) if row.totp_secret_enc else None
    if not secret or not totp.verify(secret, payload.code):
        raise HTTPException(status_code=400, detail="Código incorrecto. Revisa la hora del celular y escribe el código actual.")
    await account_security.claim_code(f"staff:{row.id}", payload.code)
    codes = totp.new_backup_codes()
    row.totp_enabled = True
    row.backup_codes = [totp.hash_backup_code(c) for c in codes]
    audit(db, row, "security.mfa_enable", "user", row.id, {})
    await db.commit()
    claims = decode_token(credentials.credentials)
    await account_security.revoke_jti(claims.get("jti"), claims.get("exp"))
    kind = "owner" if claims.get("role") == "owner" and claims.get("tenant_id") else "staff"
    session = _tokens_for(row, kind=kind, db_name=claims["db_name"], tenant_id=claims.get("tenant_id"),
                          owner_id=claims.get("sub"))
    return {"backup_codes": codes, "session": session}


@router.post("/mfa/backup-codes")
async def mfa_new_backup_codes(
    payload: MfaCodeRequest,
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    row = await db.get(UserStaff, staff.id)
    if not row.totp_enabled or not totp.verify(decrypt_secret(row.totp_secret_enc) or "", payload.code):
        raise HTTPException(status_code=400, detail="Código incorrecto")
    codes = totp.new_backup_codes()
    row.backup_codes = [totp.hash_backup_code(c) for c in codes]
    audit(db, row, "security.mfa_backup_codes", "user", row.id, {})
    await db.commit()
    return {"backup_codes": codes}


@router.post("/mfa/disable")
async def mfa_disable(
    payload: MfaDisableRequest,
    staff: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    role = staff.role.value if hasattr(staff.role, "value") else str(staff.role)
    if role in settings.mfa_required_roles:
        raise HTTPException(status_code=409, detail="Para dueño y administrador la verificación en dos pasos es obligatoria")
    row = await db.get(UserStaff, staff.id)
    if not verify_password(payload.password, row.hashed_password) or not totp.verify(
        decrypt_secret(row.totp_secret_enc) or "", payload.code
    ):
        raise HTTPException(status_code=400, detail="Contraseña o código incorrecto")
    row.totp_enabled = False
    row.totp_secret_enc = None
    row.backup_codes = None
    audit(db, row, "security.mfa_disable", "user", row.id, {})
    await db.commit()
    return {"enabled": False}


# ─── Recuperar contraseña ────────────────────────────────────────────────────

RESET_TTL_MINUTES = 60


@router.post("/password/forgot")
@limiter.limit("5/minute")
async def forgot_password(request: Request, payload: ForgotPasswordRequest, background: BackgroundTasks,
                          db: AsyncSession = Depends(get_master_db)):
    """Envía un enlace de un solo uso al correo. Responde lo mismo, y en el mismo
    tiempo, exista o no la cuenta: el correo sale después de responder."""
    email = payload.email.strip().lower()
    owner = (await db.execute(select(Owner).where(func.lower(Owner.email) == email))).scalars().first()
    staff = (await db.execute(select(StaffDirectory).where(func.lower(StaffDirectory.email) == email))).scalars().first()
    if owner or (staff and staff.is_active):
        token = generate_invite_token()
        db.add(PasswordReset(
            token_hash=hash_invite_token(token), email=email,
            expires_at=datetime.utcnow() + timedelta(minutes=RESET_TTL_MINUTES),
        ))
        await db.commit()
        link = f"{settings.frontend_url.rstrip('/')}/restablecer?token={token}"
        background.add_task(mailer.send, email, "Recupera tu contraseña de LSMFit", (
            "Hola,\n\nPediste cambiar tu contraseña de LSMFit. Entra a este enlace (vence en una hora):\n\n"
            f"{link}\n\nSi no fuiste tú, ignora este correo: tu contraseña sigue igual."
        ))
    return {"ok": True}


@router.post("/password/reset")
@limiter.limit("10/minute")
async def reset_password(request: Request, payload: ResetPasswordRequest, db: AsyncSession = Depends(get_master_db)):
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="La contraseña debe tener al menos 8 caracteres")
    row = (await db.execute(
        select(PasswordReset).where(PasswordReset.token_hash == hash_invite_token(payload.token)).with_for_update()
    )).scalar_one_or_none()
    if not row or row.used_at is not None or row.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="El enlace no es válido o ya venció. Pide uno nuevo.")
    hashed = hash_password(payload.password)
    owner = (await db.execute(select(Owner).where(func.lower(Owner.email) == row.email))).scalars().first()
    if owner:
        owner.hashed_password = hashed
    targets: list[str] = []
    entry = (await db.execute(select(StaffDirectory).where(func.lower(StaffDirectory.email) == row.email))).scalars().first()
    if entry:
        targets.append(entry.db_name)
    if owner and owner.tenant_id:
        tenant = (await db.execute(select(Tenant).where(Tenant.id == owner.tenant_id))).scalar_one_or_none()
        if tenant and tenant.db_name not in targets:
            targets.append(tenant.db_name)
    for db_name in targets:
        engine = get_tenant_engine(settings.tenant_database_url_template.replace("{db_name}", db_name))
        async with async_sessionmaker(engine, expire_on_commit=False)() as ts:
            staff = (await ts.execute(select(UserStaff).where(func.lower(UserStaff.email) == row.email))).scalars().first()
            if staff:
                staff.hashed_password = hashed
                audit(ts, staff, "security.password_reset", "user", staff.id, {})
                await ts.commit()
                await account_security.end_sessions_before_now(staff.id)
    row.used_at = datetime.utcnow()
    await db.commit()
    await account_security.clear_failures(row.email)
    return {"ok": True}
