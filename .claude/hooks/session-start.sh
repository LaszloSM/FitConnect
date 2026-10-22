#!/bin/bash
# Prepara una sesión de Claude Code en la nube: servicios, dependencias del
# backend y del frontend, gstack, graphify y las skills de diseño.
# Idempotente: si algo ya está, lo salta. En el PC local no hace nada.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
VENV=/root/fc-venv
SKILLS="$HOME/.claude/skills"
CACHE="$HOME/.cache/lsmfit-skills"
CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome

log() { echo "[session-start] $*" >&2; }

# --- Postgres y Redis (los de los contenedores de desarrollo no existen aquí) ---
pg_ctlcluster 16 main start >/dev/null 2>&1 || true
# Sin persistencia: si no, Redis escribe dump.rdb en el directorio actual (el repo lo versiona).
redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes --save "" --dir /tmp >/dev/null

for _ in $(seq 1 30); do pg_isready -q && break; sleep 1; done
psql_su() { su postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$1\""; }
if [ -z "$(psql_su "SELECT 1 FROM pg_roles WHERE rolname='gymuser'")" ]; then
  psql_su "CREATE ROLE gymuser LOGIN PASSWORD 'gympass' CREATEDB"
fi
# Los cutoffs contra created_at asumen la base en UTC.
psql_su "ALTER ROLE gymuser SET timezone='UTC'" >/dev/null
for db in gymdb_master gymdb_test; do
  if [ -z "$(psql_su "SELECT 1 FROM pg_database WHERE datname='$db'")" ]; then
    psql_su "CREATE DATABASE $db OWNER gymuser"
  fi
done

# runtests.sh exige ../.env con SECRET_KEY. Llave solo de desarrollo.
if [ ! -f "$REPO/.env" ]; then
  echo "SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" > "$REPO/.env"
fi

# --- Backend: Python 3.12 (asyncpg no trae rueda para el 3.13 del sistema) ---
log "dependencias del backend"
[ -x "$VENV/bin/python" ] || uv venv -q -p 3.12 "$VENV"
VIRTUAL_ENV="$VENV" uv pip install -q -r "$REPO/backend/requirements-dev.txt"

# --- Frontend ---
log "dependencias del frontend"
(cd "$REPO/frontend" && npm install --no-audit --no-fund --loglevel=error >&2)

# --- gstack (obligatorio según CLAUDE.md) ---
log "gstack"
if [ ! -d "$SKILLS/gstack/.git" ]; then
  git clone -q --depth 1 https://github.com/garrytan/gstack.git "$SKILLS/gstack"
fi
# La descarga de Chrome falla (cdn.playwright.dev bloqueado); browse usa el
# Chromium del contenedor vía GSTACK_CHROMIUM_PATH.
(cd "$SKILLS/gstack" && ./setup --no-team -q >/dev/null 2>&1) || log "gstack setup terminó con avisos"

# --- graphify ---
command -v graphify >/dev/null 2>&1 || uv tool install -q graphifyy || log "no se pudo instalar graphify"

# --- Skills de diseño: impeccable, taste y las de Emil Kowalski ---
log "skills de diseño"
mkdir -p "$CACHE" "$SKILLS"
fetch() {
  local name=$1 url=$2
  if [ -d "$CACHE/$name/.git" ]; then
    git -C "$CACHE/$name" pull -q --ff-only || true
  else
    git clone -q --depth 1 "$url" "$CACHE/$name"
  fi
}
fetch impeccable https://github.com/pbakaus/impeccable.git
fetch taste-skill https://github.com/Leonxlnx/taste-skill.git
fetch emil https://github.com/emilkowalski/skill.git

install_skill() {
  local src=$1 name=$2
  rm -rf "${SKILLS:?}/$name"
  cp -R "$src" "$SKILLS/$name"
}
install_skill "$CACHE/impeccable/.claude/skills/impeccable" impeccable
install_skill "$CACHE/taste-skill/skills/taste-skill" taste-skill
for dir in "$CACHE"/emil/skills/*/; do
  install_skill "$dir" "$(basename "$dir")"
done

# El inspector de taste-skill lanza Chromium sin --no-sandbox, que como root no arranca.
mkdir -p "$HOME/.local/bin"
printf '#!/bin/sh\nexec %s --no-sandbox "$@"\n' "$CHROMIUM" > "$HOME/.local/bin/chromium-nosandbox"
chmod +x "$HOME/.local/bin/chromium-nosandbox"

# --- Variables para el resto de la sesión ---
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export PATH=\"$VENV/bin:\$HOME/.local/bin:\$PATH\""
    echo "export GSTACK_CHROMIUM_PATH=$CHROMIUM"
    echo "export CHROME_PATH=$HOME/.local/bin/chromium-nosandbox"
  } >> "$CLAUDE_ENV_FILE"
fi

log "listo"
