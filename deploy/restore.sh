#!/usr/bin/env bash
# Restaurar o PROBAR un respaldo. La instancia no puede leer el bucket (solo
# escribir): baja el archivo con tus credenciales y pásalo al servidor.
#
#   aws s3 cp s3://<bucket>/db/db-<fecha>.sql.gz.enc .
#   scp -i infra-lite/saas-gym-lite.pem db-<fecha>.sql.gz.enc ec2-user@<ip>:/opt/fitconnect/backups/
#
#   bash restore.sh --check backups/db-<fecha>.sql.gz.enc     # prueba en un Postgres temporal (no toca nada)
#   bash restore.sh --apply backups/db-<fecha>.sql.gz.enc     # restaura sobre la base en uso (pide confirmar)
#   bash restore.sh --media backups/media-<fecha>.tar.gz.enc  # restaura fotos y comprobantes
#
# Probar un respaldo cada mes: un respaldo que nunca se restauró no es un respaldo.
set -euo pipefail
cd /opt/fitconnect
set -a; . ./.env; set +a
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE en .env}"
export BACKUP_PASSPHRASE
MODE=${1:-}; FILE=${2:-}
[ -f "$FILE" ] || { echo "Uso: restore.sh --check|--apply|--media <archivo.enc>" >&2; exit 1; }
dec() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE"; }

case "$MODE" in
  --check)
    NAME=fitconnect-restore-check
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -e POSTGRES_PASSWORD=check -e POSTGRES_USER=gymuser postgres:16-alpine >/dev/null
    trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
    for i in $(seq 1 30); do docker exec "$NAME" pg_isready -U gymuser >/dev/null 2>&1 && break; sleep 1; done
    dec | gunzip | docker exec -i "$NAME" psql -q -U gymuser -d postgres >/dev/null 2>"$FILE.check.log" || true
    echo "Bases restauradas:"
    docker exec "$NAME" psql -U gymuser -d postgres -tAc "select count(*) || ' gimnasios' from pg_database where datname like 'gym_%'"
    docker exec "$NAME" psql -U gymuser -d gymdb_master -tAc "select count(*) || ' tenants en la base maestra' from tenants"
    echo "Errores del restore (vacío = limpio): $(grep -c ERROR "$FILE.check.log" || true)"
    ;;
  --apply)
    read -r -p "Esto reemplaza los datos actuales. Escribe RESTAURAR para seguir: " ok
    [ "$ok" = "RESTAURAR" ] || { echo "Cancelado"; exit 1; }
    docker compose stop backend frontend platform
    dec | gunzip | docker compose exec -T db psql -q -U gymuser -d postgres
    docker compose start backend frontend platform
    ;;
  --media)
    dec | docker compose exec -T minio tar -C /data -xzf -
    ;;
  *) echo "Modo desconocido: $MODE" >&2; exit 1 ;;
esac
