import re
import uuid
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from alembic.config import Config
from alembic import command
from app.core.config import settings
from app.core.security import hash_password
from app.db.master_session import master_engine, MasterSessionLocal
from app.db.tenant_session import get_tenant_engine
from app.db.tenant_base import TenantBase
from app.models.master.tenant import Tenant, TenantStatus, SubscriptionPlan
from app.models.master.owner import Owner
from app.models.master.staff_directory import StaffDirectory
from app.models.tenant.user_staff import UserStaff, UserRole
from sqlalchemy import select, text


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}-{uuid.uuid4().hex[:6]}"


def get_tenant_db_name(gym_name: str) -> str:
    """Genera un nombre único de base de datos para el tenant."""
    slug = re.sub(r"[^a-z0-9]+", "_", gym_name.lower()).strip("_")
    return f"gym_{slug}_{uuid.uuid4().hex[:6]}"


def get_tenant_connection_string(db_name: str) -> str:
    """Genera el connection string completo para una tenant DB."""
    return settings.tenant_database_url_template.replace("{db_name}", db_name)


async def create_database(db_name: str) -> None:
    """Crea la base de datos física en PostgreSQL."""
    # Conectar a la DB 'postgres' para poder crear una nueva DB
    # En producción usar master DB o postgres default
    base_url = settings.master_database_url.rsplit("/", 1)[0] + "/postgres"
    engine = create_async_engine(base_url, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        # Verificar si ya existe
        result = await conn.execute(text(f"SELECT 1 FROM pg_database WHERE datname = '{db_name}'"))
        if not result.scalar_one_or_none():
            await conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    await engine.dispose()


async def run_tenant_migrations(db_name: str) -> None:
    """Ejecuta Alembic migrations en la tenant DB."""
    connection_string = get_tenant_connection_string(db_name)
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", connection_string)
    # Usar el script de migraciones de tenant
    alembic_cfg.set_main_option("script_location", "migrations/tenant")
    
    # Alembic command upgrade es síncrono, lo ejecutamos en executor
    def _upgrade():
        command.upgrade(alembic_cfg, "head")
    
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _upgrade)


async def create_tenant(owner_email: str, gym_name: str, city: str, owner_full_name: str, password: str) -> Tenant:
    """Flujo completo de creación de tenant:
    1. Crea Owner en Master DB
    2. Crea Tenant en Master DB (con db_name y connection_string)
    3. Crea DB física PostgreSQL
    4. Corre Alembic tenant migrations
    5. Crea UserStaff (owner) en Tenant DB
    """
    db_name = get_tenant_db_name(gym_name)
    connection_string = get_tenant_connection_string(db_name)
    
    async with MasterSessionLocal() as master_db:
        # 1. Crear Owner en Master DB (sin tenant_id inicialmente)
        owner = Owner(
            email=owner_email,
            hashed_password=hash_password(password),
            full_name=owner_full_name,
        )
        master_db.add(owner)
        await master_db.flush()
        
        # 2. Crear Tenant en Master DB
        tenant = Tenant(
            name=gym_name,
            slug=slugify(gym_name),
            db_name=db_name,
            db_connection_string=connection_string,
            city=city,
            plan=SubscriptionPlan.basic,
            status=TenantStatus.active,
        )
        master_db.add(tenant)
        await master_db.flush()
        
        # Asociar owner con tenant
        owner.tenant_id = tenant.id
        await master_db.commit()
        await master_db.refresh(tenant)
        await master_db.refresh(owner)
    
    # 3. Crear DB física
    await create_database(db_name)
    
    # 4. Crear tablas en tenant DB (create_all refleja el estado actual de los
    # modelos) y stampear Alembic en head para que las migraciones futuras
    # apliquen limpio sin DuplicateColumnError.
    tenant_engine = create_async_engine(connection_string)
    async with tenant_engine.begin() as conn:
        await conn.run_sync(TenantBase.metadata.create_all)
    await tenant_engine.dispose()

    def _stamp_head():
        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", connection_string)
        alembic_cfg.set_main_option("script_location", "migrations/tenant")
        command.stamp(alembic_cfg, "head")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _stamp_head)
    
    # 5. Crear UserStaff (owner) en Tenant DB
    tenant_engine = create_async_engine(connection_string)
    TenantSessionLocal = async_sessionmaker(tenant_engine, expire_on_commit=False)
    async with TenantSessionLocal() as tenant_db:
        staff_owner = UserStaff(
            email=owner_email,
            hashed_password=hash_password(password),
            full_name=owner_full_name,
            role=UserRole.owner,
        )
        tenant_db.add(staff_owner)
        await tenant_db.commit()
        await tenant_db.refresh(staff_owner)
        staff_owner_id = staff_owner.id
    await tenant_engine.dispose()

    # 6. Registrar al owner en el índice global staff_directory (login de staff)
    async with MasterSessionLocal() as master_db:
        master_db.add(StaffDirectory(
            email=owner_email,
            tenant_id=tenant.id,
            db_name=db_name,
            staff_id=staff_owner_id,
        ))
        await master_db.commit()

    return tenant
