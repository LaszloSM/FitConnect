import asyncio
import logging
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import context
from app.core.config import settings
from app.db.master_base import MasterBase
import app.models.master  # noqa: registers master models

config = context.config
db_url = settings.master_database_url
config.set_main_option("sqlalchemy.url", db_url)

target_metadata = MasterBase.metadata

# Dentro de la app (arranque o alta de un gimnasio) el logging ya está configurado:
# fileConfig de alembic.ini pondría el raíz en WARN y se perderían los INFO de la app.
if config.config_file_name is not None and not logging.getLogger().handlers:
    # disable_existing_loggers=False es obligatorio. En producción el backend corre
    # `alembic upgrade head` sobre este env al arrancar (app/db/migrate.py, con
    # RUN_MIGRATIONS_ON_STARTUP=true). Con el default (True), fileConfig apaga los
    # loggers ya configurados —uvicorn.access, uvicorn.error y los de la app— y el
    # proceso queda mudo el resto de su vida: así estuvo dos días sin registrar nada.
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
