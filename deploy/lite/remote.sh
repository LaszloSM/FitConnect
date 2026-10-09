#!/usr/bin/env bash
# Pasos que el despliegue desde GitHub Actions (deploy-lite.yml) corre DENTRO
# de la instancia, vía SSM. El runner le manda este paquete (compose, Caddyfile,
# respaldos y este script) y llama una fase a la vez:
#
#   remote.sh preflight              revisa el .env y el disco; no cambia nada
#   remote.sh deploy <registry> <tag> respaldo de la base, archivos nuevos y up -d
#   remote.sh post [--assets]         aligner de tenants y scripts idempotentes
#
# El .env del servidor no se reescribe nunca: ahí viven los secretos. La única
# línea que se agrega, si falta, es PLATFORM_IMAGE (no es secreta).
set -euo pipefail

APP_DIR=${FC_APP_DIR:-/opt/fitconnect}
BUNDLE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
REGION=${AWS_REGION:-us-east-1}
# SSM corre como root y sin HOME: docker login no tendría dónde guardar la sesión.
export HOME=${HOME:-/root}

say() { printf '\n== %s\n' "$1"; }
fail() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

env_value() {
  # Lee una clave del .env sin ejecutarlo (puede tener valores con $ o espacios).
  { grep -E "^$1=" "$APP_DIR/.env" || true; } | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

preflight() {
  say "Revisión previa (no cambia nada)"
  [ -f "$APP_DIR/.env" ] || fail "no existe $APP_DIR/.env"
  command -v docker >/dev/null || fail "docker no está instalado"
  docker compose version >/dev/null || fail "falta el plugin docker compose"

  # Sin estas, la versión nueva no arranca: el guard de producción del backend
  # exige SETTINGS_ENCRYPTION_KEY y un CORS que no sea localhost.
  missing=()
  for k in PUBLIC_URL BACKEND_IMAGE FRONTEND_IMAGE DB_PASSWORD SECRET_KEY NEXTAUTH_SECRET SETTINGS_ENCRYPTION_KEY MINIO_PASSWORD; do
    [ -n "$(env_value "$k")" ] || missing+=("$k")
  done
  [ ${#missing[@]} -eq 0 ] || fail "al .env le faltan claves obligatorias: ${missing[*]} (ver DEPLOY-LITE.md)"

  public_url=$(env_value PUBLIC_URL)
  case "$public_url" in
    *localhost*|*127.0.0.1*) fail "PUBLIC_URL apunta a localhost ($public_url): el backend no arranca en producción así" ;;
  esac

  for k in GEMINI_API_KEY BACKUP_BUCKET BACKUP_PASSPHRASE; do
    if [ -n "$(env_value "$k")" ]; then echo "  $k: configurada"; else echo "  $k: sin configurar (opcional)"; fi
  done

  free_gb=$( (df -BG --output=avail /var/lib/docker 2>/dev/null || df -BG --output=avail /) | tail -n1 | tr -dc '0-9')
  echo "  disco libre para docker: ${free_gb:-?} GB"
  [ "${free_gb:-0}" -ge 3 ] || fail "menos de 3 GB libres; libera espacio con: docker image prune -af"

  echo "  contenedores actuales:"
  (cd "$APP_DIR" && docker compose ps --format '    {{.Service}}  {{.Status}}' 2>/dev/null || true)

  # El runner lee esta línea para hornear la URL pública en el frontend.
  echo "FC_PUBLIC_URL=$public_url"
}

deploy() {
  local registry=$1 tag=$2
  [ -n "$registry" ] && [ -n "$tag" ] || fail "uso: remote.sh deploy <registry> <tag>"
  cd "$APP_DIR"

  say "Respaldo de la base antes de tocar nada"
  mkdir -p backups && chmod 700 backups
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
    docker compose exec -T db pg_dumpall -U gymuser | gzip -9 > "backups/pre-deploy-$stamp.sql.gz"
    size=$(stat -c %s "backups/pre-deploy-$stamp.sql.gz")
    [ "$size" -gt 1024 ] || fail "el respaldo previo salió casi vacío ($size bytes); no sigo"
    echo "  backups/pre-deploy-$stamp.sql.gz ($((size / 1024)) KB)"
    # Quedan los tres últimos: el disco es de 30 GB.
    ls -1t backups/pre-deploy-*.sql.gz | tail -n +4 | xargs -r rm -f
  else
    echo "  la base no está corriendo: primer despliegue, nada que respaldar"
  fi

  say "Guardar las imágenes actuales como :previo (para volver atrás a mano)"
  for svc in backend frontend platform; do
    img=$(docker compose images -q "$svc" 2>/dev/null | head -n1 || true)
    if [ -n "$img" ]; then
      docker tag "$img" "$registry/saas-gym-lite-$svc:previo" && echo "  $svc -> :previo"
    fi
  done

  say "Archivos nuevos (compose, Caddyfile, respaldos)"
  install -m 644 "$BUNDLE_DIR/deploy/docker-compose.prod.yml" docker-compose.yml
  install -m 644 "$BUNDLE_DIR/deploy/Caddyfile" Caddyfile
  install -m 755 "$BUNDLE_DIR/deploy/backup.sh" "$BUNDLE_DIR/deploy/restore.sh" .
  install -m 644 "$BUNDLE_DIR/deploy/fitconnect-backup.service" "$BUNDLE_DIR/deploy/fitconnect-backup.timer" .
  mkdir -p db-init && cp -n "$BUNDLE_DIR"/backend/db-init/* db-init/ 2>/dev/null || true
  chown -R ec2-user:ec2-user "$APP_DIR" 2>/dev/null || true
  grep -q '^PLATFORM_IMAGE=' .env || echo "PLATFORM_IMAGE=$registry/saas-gym-lite-platform:latest" >> .env

  say "Bajar la versión $tag y levantarla"
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$registry" >/dev/null
  # Las variables de la shell le ganan al .env: se despliega el commit exacto,
  # no lo que diga :latest en ese momento.
  export BACKEND_IMAGE="$registry/saas-gym-lite-backend:$tag"
  export FRONTEND_IMAGE="$registry/saas-gym-lite-frontend:$tag"
  export PLATFORM_IMAGE="$registry/saas-gym-lite-platform:$tag"
  # Solo las tres propias: un pull a secas también va a Docker Hub por las de
  # terceros y su límite de descargas anónimas tumba el despliegue.
  docker compose pull --quiet backend frontend platform
  # :latest local queda igual al desplegado: un `docker compose up -d` a mano
  # (que lee el .env) no debe resucitar la versión anterior en caché.
  for svc in backend frontend platform; do
    docker tag "$registry/saas-gym-lite-$svc:$tag" "$registry/saas-gym-lite-$svc:latest"
  done
  docker compose up -d --remove-orphans
  docker compose restart caddy >/dev/null

  say "Esperar a que el backend responda (migraciones del Master incluidas)"
  for i in $(seq 1 60); do
    status=$(docker compose exec -T backend python -c "import json,urllib.request;print(json.load(urllib.request.urlopen('http://localhost:8000/health',timeout=5))['status'])" 2>/dev/null || true)
    if [ "$status" = "ok" ]; then echo "  backend arriba ($((i * 5)) s)"; break; fi
    if [ "$i" = 60 ]; then
      docker compose ps
      docker compose logs --tail 80 backend
      fail "el backend no quedó sano en 5 minutos (estado: ${status:-sin respuesta}). Respaldo en backups/pre-deploy-$stamp.sql.gz e imágenes anteriores en :previo"
    fi
    sleep 5
  done

  if [ -n "$(env_value BACKUP_BUCKET)" ] && [ -n "$(env_value BACKUP_PASSPHRASE)" ]; then
    cp fitconnect-backup.service fitconnect-backup.timer /etc/systemd/system/
    systemctl daemon-reload && systemctl enable --now fitconnect-backup.timer >/dev/null
    echo "  respaldo diario a S3: activo"
  else
    echo "  AVISO: sin BACKUP_BUCKET/BACKUP_PASSPHRASE en .env no hay respaldo diario a S3"
  fi

  # Las imágenes viejas sin etiqueta se acumulan en cada despliegue.
  docker image prune -f >/dev/null
  echo
  docker compose ps --format '  {{.Service}}  {{.Status}}'
}

post() {
  cd "$APP_DIR"
  say "Alinear las bases de los gimnasios"
  # Los gimnasios nacen con create_all + stamp head: las columnas nuevas solo
  # les llegan por el aligner. Solo la cola de la salida: SSM corta a 24 KB.
  docker compose exec -T backend python migrate_tenants.py 2>&1 | tail -n 40
  docker compose exec -T -e PYTHONIOENCODING=utf-8 backend python scripts/migrate_machine_areas.py
  if [ "${1:-}" = "--assets" ]; then
    say "Importar la biblioteca de ejercicios"
    docker compose exec -T backend python scripts/import_exercises.py 2>&1 | tail -n 15
  fi
  say "Llave de Gemini dentro del backend"
  if docker compose exec -T backend sh -c 'test -n "$GEMINI_API_KEY"'; then
    echo "  presente: los planes con IA están activos"
  else
    echo "  ausente: la app solo genera planes automáticos"
  fi
}

case "${1:-}" in
  preflight) preflight ;;
  deploy) deploy "${2:-}" "${3:-}" ;;
  post) post "${2:-}" ;;
  *) fail "fase desconocida: ${1:-} (preflight | deploy | post)" ;;
esac
