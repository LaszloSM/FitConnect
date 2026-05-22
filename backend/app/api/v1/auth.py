import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import hash_password, verify_password, create_access_token
from app.core.rate_limit import limiter
from app.db.master_session import get_master_db
from app.models.master.owner import Owner
from app.models.master.tenant import Tenant
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
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
    
    token = create_access_token(
        owner_id=str(owner.id),
        tenant_id=str(tenant.id),
        db_name=tenant.db_name,
        role="owner",
    )
    return TokenResponse(
        access_token=token,
        role="owner",
        tenant_id=str(tenant.id),
        db_name=tenant.db_name,
        full_name=owner.full_name,
    )
