#!/usr/bin/env bash
# Respaldo diario cifrado: base de datos completa (todos los gimnasios) y fotos
# y comprobantes de MinIO. Corre en el servidor (timer fitconnect-backup).
#
# Requiere en /opt/fitconnect/.env:
#   BACKUP_BUCKET       salida `backups_bucket` de terraform (infra-lite)
#   BACKUP_PASSPHRASE   frase larga (openssl rand -base64 48). GUÁRDALA FUERA DEL
#                       SERVIDOR: sin ella los respaldos no se pueden abrir.
set -euo pipefail
cd /opt/fitconnect
set -a; . ./.env; set +a
: "${BACKUP_BUCKET:?Falta BACKUP_BUCKET en .env}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE en .env}"
export BACKUP_PASSPHRASE

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DIR=/opt/fitconnect/backups
mkdir -p "$DIR" && chmod 700 "$DIR"
enc() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE; }

docker compose exec -T db pg_dumpall -U gymuser | gzip -9 | enc > "$DIR/db-$STAMP.sql.gz.enc"
docker compose exec -T minio tar -C /data -czf - . | enc > "$DIR/media-$STAMP.tar.gz.enc"

# Un respaldo vacío es peor que ninguno: da falsa tranquilidad.
[ "$(stat -c %s "$DIR/db-$STAMP.sql.gz.enc")" -gt 1024 ] || { echo "Respaldo de la base sospechosamente pequeño" >&2; exit 1; }

for f in db-$STAMP.sql.gz.enc media-$STAMP.tar.gz.enc; do
  kind=${f%%-*}
  aws s3 cp --only-show-errors --checksum-algorithm SHA256 "$DIR/$f" "s3://$BACKUP_BUCKET/$kind/$f"
done

# En el servidor quedan solo los últimos 3 días (el disco es de 30 GB).
find "$DIR" -name '*.enc' -mtime +3 -delete
echo "Respaldo $STAMP subido a s3://$BACKUP_BUCKET"
