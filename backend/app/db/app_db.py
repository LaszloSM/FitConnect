"""Sesión de la base `fitconnect_app` (datos personales de la app).

La base y sus tablas se crean solas la primera vez que se usan en el proceso.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.tenant_session import get_tenant_engine
from app.models.app import AppBase

#: Columnas agregadas después de creada la tabla (create_all no altera tablas).
#: Literalmente equivalentes a lo que generaría create_all.
ALIGN_STATEMENTS: list[str] = [
    "ALTER TABLE app_profiles ADD COLUMN IF NOT EXISTS pace VARCHAR(20)",
    "ALTER TABLE app_profiles ADD COLUMN IF NOT EXISTS water_goal_ml INTEGER",
    "ALTER TABLE foods ADD COLUMN IF NOT EXISTS ref_key VARCHAR(80)",
    "ALTER TABLE foods ADD COLUMN IF NOT EXISTS category VARCHAR(40)",
    "ALTER TABLE foods ADD COLUMN IF NOT EXISTS synonyms JSONB NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE foods ADD COLUMN IF NOT EXISTS nutrients JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE foods ADD COLUMN IF NOT EXISTS search_text TEXT",
    "ALTER TABLE foods ADD COLUMN IF NOT EXISTS origin TEXT",
    "ALTER TABLE foods ALTER COLUMN origin TYPE TEXT",
    "ALTER TABLE foods ADD COLUMN IF NOT EXISTS components JSONB",
    "ALTER TABLE foods ADD COLUMN IF NOT EXISTS data_version INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE foods ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE",
    "CREATE UNIQUE INDEX IF NOT EXISTS foods_ref_key_key ON foods (ref_key)",
    "ALTER TABLE meal_entries ADD COLUMN IF NOT EXISTS fiber_g NUMERIC(6, 1) NOT NULL DEFAULT 0",
    "ALTER TABLE meal_entries ADD COLUMN IF NOT EXISTS nutrients JSONB NOT NULL DEFAULT '{}'::jsonb",
    # La búsqueda es `search_text LIKE '%x%'`: con decenas de miles de productos
    # empacados solo escala con un índice de trigramas.
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE INDEX IF NOT EXISTS foods_search_trgm ON foods USING gin (search_text gin_trgm_ops)",
]

_ready = False
_lock: asyncio.Lock | None = None


def _url() -> str:
    return settings.tenant_database_url_template.replace("{db_name}", settings.app_database_name)


async def _ensure() -> None:
    global _ready, _lock
    if _ready:
        return
    if _lock is None:
        _lock = asyncio.Lock()
    async with _lock:
        if _ready:
            return
        name = settings.app_database_name
        admin = create_async_engine(settings.master_database_url.rsplit("/", 1)[0] + "/postgres",
                                    isolation_level="AUTOCOMMIT")
        try:
            async with admin.connect() as conn:
                exists = (await conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": name})).first()
                if not exists:
                    await conn.execute(text(f'CREATE DATABASE "{name}"'))
        finally:
            await admin.dispose()
        async with get_tenant_engine(_url()).begin() as conn:
            await conn.run_sync(AppBase.metadata.create_all)
            for stmt in ALIGN_STATEMENTS:
                await conn.execute(text(stmt))
        from app.services.foods import seed_packaged, seed_reference
        async with async_sessionmaker(get_tenant_engine(_url()), expire_on_commit=False)() as session:
            await seed_reference(session)
            await seed_packaged(session)
        _ready = True


@asynccontextmanager
async def app_session() -> AsyncIterator[AsyncSession]:
    await _ensure()
    async with async_sessionmaker(get_tenant_engine(_url()), expire_on_commit=False)() as session:
        yield session
