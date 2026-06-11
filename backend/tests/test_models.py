import os
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.db.master_base import MasterBase
from app.db.tenant_base import TenantBase
from app.models.master.tenant import Tenant, SubscriptionPlan, TenantStatus
from app.models.tenant import UserStaff, UserRole, Location

TEST_DB_URL = os.environ.get(
    "TEST_DB_URL",
    "postgresql+asyncpg://gymuser:gympass@localhost:5432/gymdb_test"
)


def _session_fixture(metadata):
    @pytest_asyncio.fixture
    async def db_session():
        engine = create_async_engine(TEST_DB_URL)
        async with engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        session = session_factory()
        try:
            yield session
        finally:
            # Cerrar la sesión ANTES del drop: refresh/select dejan una
            # transacción abierta cuyos locks bloquean DROP TABLE para siempre.
            await session.close()
            async with engine.begin() as conn:
                await conn.run_sync(metadata.drop_all)
            await engine.dispose()
    return db_session


master_session = _session_fixture(MasterBase.metadata)
tenant_session = _session_fixture(TenantBase.metadata)


async def test_tenant_creation(master_session):
    tenant = Tenant(
        name="FitPlace",
        slug="fitplace-abc123",
        db_name="gym_fitplace_test",
        db_connection_string="postgresql+asyncpg://x:y@db:5432/gym_fitplace_test",
        plan=SubscriptionPlan.basic,
    )
    master_session.add(tenant)
    await master_session.commit()
    await master_session.refresh(tenant)
    assert tenant.id is not None
    assert tenant.status == TenantStatus.active
    assert tenant.created_at is not None


async def test_user_staff_creation(tenant_session):
    user = UserStaff(
        email="owner@fitplace.com",
        hashed_password="hashed",
        full_name="Carlos",
        role=UserRole.owner,
    )
    tenant_session.add(user)
    await tenant_session.commit()
    await tenant_session.refresh(user)
    assert user.id is not None
    assert user.is_active is True


async def test_location_creation(tenant_session):
    loc = Location(
        name="Sede Principal",
        address="Calle 10 #5-20, Riohacha",
        max_capacity=150,
    )
    tenant_session.add(loc)
    await tenant_session.commit()
    await tenant_session.refresh(loc)
    assert loc.id is not None
    assert loc.is_active is True
