#!/usr/bin/env python3
"""Congela el esquema que se garantiza que TODO tenant desplegado ya tiene.

    python scripts/freeze_tenant_baseline.py

Este archivo NO es un test y no se corre solo. Genera los dos artefactos que usa
`tests/test_tenant_schema_drift.py` como referencia de "tenant viejo".

POR QUÉ EXISTE
--------------
Un tenant no se construye con migraciones: nace con `create_all` + `stamp head`, y
lo único que alcanza a un tenant YA CREADO es el DDL de `app/db/tenant_align.py`.
Eso significa que la referencia de "lo que ya está desplegado" no se puede derivar
del código: `create_all` describe un tenant nuevo, y el cuerpo de las migraciones es
código muerto para el fleet. Hay que congelarla.

CUÁNDO REGENERARLO
------------------
Solo después de correr `python migrate_tenants.py` sobre el fleet completo y
confirmar 0 fallos. Regenerar el baseline para poner un test en verde sin haber
alineado el fleet reintroduce exactamente el incidente del 9 de septiembre de 2026:
13 endpoints en 500 durante dos días porque a `gym_settings` le faltaban dos
columnas. El diff de estos archivos en un PR es la señal de alarma; por eso el
formato es legible.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import Enum  # noqa: E402
from sqlalchemy.dialects import postgresql  # noqa: E402
from sqlalchemy.schema import CreateIndex, CreateTable  # noqa: E402

from app.db.tenant_base import TenantBase  # noqa: E402
import app.models.tenant  # noqa: E402,F401  registra los modelos en el metadata

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"

HEADER = """-- GENERADO por scripts/freeze_tenant_baseline.py — no editar a mano.
--
-- Esquema congelado del fleet: lo que se garantiza que TODO tenant ya desplegado
-- tiene. Es la referencia de "tenant viejo" del test anti-drift.
--
-- Regenerar SOLO tras correr migrate_tenants.py sobre el fleet con 0 fallos.
-- Si lo regeneras para poner un test en verde, estás desactivando la única
-- defensa contra que un gym en producción se quede sin una columna.
"""


def main() -> None:
    dialect = postgresql.dialect()
    chunks: list[str] = [HEADER]
    columns: dict[str, list[str]] = {}

    # Los tipos enum van primero: CreateTable los referencia pero no los crea.
    enums: dict[str, list[str]] = {}
    for table in TenantBase.metadata.sorted_tables:
        for col in table.columns:
            tipo = col.type
            nombre = getattr(tipo, "name", None)
            if isinstance(tipo, Enum) and nombre:
                enums[nombre] = list(tipo.enums)
    for nombre in sorted(enums):
        valores = ", ".join(f"'{v}'" for v in enums[nombre])
        chunks.append(f"CREATE TYPE {nombre} AS ENUM ({valores});")

    for table in TenantBase.metadata.sorted_tables:
        chunks.append(str(CreateTable(table).compile(dialect=dialect)).strip() + ";")
        for index in sorted(table.indexes, key=lambda i: i.name or ""):
            chunks.append(str(CreateIndex(index).compile(dialect=dialect)).strip() + ";")
        columns[table.name] = [c.name for c in table.columns]

    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "tenant_baseline.sql").write_text("\n\n".join(chunks) + "\n", encoding="utf-8")
    (FIXTURES / "tenant_baseline.json").write_text(
        json.dumps(columns, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    total = sum(len(c) for c in columns.values())
    print(f"Baseline congelado: {len(columns)} tablas, {total} columnas")
    print(f"  {FIXTURES / 'tenant_baseline.sql'}")
    print(f"  {FIXTURES / 'tenant_baseline.json'}")


if __name__ == "__main__":
    main()
