from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession, AsyncEngine
from app.core.config import settings

# Cache de engines por connection string para no recrearlos en cada request.
# Dict (no lru_cache) para poder iterar y disponerlos (tests, shutdown).
_engines: dict[str, AsyncEngine] = {}


def get_tenant_engine(connection_string: str) -> AsyncEngine:
    engine = _engines.get(connection_string)
    if engine is None:
        engine = create_async_engine(
            connection_string, echo=False, pool_pre_ping=True, pool_size=5, max_overflow=10
        )
        _engines[connection_string] = engine
    return engine


async def dispose_tenant_engines() -> None:
    """Cierra todos los engines cacheados. Usado por tests (los engines quedan
    atados al event loop donde se crearon) y por el shutdown de la app."""
    for engine in _engines.values():
        await engine.dispose()
    _engines.clear()


async def get_tenant_db(db_name: str) -> AsyncGenerator[AsyncSession, None]:
    """Dependency para acceder a la DB de un tenant específico.
    Usar desde deps.py extrayendo db_name del JWT.
    """
    connection_string = settings.tenant_database_url_template.replace("{db_name}", db_name)
    engine = get_tenant_engine(connection_string)
    TenantSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    async with TenantSessionLocal() as session:
        yield session
