import os
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.main import app
from app.core.rate_limit import limiter
from app.db.base import Base
from app.db.session import get_db

# La suite completa hace decenas de register/login en segundos; sin esto el
# rate limit de /auth (5/min) tumba en cascada los últimos archivos de test.
limiter.enabled = False

TEST_DATABASE_URL = os.environ.get(
    "TEST_DB_URL",
    "postgresql+asyncpg://gymuser:gympass@localhost:5432/gymdb_test"
)

test_engine = create_async_engine(TEST_DATABASE_URL)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture(autouse=True)
async def _dispose_tenant_engines():
    """Los engines tenant quedan atados al event loop del test que los creó;
    sin esto, el siguiente test que reutilice el mismo tenant revienta con
    'Event loop is closed'."""
    yield
    from app.db.tenant_session import dispose_tenant_engines
    from app.db.master_session import master_engine
    await dispose_tenant_engines()
    await master_engine.dispose()


@pytest_asyncio.fixture
async def client(setup_db):
    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
