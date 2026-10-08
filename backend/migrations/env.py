import asyncio
import logging
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import context
from app.core.config import settings
from app.db.master_base import MasterBase
from app.db.tenant_base import TenantBase
import app.models.master  # noqa: registers master models
import app.models.tenant  # noqa: registers tenant models

config = context.config

# Determine which migrations we're running based on alembic.ini script_location
script_location = config.get_main_option("script_location", "")
if "master" in script_location:
    target_metadata = MasterBase.metadata
    db_url = settings.master_database_url
else:
    target_metadata = TenantBase.metadata
    db_url = settings.tenant_database_url_template.replace("{db_name}", "gymdb_template")

config.set_main_option("sqlalchemy.url", db_url)

# Dentro de la app (arranque o alta de un gimnasio) el logging ya está configurado:
# fileConfig de alembic.ini pondría el raíz en WARN y se perderían los INFO de la app.
if config.config_file_name is not None and not logging.getLogger().handlers:
    # disable_existing_loggers=False es obligatorio: el arranque de la app corre
    # `alembic upgrade head` en proceso (app/db/migrate.py). Con el default (True),
    # fileConfig apaga los loggers ya configurados —uvicorn.access, uvicorn.error y
    # los de la app— y el backend queda mudo el resto de su vida.
    fileConfig(config.config_file_name, disable_existing_loggers=False)


def run_migrations_offline():
    context.configure(url=db_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    engine = create_async_engine(db_url)
    async with engine.begin() as conn:
        await conn.run_sync(do_run_migrations)
    await engine.dispose()


def run_migrations_online():
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
