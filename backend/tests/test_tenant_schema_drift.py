"""Blindaje anti-drift del fleet de tenants.

Un tenant YA EXISTENTE nunca ejecuta el cuerpo de las migraciones: lo único que le
llega es `create_all` (que no altera tablas existentes) + el DDL de
`app/db/tenant_align.py`. Ver `migrate_tenants.py`.

De ahí el incidente del 9 de septiembre de 2026: dos migraciones agregaron columnas
a `gym_settings` sin registrarlas en el aligner, la DB del gym en producción se
quedó sin ellas y 13 endpoints devolvieron 500 durante dos días.

Estos tests reproducen el camino real de alineación sobre el esquema congelado del
fleet (`tests/fixtures/tenant_baseline.sql`) y exigen que el resultado sea
indistinguible de un tenant recién creado.

Nota de diseño: NO sirve reconstruir el "tenant viejo" corriendo la cadena de
migraciones desde cero — esas migraciones sí existen y corren limpias sobre una DB
vacía, así que el test saldría verde sobre el incidente exacto que previene. El
problema es que a un tenant real nunca lo tocan.
"""
import json
import pathlib
import re
import uuid

from sqlalchemy import inspect as sa_inspect
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.tenant_align import ALIGN_STATEMENTS
from app.db.tenant_base import TenantBase
import app.models.tenant  # noqa: F401  registra los modelos en el metadata

from tests.test_tenant_migrations import _create_all, _drop_db, _exec_admin

FIXTURES = pathlib.Path(__file__).parent / "fixtures"

_ADD_COLUMN = re.compile(
    r"ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)", re.IGNORECASE
)
_CREATE_TABLE = re.compile(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)", re.IGNORECASE)

_AYUDA = (
    "\n\nRegistra el DDL idempotente en app/db/tenant_align.py "
    "(ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...) y úsalo también en el cuerpo de "
    "tu migración. Sin eso, la columna llega a los gyms nuevos pero NUNCA a los que "
    "ya están en producción."
)


def _aligner_coverage() -> tuple[set[tuple[str, str]], set[str]]:
    """Columnas y tablas que el aligner sí sabe crear en un tenant existente."""
    columnas: set[tuple[str, str]] = set()
    tablas: set[str] = set()
    for stmt in ALIGN_STATEMENTS:
        for tabla, col in _ADD_COLUMN.findall(stmt):
            columnas.add((tabla.lower(), col.lower()))
        for tabla in _CREATE_TABLE.findall(stmt):
            tablas.add(tabla.lower())
    return columnas, tablas


def test_align_statements_cover_new_columns():
    """Rápido y sin DB: toda columna nueva respecto al baseline debe estar cubierta."""
    baseline = json.loads((FIXTURES / "tenant_baseline.json").read_text(encoding="utf-8"))
    cubiertas, tablas_nuevas = _aligner_coverage()

    drift: list[str] = []
    for table in TenantBase.metadata.sorted_tables:
        columnas_base = baseline.get(table.name)
        if columnas_base is None or table.name.lower() in tablas_nuevas:
            # Tabla nueva: create_all la crea entera también en un tenant viejo.
            continue
        for col in table.columns:
            if col.name in columnas_base:
                continue
            if (table.name.lower(), col.name.lower()) in cubiertas:
                continue
            drift.append(f"{table.name}.{col.name}")

    assert not drift, (
        "Columnas nuevas sin DDL registrado en app/db/tenant_align.py: "
        + ", ".join(drift)
        + _AYUDA
    )


def _snapshot(sync_conn) -> dict:
    insp = sa_inspect(sync_conn)
    out: dict = {}
    for table in sorted(insp.get_table_names()):
        if table == "alembic_version":
            continue
        out[table] = {
            "columns": {
                c["name"]: (str(c["type"]), bool(c["nullable"]))
                for c in insp.get_columns(table)
            },
            "indexes": sorted(
                (ix["name"], tuple(ix["column_names"]), bool(ix["unique"]))
                for ix in insp.get_indexes(table)
            ),
        }
    return out


async def _read_schema(url: str) -> dict:
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        snap = await conn.run_sync(_snapshot)
    await engine.dispose()
    return snap


async def _run_script(url: str, sql: str) -> None:
    # Los comentarios se quitan por línea ANTES de partir por ';': el encabezado no
    # lleva punto y coma, así que si no, se traga la primera sentencia con él.
    cuerpo = "\n".join(
        line for line in sql.splitlines() if not line.strip().startswith("--")
    )
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        for stmt in [s.strip() for s in cuerpo.split(";") if s.strip()]:
            await conn.execute(text(stmt))
    await engine.dispose()


async def _apply_align(url: str) -> None:
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        for stmt in ALIGN_STATEMENTS:
            await conn.execute(text(stmt))
    await engine.dispose()


async def test_existing_tenant_reaches_current_schema():
    """La red de seguridad: además de columnas, atrapa índices, tipos y nullability,
    y comprueba que el DDL registrado en el aligner REALMENTE ejecuta (un typo en
    ALIGN_STATEMENTS hoy no lo detecta nadie hasta correrlo en producción)."""
    suffix = uuid.uuid4().hex[:8]
    viejo, nuevo = f"gym_drift_old_{suffix}", f"gym_drift_new_{suffix}"
    tpl = settings.tenant_database_url_template
    url_viejo, url_nuevo = tpl.replace("{db_name}", viejo), tpl.replace("{db_name}", nuevo)

    await _exec_admin(f'CREATE DATABASE "{viejo}"')
    await _exec_admin(f'CREATE DATABASE "{nuevo}"')
    try:
        # Tenant ya desplegado: esquema congelado + el camino real de migrate_tenants.py
        await _run_script(url_viejo, (FIXTURES / "tenant_baseline.sql").read_text(encoding="utf-8"))
        await _create_all(url_viejo)
        await _apply_align(url_viejo)
        # Tenant recién creado: como lo bootstrapea tenant_service.py
        await _create_all(url_nuevo)

        antiguo = await _read_schema(url_viejo)
        actual = await _read_schema(url_nuevo)
    finally:
        await _drop_db(viejo)
        await _drop_db(nuevo)

    # Comparación asimétrica a propósito: solo importa lo que le FALTA al tenant
    # viejo. Lo que le sobra (residuos históricos) no rompe nada.
    faltantes: list[str] = []
    for tabla, spec in actual.items():
        if tabla not in antiguo:
            faltantes.append(f"{tabla}: la tabla entera no existe en un tenant desplegado")
            continue
        for col, meta in spec["columns"].items():
            if col not in antiguo[tabla]["columns"]:
                faltantes.append(f"{tabla}.{col} ({meta[0]}, nullable={meta[1]})")
        for ix in spec["indexes"]:
            if ix not in antiguo[tabla]["indexes"]:
                faltantes.append(f"{tabla}: falta el índice {ix[0]}")

    assert not faltantes, (
        "SCHEMA DRIFT — esto existe en un tenant NUEVO pero jamás llegará a uno YA "
        "DESPLEGADO:\n  - " + "\n  - ".join(faltantes) + _AYUDA
    )
