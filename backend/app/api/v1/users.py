from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.core.security import hash_password
from app.schemas.user import InviteUserRequest, UserResponse, UpdateUserRoleRequest
from app.api.deps import get_current_user, require_role, check_tenant_active

router = APIRouter(prefix="/users", tags=["users"])

TEMP_PASSWORD = "TempPass123!"


@router.post("/invite", status_code=201, response_model=UserResponse)
async def invite_staff(
    payload: InviteUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner)),
    _tenant: Tenant = Depends(check_tenant_active),
):
    if payload.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede invitar con rol owner")

    result = await db.execute(
        select(User).where(User.email == payload.email, User.tenant_id == current_user.tenant_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya existe en este gym")

    new_user = User(
        tenant_id=current_user.tenant_id,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        hashed_password=hash_password(TEMP_PASSWORD),
        email_verified=False,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return UserResponse.model_validate(new_user)


@router.get("/", response_model=list[UserResponse])
async def list_staff(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
    _tenant: Tenant = Depends(check_tenant_active),
):
    result = await db.execute(
        select(User).where(User.tenant_id == current_user.tenant_id, User.is_active.is_(True))
    )
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    payload: UpdateUserRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner)),
    _tenant: Tenant = Depends(check_tenant_active),
):
    if payload.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede asignar rol owner")

    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.role = payload.role
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}")
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner)),
    _tenant: Tenant = Depends(check_tenant_active),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")
    user.is_active = False
    await db.commit()
    return {"ok": True}
