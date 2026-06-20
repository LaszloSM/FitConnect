from collections.abc import AsyncGenerator
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from jose import JWTError

from app.core.security import decode_token
from app.core.config import settings
from app.db.master_session import get_master_db
from app.db.tenant_session import get_tenant_engine
from app.models.master.owner import Owner
from app.models.tenant.user_staff import UserStaff, UserRole
from app.models.master.tenant import Tenant, TenantStatus
from sqlalchemy import select

security = HTTPBearer()


async def get_current_owner(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_master_db),
) -> Owner:
    """Valida el JWT contra la Master DB (Owner). Retorna el Owner autenticado."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    result = await db.execute(select(Owner).where(Owner.id == payload["sub"]))
    owner = result.scalar_one_or_none()
    if not owner or not owner.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    return owner


async def get_master_tenant(
    current_owner: Owner = Depends(get_current_owner),
    db: AsyncSession = Depends(get_master_db),
) -> Tenant:
    """Obtiene el Tenant desde la Master DB usando el owner autenticado."""
    if not current_owner.tenant_id:
        raise HTTPException(status_code=404, detail="Owner no tiene gym asignado")
    result = await db.execute(select(Tenant).where(Tenant.id == current_owner.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return tenant


async def get_tenant_db_from_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AsyncGenerator[AsyncSession, None]:
    """Dependency que abre una sesión en la DB del tenant según el JWT.
    Yield la sesión para que FastAPI la cierre después de completar la request.
    """
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    db_name = payload.get("db_name")
    if not db_name:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sin contexto de tenant")

    connection_string = settings.tenant_database_url_template.replace("{db_name}", db_name)
    engine = get_tenant_engine(connection_string)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session


async def get_db_name(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Extrae el db_name del JWT (staff u owner) — para publicar eventos por tenant."""
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    db_name = payload.get("db_name")
    if not db_name:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sin contexto de tenant")
    return db_name


async def get_kiosk_payload(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Valida el token de dispositivo kiosko (scope=kiosk; exp validado por
    decode_token, renovable en /kiosk/ping)."""
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    if payload.get("scope") != "kiosk" or not payload.get("db_name") or not payload.get("device_id"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de kiosko inválido")
    return payload


async def get_kiosk_db(
    payload: dict = Depends(get_kiosk_payload),
) -> AsyncGenerator[AsyncSession, None]:
    """Sesión de tenant para el kiosko, verificando que el dispositivo siga activo
    (revocación inmediata vía kiosk_devices.is_active)."""
    from app.models.tenant.kiosk_device import KioskDevice

    connection_string = settings.tenant_database_url_template.replace("{db_name}", payload["db_name"])
    engine = get_tenant_engine(connection_string)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        device = (await session.execute(
            select(KioskDevice).where(
                KioskDevice.id == payload["device_id"],
                KioskDevice.token_jti == payload.get("jti", ""),
            )
        )).scalar_one_or_none()
        if not device or not device.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Dispositivo revocado o no registrado")
        yield session


async def get_current_staff(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_tenant_db_from_token),
) -> UserStaff:
    """Valida el JWT contra la Tenant DB (UserStaff). Retorna el staff del gym."""
    token = credentials.credentials
    payload = decode_token(token)

    staff_id = payload.get("staff_id")
    if not staff_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sin identidad de staff",
        )

    result = await db.execute(select(UserStaff).where(UserStaff.id == staff_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado en el gym")
    return user


def require_role(*roles: UserRole):
    async def checker(current_user: UserStaff = Depends(get_current_staff)):
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos suficientes")
        return current_user
    return checker


def check_tenant_active(tenant: Tenant = Depends(get_master_tenant)):
    if tenant.status == TenantStatus.suspended:
        raise HTTPException(status_code=403, detail="Cuenta suspendida")
    return tenant


async def get_tenant_slug(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    master_db: AsyncSession = Depends(get_master_db),
) -> str:
    """Resuelve el slug del tenant desde el db_name del JWT (lo necesita Wompi
    para construir la reference; sirve a owner y staff por igual)."""
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    db_name = payload.get("db_name")
    if not db_name:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sin contexto de tenant")
    tenant = (await master_db.execute(
        select(Tenant).where(Tenant.db_name == db_name)
    )).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return tenant.slug
