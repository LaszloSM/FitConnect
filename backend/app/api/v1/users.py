from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.api.deps import get_master_db, get_tenant_db_from_token, require_perm
from app.core import permissions as perm
from app.core.config import settings
from app.core.security import generate_invite_token, hash_invite_token
from app.services.audit import audit
from app.models.master.staff_directory import StaffDirectory
from app.models.master.staff_invitation import StaffInvitation
from app.models.tenant.user_staff import UserStaff, UserRole
from app.schemas.user import InviteUserRequest, InviteResponse, UserResponse, UpdateUserRoleRequest

router = APIRouter(prefix="/users", tags=["users"])

INVITE_TTL_HOURS = 48


@router.post("/invite", status_code=201, response_model=InviteResponse)
async def invite_staff(
    payload: InviteUserRequest,
    current_user: UserStaff = Depends(require_perm(perm.USERS_MANAGE)),
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

    # Re-invitar emite un link fresco: descartamos invitaciones previas sin usar.
    await master_db.execute(
        delete(StaffInvitation).where(
            StaffInvitation.email == payload.email,
            StaffInvitation.used_at.is_(None),
        )
    )

    token = generate_invite_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_TTL_HOURS)
    master_db.add(StaffInvitation(
        token_hash=hash_invite_token(token),
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role.value,
        tenant_id=inviter_entry.tenant_id,
        db_name=inviter_entry.db_name,
        invited_by=current_user.id,
        expires_at=expires_at,
    ))
    audit(db, current_user, "staff.invite", "user", payload.email,
          {"email": payload.email, "role": payload.role.value, "expires_at": expires_at.isoformat()})
    await db.commit()
    await master_db.commit()

    invite_url = f"{settings.frontend_url.rstrip('/')}/aceptar-invitacion?token={token}"
    return InviteResponse(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        invite_url=invite_url,
        expires_at=expires_at,
    )


@router.get("", response_model=list[UserResponse])
async def list_staff(
    current_user: UserStaff = Depends(require_perm(perm.USERS_READ)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    include_inactive: bool = Query(False),
):
    stmt = select(UserStaff)
    if not include_inactive:
        stmt = stmt.where(UserStaff.is_active.is_(True))
    result = await db.execute(stmt.order_by(UserStaff.full_name))
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    payload: UpdateUserRoleRequest,
    current_user: UserStaff = Depends(require_perm(perm.USERS_MANAGE)),
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
    previous = user.role.value
    user.role = payload.role
    audit(db, current_user, "staff.role_change", "user", user.id,
          {"email": user.email, "from": previous, "to": payload.role.value})
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}")
async def deactivate_user(
    user_id: str,
    current_user: UserStaff = Depends(require_perm(perm.USERS_MANAGE)),
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
    audit(db, current_user, "staff.deactivate", "user", user.id, {"email": user.email})
    await db.commit()
    return {"ok": True}


@router.post("/{user_id}/reactivate", response_model=UserResponse)
async def reactivate_user(
    user_id: str,
    current_user: UserStaff = Depends(require_perm(perm.USERS_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Desactivar por error dejaba a la persona fuera para siempre: no había
    forma de revertirlo ni desde la UI ni desde la API."""
    result = await db.execute(select(UserStaff).where(UserStaff.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = True
    audit(db, current_user, "staff.reactivate", "user", user.id, {"email": user.email})
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)
