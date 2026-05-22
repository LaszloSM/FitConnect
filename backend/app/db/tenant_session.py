from collections.abc import AsyncGenerator
from functools import lru_cache
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

# Cache de engines por connection string para no recrearlos en cada request
@lru_cache(maxsize=32)
def get_tenant_engine(connection_string: str):
    return create_async_engine(connection_string, echo=False, pool_pre_ping=True, pool_size=5, max_overflow=10)


async def get_tenant_db(db_name: str) -> AsyncGenerator[AsyncSession, None]:
    """Dependency para acceder a la DB de un tenant específico.
    Usar desde deps.py extrayendo db_name del JWT.
    """
    connection_string = settings.tenant_database_url_template.replace("{db_name}", db_name)
    engine = get_tenant_engine(connection_string)
    TenantSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    async with TenantSessionLocal() as session:
        yield session
