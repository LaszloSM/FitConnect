"""Gate de migraciones tenant.

Contrato (ver docs/TENANT_MIGRATIONS.md): un tenant NO se construye corriendo la
cadena de migraciones desde cero — nace con `TenantBase.metadata.create_all`
(esquema completo de los modelos) + `alembic stamp head`. Por eso toda migración
tenant nueva debe ser IDEMPOTENTE (CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN
IF NOT EXISTS): de lo contrario, el upgrade del fleet choca con DuplicateColumn/
DuplicateTable sobre el esquema que create_all ya creó.

Este test reproduce ese choque potencial: create_all (esquema completo) + stamp en
la revisión ANTERIOR a head + upgrade head. Si la última migración aplica limpio,
es idempotente. Si alguien agrega una migración con `ADD COLUMN` (sin IF NOT
EXISTS), este test la atrapa.
"""
import asyncio
import uuid

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.tenant_base import TenantBase
import app.models.tenant  # noqa: F401  registra los modelos en TenantBase.metadata


def _tenant_cfg(url: str) -> Config:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    cfg.set_main_option("script_location", "migrations/tenant")
    return cfg


def _admin_url() -> str:
    return settings.master_database_url.rsplit("/", 1)[0] + "/postgres"


async def _exec_admin(sql: str) -> None:
    engine = create_async_engine(_admin_url(), isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(text(sql))
    await engine.dispose()


async def _create_all(url: str) -> None:
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(TenantBase.metadata.create_all)
    await engine.dispose()


async def test_new_tenant_migration_is_idempotent_over_create_all():
    name = f"gym_migtest_{uuid.uuid4().hex[:8]}"
    url = settings.tenant_database_url_template.replace("{db_name}", name)
    cfg = _tenant_cfg(url)
    script = ScriptDirectory.from_config(cfg)
    head = script.get_current_head()
    prev = script.get_revision(head).down_revision
    assert prev, "se esperaba más de una migración tenant para probar la última"

    loop = asyncio.get_event_loop()
    await _exec_admin(f'CREATE DATABASE "{name}"')
    try:
        await _create_all(url)
        # Stampear en la revisión anterior y subir: aplica SOLO la última
        # migración sobre un esquema que create_all ya dejó completo.
        await loop.run_in_executor(None, lambda: command.stamp(cfg, prev))
        await loop.run_in_executor(None, lambda: command.upgrade(cfg, "head"))
    finally:
        await _exec_admin(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
