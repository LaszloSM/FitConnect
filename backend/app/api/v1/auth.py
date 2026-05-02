import uuid
import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.tenant import Tenant, SubscriptionPlan
from app.models.user import User, UserRole
from app.core.security import hash_password, verify_password, create_access_token
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RegisterResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}-{uuid.uuid4().hex[:6]}"


@router.post("/register", status_code=201, response_model=RegisterResponse)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    tenant = Tenant(
        name=payload.gym_name,
        slug=slugify(payload.gym_name),
        plan=SubscriptionPlan.basic,
    )
    db.add(tenant)
    await db.flush()

    user = User(
        tenant_id=tenant.id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.owner,
        email_verified=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {"email": user.email, "role": user.role, "tenant_id": str(tenant.id)}


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cuenta desactivada")

    token = create_access_token(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        role=user.role,
    )
    return TokenResponse(
        access_token=token,
        role=user.role,
        tenant_id=str(user.tenant_id),
        full_name=user.full_name,
    )
