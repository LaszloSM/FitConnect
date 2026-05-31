from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_master_db, get_tenant_db_from_token, require_role
from app.core.security import hash_password
from app.models.master.staff_directory import StaffDirectory
from app.models.tenant.user_staff import UserStaff, UserRole
from app.schemas.user import InviteUserRequest, UserResponse, UpdateUserRoleRequest

router = APIRouter(prefix="/users", tags=["users"])

TEMP_PASSWORD = "TempPass123!"


@router.post("/invite", status_code=201, response_model=UserResponse)
async def invite_staff(
    payload: InviteUserRequest,
    current_user: UserStaff = Depends(require_role(UserRole.owner)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    master_db: AsyncSession = Depends(get_master_db),
):
    if payload.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede invitar con rol owner")

    # Contexto del gym del invitador (tenant_id, db_name) desde el índice global
    inviter = await master_db.execute(
        select(StaffDirectory).where(StaffDirectory.email == current_user.email)
    )
    inviter_entry = inviter.scalar_one_or_none()
    if not inviter_entry:
        raise HTTPException(status_code=400, detail="Invitador no está en el índice de staff")

    # Unicidad global de email (MVP: una persona = un gym)
    existing = await master_db.execute(
        select(StaffDirectory).where(StaffDirectory.email == payload.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya registrado en la plataforma")

    result = await db.execute(select(UserStaff).where(UserStaff.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya existe en este gym")

    new_user = UserStaff(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        hashed_password=hash_password(TEMP_PASSWORD),
        email_verified=False,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    master_db.add(StaffDirectory(
        email=payload.email,
        tenant_id=inviter_entry.tenant_id,
        db_name=inviter_entry.db_name,
        staff_id=new_user.id,
    ))
    await master_db.commit()
    return UserResponse.model_validate(new_user)


@router.get("", response_model=list[UserResponse])
async def list_staff(
    current_user: UserStaff = Depends(require_role(UserRole.owner, UserRole.admin)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(UserStaff).where(UserStaff.is_active.is_(True)))
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    payload: UpdateUserRoleRequest,
    current_user: UserStaff = Depends(require_role(UserRole.owner)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    if payload.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede asignar rol owner")

    result = await db.execute(select(UserStaff).where(UserStaff.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede cambiar el rol del owner")
    user.role = payload.role
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}")
async def deactivate_user(
    user_id: str,
    current_user: UserStaff = Depends(require_role(UserRole.owner)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(UserStaff).where(UserStaff.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")
    if user.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede desactivar al owner")
    user.is_active = False
    await db.commit()
    return {"ok": True}
