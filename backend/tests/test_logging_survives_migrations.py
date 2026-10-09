"""Correr migraciones dentro de la app no puede apagar los logs INFO.

El alta de un gimnasio migra su base en caliente; antes, el fileConfig de
alembic.ini dejaba el logger raíz en WARN y desde ahí el backend no registraba
nada de la app (solo uvicorn, que tiene sus propios handlers)."""
import logging

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.core.logging import setup_logging


def test_loading_an_alembic_env_keeps_the_app_logging(monkeypatch):
    setup_logging("INFO")
    before = list(logging.getLogger().handlers)
    cfg = Config("alembic.ini")
    cfg.set_main_option("script_location", "migrations/master")
    from alembic.runtime.environment import EnvironmentContext
    script = ScriptDirectory.from_config(cfg)
    with EnvironmentContext(cfg, script, fn=lambda rev, ctx: [], as_sql=True, destination_rev="head",
                            starting_rev="base"):
        script.run_env()
    assert logging.getLogger().level == logging.INFO
    assert logging.getLogger().handlers == before
