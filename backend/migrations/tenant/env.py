import asyncio
import logging
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import context
from app.core.config import settings
from app.db.tenant_base import TenantBase
import app.models.tenant  # noqa: registers tenant models

config = context.config
# run_tenant_migrations inyecta la URL real de cada tenant vía set_main_option.
# Si no hay (uso directo del CLI), caer al template como fallback.
db_url = config.get_main_option("sqlalchemy.url") or \
    settings.tenant_database_url_template.replace("{db_name}", "gymdb_template")
config.set_main_option("sqlalchemy.url", db_url)

target_metadata = TenantBase.metadata

# Dentro de la app (arranque o alta de un gimnasio) el logging ya está configurado:
# fileConfig de alembic.ini pondría el raíz en WARN y se perderían los INFO de la app.
if config.config_file_name is not None and not logging.getLogger().handlers:
    # Ver la nota en migrations/env.py: con el default (True) este fileConfig deja
    # mudo al proceso entero, y los tenants se migran desde la app en caliente.
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
