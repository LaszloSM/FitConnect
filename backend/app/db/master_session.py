from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

master_engine = create_async_engine(settings.master_database_url, echo=False, pool_pre_ping=True)
MasterSessionLocal = async_sessionmaker(master_engine, expire_on_commit=False)


async def get_master_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency para acceder a la Master DB (tenants, owners, billing)."""
    async with MasterSessionLocal() as session:
        yield session
