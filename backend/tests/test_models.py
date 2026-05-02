import os
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.db.base import Base
from app.models.tenant import Tenant, SubscriptionPlan, TenantStatus
from app.models.user import User, UserRole
from app.models.location import Location

TEST_DB_URL = os.environ.get(
    "TEST_DB_URL",
    "postgresql+asyncpg://gymuser:gympass@localhost:5432/gymdb_test"
)


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        try:
            yield session
        finally:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
            await engine.dispose()


async def test_tenant_creation(db_session):
    tenant = Tenant(name="FitPlace", slug="fitplace-abc123", plan=SubscriptionPlan.basic)
    db_session.add(tenant)
    await db_session.commit()
    await db_session.refresh(tenant)
    assert tenant.id is not None
    assert tenant.status == TenantStatus.active
    assert tenant.created_at is not None


async def test_user_creation(db_session):
    tenant = Tenant(name="FitPlace", slug="fitplace-xyz789")
    db_session.add(tenant)
    await db_session.flush()

    user = User(
        tenant_id=tenant.id,
        email="owner@fitplace.com",
        hashed_password="hashed",
        full_name="Carlos",
        role=UserRole.owner,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    assert user.id is not None
    assert user.tenant_id == tenant.id


async def test_location_creation(db_session):
    tenant = Tenant(name="FitPlace", slug="fitplace-loc001")
    db_session.add(tenant)
    await db_session.flush()

    loc = Location(
        tenant_id=tenant.id,
        name="Sede Principal",
        address="Calle 10 #5-20, Riohacha",
        max_capacity=150,
    )
    db_session.add(loc)
    await db_session.commit()
    await db_session.refresh(loc)
    assert loc.id is not None
    assert loc.is_active is True
