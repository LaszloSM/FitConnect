import logging
from collections.abc import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.master_session import MasterSessionLocal
from app.models.master.tenant import Tenant, TenantStatus

logger = logging.getLogger(__name__)

TenantFn = Callable[[AsyncSession, Tenant], Awaitable[None]]


async def for_each_tenant(fn: TenantFn) -> None:
    """Ejecuta fn(session, tenant) sobre cada tenant activo, cada uno en su
    propia sesión/transacción. Un tenant que falle no rompe el resto."""
    async with MasterSessionLocal() as master_db:
        result = await master_db.execute(
            select(Tenant).where(Tenant.status != TenantStatus.suspended)
        )
        tenants = result.scalars().all()

    for tenant in tenants:
        connection_string = settings.tenant_database_url_template.replace(
            "{db_name}", tenant.db_name
        )
        # Engine desechable sin pool: el cache de engines del request-path
        # acumularía un pool por tenant y agota las conexiones de Postgres
        # cuando hay muchos tenants.
        engine = create_async_engine(connection_string, poolclass=NullPool)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with session_factory() as session:
                await fn(session, tenant)
        except Exception:
            logger.exception("Job falló para tenant %s (%s)", tenant.slug, tenant.db_name)
        finally:
            await engine.dispose()
