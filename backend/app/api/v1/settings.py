from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_tenant_db_from_token
from app.core.security import hash_password, verify_password, decode_token
from app.db.master_session import get_master_db
from app.models.master.tenant import Tenant
from app.models.tenant.user_staff import UserStaff, UserRole
from app.schemas.settings import (
    GymSettingsResponse,
    GymSettingsUpdate,
    NotificationPreferences,
    UserProfileResponse,
    UserProfileUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])
_security = HTTPBearer()


async def _get_current_staff(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
    db: AsyncSession = Depends(get_tenant_db_from_token),
) -> UserStaff:
    """Return the UserStaff record for the authenticated user."""
    payload = decode_token(credentials.credentials)
    # Owner tokens use 'sub'; staff tokens use 'staff_id'
    user_id = payload.get("staff_id") or payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")
    result = await db.execute(select(UserStaff).where(UserStaff.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


async def _get_master_tenant(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
    master_db: AsyncSession = Depends(get_master_db),
) -> Tenant:
    """Return the Tenant record from master DB using the token's tenant_id."""
    payload = decode_token(credentials.credentials)
    tenant_id = payload.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Token sin contexto de tenant")
    result = await master_db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Gym no encontrado")
    return tenant


# ─── Profile ─────────────────────────────────────────────────────────────────

@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(
    current_user: UserStaff = Depends(_get_current_staff),
) -> UserProfileResponse:
    return UserProfileResponse(
        id=str(current_user.id),
        full_name=current_user.full_name,
        email=current_user.email,
        role=current_user.role.value,
    )


@router.patch("/profile", response_model=UserProfileResponse)
async def update_profile(
    payload: UserProfileUpdate,
    current_user: UserStaff = Depends(_get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
) -> UserProfileResponse:
    # Password change validation
    if payload.new_password:
        if not payload.current_password:
            raise HTTPException(
                status_code=400,
                detail="Se requiere la contraseña actual para cambiar la contraseña",
            )
        if not verify_password(payload.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
        current_user.hashed_password = hash_password(payload.new_password)

    if payload.full_name is not None:
        current_user.full_name = payload.full_name

    if payload.email is not None:
        current_user.email = payload.email

    await db.commit()
    await db.refresh(current_user)

    return UserProfileResponse(
        id=str(current_user.id),
        full_name=current_user.full_name,
        email=current_user.email,
        role=current_user.role.value,
    )


# ─── Gym ─────────────────────────────────────────────────────────────────────

@router.get("/gym", response_model=GymSettingsResponse)
async def get_gym_settings(
    tenant: Tenant = Depends(_get_master_tenant),
) -> GymSettingsResponse:
    return GymSettingsResponse(
        name=tenant.name,
        phone=tenant.phone,
        address=tenant.address,
        city=tenant.city,
        logo_url=tenant.logo_url,
        plan=tenant.plan.value if tenant.plan else None,
    )


@router.patch("/gym", response_model=GymSettingsResponse)
async def update_gym_settings(
    payload: GymSettingsUpdate,
    current_user: UserStaff = Depends(_get_current_staff),
    credentials: HTTPAuthorizationCredentials = Depends(_security),
    master_db: AsyncSession = Depends(get_master_db),
) -> GymSettingsResponse:
    if current_user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Sin permisos suficientes")

    token_payload = decode_token(credentials.credentials)
    tenant_id = token_payload.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Token sin contexto de tenant")

    result = await master_db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Gym no encontrado")

    if payload.name is not None:
        tenant.name = payload.name
    if payload.phone is not None:
        tenant.phone = payload.phone
    if payload.address is not None:
        tenant.address = payload.address
    if payload.city is not None:
        tenant.city = payload.city
    if payload.logo_url is not None:
        tenant.logo_url = payload.logo_url

    await master_db.commit()
    await master_db.refresh(tenant)

    return GymSettingsResponse(
        name=tenant.name,
        phone=tenant.phone,
        address=tenant.address,
        city=tenant.city,
        logo_url=tenant.logo_url,
        plan=tenant.plan.value if tenant.plan else None,
    )


# ─── Notifications ────────────────────────────────────────────────────────────

_DEFAULT_PREFS = NotificationPreferences()


@router.get("/notifications", response_model=NotificationPreferences)
async def get_notification_prefs(
    current_user: UserStaff = Depends(_get_current_staff),
) -> NotificationPreferences:
    if not current_user.notification_prefs:
        return _DEFAULT_PREFS
    return NotificationPreferences(**current_user.notification_prefs)


@router.patch("/notifications", response_model=NotificationPreferences)
async def update_notification_prefs(
    payload: NotificationPreferences,
    current_user: UserStaff = Depends(_get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
) -> NotificationPreferences:
    current_user.notification_prefs = payload.model_dump()
    await db.commit()
    await db.refresh(current_user)
    return NotificationPreferences(**current_user.notification_prefs)
