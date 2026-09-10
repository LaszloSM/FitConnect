# Migraciones multi-tenant — contrato

FitConnect tiene dos clases de base de datos con estrategias **distintas**:

- **Master DB** (`gymdb_master`): es **migration-driven**. El esquema se construye y
  evoluciona con la cadena de Alembic (`migrations/master`). `alembic upgrade head`
  sobre una Master vacía la construye desde cero.
- **Tenant DBs** (una por gimnasio, `gym_*`): el esquema lo **bootstrapea
  `TenantBase.metadata.create_all`** (los modelos actuales), NO la cadena de
  migraciones. Ver `app/services/tenant_service.py`.

## Por qué los tenants usan create_all + stamp

Cuando nace un tenant (`create_tenant`):

1. `CREATE DATABASE`
2. `TenantBase.metadata.create_all` → crea TODO el esquema según los modelos.
3. `alembic stamp head` → marca la contabilidad de Alembic como "al día", sin
   correr el cuerpo de ninguna migración.

Consecuencia: la cadena de migraciones tenant **no es ejecutable desde cero**
(la primera migración asume que `users` ya existe, etc.). Esto es intencional;
no intentes `alembic upgrade head` sobre una tenant DB vacía.

## Reglas para migraciones tenant nuevas

Como el esquema lo crea `create_all` y las DBs viven en distintos estados de
drift, **toda migración tenant nueva debe ser idempotente**:

- `CREATE TABLE ... IF NOT EXISTS` (o `op.create_table` con check) / `sa` con
  `checkfirst`.
- `ADD COLUMN ... IF NOT EXISTS`.
- `CREATE INDEX ... IF NOT EXISTS`.
- Secuencias e índices parciales: ligarlos también a `TenantBase.metadata`
  (`Sequence(..., metadata=TenantBase.metadata)`) para que `create_all` los cree
  en tenants nuevos, además de declararlos en la migración.

El gate `backend/tests/test_tenant_migrations.py` reproduce el choque: hace
`create_all` (esquema completo) + `stamp <revisión anterior a head>` + `upgrade
head`. Si la última migración no es idempotente, el test falla con
DuplicateColumn/DuplicateTable.

## Alinear el fleet de tenants existentes

`backend/migrate_tenants.py` reconcilia TODAS las tenant DBs registradas:

- Por tenant: `create_all` (idempotente, no toca lo existente) + `stamp head`.
- **Nunca** `upgrade` sobre drift (replayaría migraciones cuyo efecto ya existe).
- Aislado por tenant: un tenant roto no tumba el resto; reporta OK/FAIL por DB.

Uso (dentro del contenedor backend):

```bash
python migrate_tenants.py
```

## Master DB: cuidado con el drift en dev

La Master sí es migration-driven, pero el dev DB puede driftar (su
`alembic_version` quedó atrás aunque el esquema ya tenga la columna). Si
`alembic upgrade head` choca con DuplicateColumn: `alembic stamp <rev_donde_está
el esquema>` y luego `alembic upgrade head`.

## El baseline congelado y el test anti-drift

Tras el incidente del 9 de septiembre de 2026 (13 endpoints en 500 durante dos días
porque dos migraciones agregaron columnas a `gym_settings` sin registrarlas en
`tenant_align.py`), el contrato está protegido por
`backend/tests/test_tenant_schema_drift.py`.

La referencia de "lo que un tenant ya desplegado tiene" no se puede derivar del
código: `create_all` describe un tenant **nuevo**, y el cuerpo de las migraciones es
código muerto para el fleet. Por eso se congela en
`backend/tests/fixtures/tenant_baseline.sql` (y su `.json`).

Los dos tests:

- **Estático**: cruza las columnas de los modelos contra el baseline y contra
  `ALIGN_STATEMENTS`. Falla en milisegundos con el nombre de la columna huérfana.
- **Dinámico**: monta un "tenant viejo" (baseline + `create_all` + `ALIGN_STATEMENTS`,
  el camino exacto de `migrate_tenants.py`) y un "tenant nuevo" (`create_all`), y
  compara los esquemas. Atrapa además índices, tipos y nullability, y comprueba que
  el DDL del aligner **realmente ejecuta**.

### Regla de regeneración

```bash
python scripts/freeze_tenant_baseline.py
```

**Solo se regenera después de correr `migrate_tenants.py` sobre el fleet completo y
confirmar 0 fallos.** Regenerarlo para poner un test en verde sin haber alineado el
fleet reintroduce el incidente: el test deja de ver la columna que falta en
producción. El diff de `tests/fixtures/` en un PR es la señal de alarma y debe
revisarse siempre.

### Al agregar una columna a un modelo tenant

1. Migración con DDL idempotente (`ADD COLUMN IF NOT EXISTS`).
2. Registrar esas mismas sentencias en un bloque de `app/db/tenant_align.py` e
   incluirlo en `ALIGN_STATEMENTS`.
3. Correr los tests: si pasan, la columna llegará también a los gyms existentes.
