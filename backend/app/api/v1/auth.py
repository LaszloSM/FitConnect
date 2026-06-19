from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import settings
from app.core.security import (
    verify_password,
    hash_password,
    create_access_token,
    create_staff_token,
    hash_invite_token,
)
from app.core.rate_limit import limiter
from app.db.master_session import get_master_db
from app.db.tenant_session import get_tenant_engine
from app.models.master.owner import Owner
from app.models.master.tenant import Tenant
from app.models.master.staff_directory import StaffDirectory
from app.models.master.staff_invitation import StaffInvitation
from app.models.tenant.user_staff import UserStaff, UserRole
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, AcceptInviteRequest
from app.services.tenant_service import create_tenant


async def _resolve_owner_staff_id(tenant: Tenant, email: str) -> str | None:
    """Busca la fila UserStaff del owner en su tenant DB para incluir staff_id en el token."""
    engine = get_tenant_engine(tenant.db_connection_string)
    async with async_sessionmaker(engine, expire_on_commit=False)() as ts:
        result = await ts.execute(select(UserStaff).where(UserStaff.email == email))
        staff = result.scalar_one_or_none()
    return str(staff.id) if staff else None

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
        owner_full_name=payload.full_name,
        password=payload.password,
    )

    return {
        "email": payload.email,
        "role": "owner",
        "tenant_id": str(tenant.id),
        "db_name": tenant.db_name,
    }


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_master_db)):
    result = await db.execute(select(Owner).where(Owner.email == payload.email))
    owner = result.scalar_one_or_none()

    if not owner or not verify_password(payload.password, owner.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if not owner.is_active:
        raise HTTPException(status_code=401, detail="Cuenta desactivada")

    # Buscar tenant asociado
    if not owner.tenant_id:
        raise HTTPException(status_code=400, detail="Owner no tiene gym asignado")

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == owner.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Gym no encontrado")

    staff_id = await _resolve_owner_staff_id(tenant, owner.email)
    token = create_access_token(
        owner_id=str(owner.id),
        tenant_id=str(tenant.id),
        db_name=tenant.db_name,
        role="owner",
        staff_id=staff_id,
    )
    return TokenResponse(
        access_token=token,
        role="owner",
        tenant_id=str(tenant.id),
        db_name=tenant.db_name,
        full_name=owner.full_name,
    )


@router.post("/staff/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def staff_login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_master_db)):
    """Login de staff (admin/recepción): resuelve el tenant por el índice global
    email→tenant y valida las credenciales contra la tenant DB del gym."""
    result = await db.execute(select(StaffDirectory).where(StaffDirectory.email == payload.email))
    entry = result.scalar_one_or_none()
    if not entry or not entry.is_active:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    connection_string = settings.tenant_database_url_template.replace("{db_name}", entry.db_name)
    engine = get_tenant_engine(connection_string)
    async with async_sessionmaker(engine, expire_on_commit=False)() as ts:
        staff_result = await ts.execute(select(UserStaff).where(UserStaff.id == entry.staff_id))
        staff = staff_result.scalar_one_or_none()

    if not staff or not staff.is_active or not verify_password(payload.password, staff.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    token = create_staff_token(
        staff_id=str(staff.id),
        db_name=entry.db_name,
        role=staff.role.value,
    )
    return TokenResponse(
        access_token=token,
        role=staff.role.value,
        tenant_id=str(entry.tenant_id),
        db_name=entry.db_name,
        full_name=staff.full_name,
    )


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
        await ts.commit()
        await ts.refresh(staff)
        staff_id = staff.id
        staff_role = staff.role.value
        staff_full_name = staff.full_name

    # Índice global (login de staff) + consumir la invitación
    db.add(StaffDirectory(
        email=invite.email,
        tenant_id=invite.tenant_id,
        db_name=invite.db_name,
        staff_id=staff_id,
    ))
    invite.used_at = datetime.now(timezone.utc)
    await db.commit()

    token = create_staff_token(staff_id=str(staff_id), db_name=invite.db_name, role=staff_role)
    return TokenResponse(
        access_token=token,
        role=staff_role,
        tenant_id=str(invite.tenant_id),
        db_name=invite.db_name,
        full_name=staff_full_name,
    )
