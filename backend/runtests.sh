#!/usr/bin/env bash
# Corre la suite contra los contenedores de infraestructura (db/redis/minio) desde el host.
#
#   ./runtests.sh                 # pytest completo
#   ./runtests.sh --migrate       # alinea master + tenants antes de correr
#   ./runtests.sh tests/test_rbac.py -x
#
# Los cutoffs contra created_at asumen la DB en UTC:
#   docker exec saasgym-db-1 psql -U gymuser -d postgres -c "ALTER ROLE gymuser SET timezone='UTC'"
set -euo pipefail
cd "$(dirname "$0")"

# SECRET_KEY sale del .env de la raíz; el resto apunta a localhost (contenedores expuestos).
if [ ! -f ../.env ]; then
  echo "Falta ../.env (necesita SECRET_KEY). Copia .env.example y rellénalo." >&2
  exit 1
fi
set -a; source ../.env; set +a

export MASTER_DATABASE_URL="postgresql+asyncpg://gymuser:gympass@localhost:5432/gymdb_master"
export TENANT_DATABASE_URL_TEMPLATE="postgresql+asyncpg://gymuser:gympass@localhost:5432/{db_name}"
export DATABASE_URL="$MASTER_DATABASE_URL"
export REDIS_URL="redis://localhost:6379"
export TEST_DB_URL="${TEST_DB_URL:-postgresql+asyncpg://gymuser:gympass@localhost:5432/gymdb_test}"
export S3_ENDPOINT_URL="http://localhost:9000"
export S3_PUBLIC_URL="http://localhost:9000"
export S3_BUCKET="fitconnect-media"
export S3_ACCESS_KEY="minioadmin"
export S3_SECRET_KEY="minioadmin"
export S3_REGION="us-east-1"
# /admin/run-job/* solo existe en development, y 5 tests de jobs lo usan.
export ENVIRONMENT="development"

if [ "${1:-}" = "--migrate" ]; then
  shift
  alembic upgrade head
  python migrate_tenants.py
fi

exec python -m pytest "$@"
