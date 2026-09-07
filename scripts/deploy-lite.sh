#!/usr/bin/env bash
# Despliegue completo a la EC2 lite (52.206.73.252) en un solo comando.
#
#   bash scripts/deploy-lite.sh
#
# Hace: abrir SSH para tu IP actual → build+push de las 2 imágenes a ECR →
# copiar compose/Caddyfile → levantar → alinear tenant DBs → importar ejercicios
# → verificar. Es idempotente: se puede volver a correr sin romper nada.
#
# Requisitos: Docker Desktop corriendo (necesita SVM habilitado en la BIOS),
# AWS CLI con credenciales, y la llave infra-lite/saas-gym-lite.pem.
# Correr desde Git Bash, NO desde PowerShell 5.1 (rompe el login de ECR).
set -euo pipefail

cd "$(dirname "$0")/.."
REGION=us-east-1
PEM=infra-lite/saas-gym-lite.pem
REMOTE_DIR=/opt/fitconnect
SKIP_ASSETS=${SKIP_ASSETS:-0}

step() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

step "1/9 Comprobaciones previas"
docker info >/dev/null 2>&1 || fail "Docker no responde. Habilita SVM Mode en la BIOS (Gigabyte: Tweaker › Advanced CPU Settings › SVM Mode = Enabled) y arranca Docker Desktop."
command -v aws >/dev/null || fail "Falta AWS CLI"
[ -f "$PEM" ] || fail "Falta la llave $PEM"
chmod 600 "$PEM" 2>/dev/null || true
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=*gym*" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" --output text)
PUBLIC_IP=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
SG_ID=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].SecurityGroups[0].GroupId" --output text)
REGISTRY="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
BACKEND_IMAGE="$REGISTRY/saas-gym-lite-backend:latest"
FRONTEND_IMAGE="$REGISTRY/saas-gym-lite-frontend:latest"
echo "  instancia $INSTANCE_ID · IP $PUBLIC_IP · registry $REGISTRY"

step "2/9 Abrir SSH para tu IP actual"
MY_IP=$(curl -s -m 15 ifconfig.me)
if aws ec2 describe-security-groups --region "$REGION" --group-ids "$SG_ID" \
     --query "SecurityGroups[0].IpPermissions[?FromPort==\`22\`].IpRanges[].CidrIp" --output text | grep -q "$MY_IP/32"; then
  echo "  $MY_IP/32 ya tiene acceso"
else
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --protocol tcp --port 22 --cidr "$MY_IP/32" >/dev/null
  echo "  agregada regla SSH para $MY_IP/32 (revísala en la consola de AWS cuando termines)"
fi
SSH="ssh -i $PEM -o StrictHostKeyChecking=no -o ConnectTimeout=25 ec2-user@$PUBLIC_IP"
$SSH 'echo "  SSH ok"' || fail "SSH sigue sin entrar"

step "3/9 Login en ECR"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
echo "  ok"

step "4/9 Build + push del backend"
docker build -t "$BACKEND_IMAGE" ./backend
docker push "$BACKEND_IMAGE"

step "5/9 Build + push del frontend (NEXT_PUBLIC_API_URL se hornea en build-time)"
docker build --build-arg NEXT_PUBLIC_API_URL="http://$PUBLIC_IP" -t "$FRONTEND_IMAGE" ./frontend
docker push "$FRONTEND_IMAGE"

step "6/9 Copiar compose y Caddyfile (el .env del servidor NO se toca: tiene los secretos)"
scp -i "$PEM" -o StrictHostKeyChecking=no deploy/docker-compose.prod.yml "ec2-user@$PUBLIC_IP:$REMOTE_DIR/docker-compose.yml"
scp -i "$PEM" -o StrictHostKeyChecking=no deploy/Caddyfile "ec2-user@$PUBLIC_IP:$REMOTE_DIR/Caddyfile"

step "7/9 Levantar la nueva versión"
$SSH "cd $REMOTE_DIR && aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY >/dev/null && docker compose pull && docker compose up -d && docker compose restart caddy"
echo "  esperando a que el backend responda..."
for i in $(seq 1 30); do
  if curl -sf -m 10 "http://$PUBLIC_IP/health" >/dev/null; then echo "  backend arriba"; break; fi
  sleep 5
  [ "$i" = 30 ] && fail "el backend no levantó; revisa: $SSH 'cd $REMOTE_DIR && docker compose logs --tail 80 backend'"
done

step "8/9 Alinear tenant DBs e importar la biblioteca de ejercicios"
# Las tenant DBs se bootstrapean con create_all + stamp head: las migraciones
# nuevas (j5 rutinas, j6 acceso) solo llegan por el aligner.
$SSH "cd $REMOTE_DIR && docker compose exec -T backend python migrate_tenants.py"
if [ "$SKIP_ASSETS" != "1" ]; then
  # Descarga el dataset de free-exercise-db desde el contenedor (876 ejercicios, idempotente)
  $SSH "cd $REMOTE_DIR && docker compose exec -T backend python scripts/import_exercises.py"
fi

step "9/9 Verificación"
printf '  %-28s %s\n' "health"   "$(curl -s -m 15 -o /dev/null -w '%{http_code}' "http://$PUBLIC_IP/health")"
printf '  %-28s %s\n' "frontend" "$(curl -s -m 15 -o /dev/null -w '%{http_code}' "http://$PUBLIC_IP/")"
for r in day-passes/types products/categories insights/peak-hours exercises/facets routines access/events/recent; do
  printf '  %-28s %s\n' "$r" "$(curl -s -m 15 -o /dev/null -w '%{http_code}' "http://$PUBLIC_IP/api/v1/$r")"
done
echo "  (401/403 = desplegado y pidiendo login · 404 = no llegó)"
echo
# El bucket es fitconnect-media (settings.s3_bucket). Ojo: un bucket con nombre
# equivocado también responde 403, así que el nombre tiene que ser el real.
BUCKET=fitconnect-media
echo "  Bucket: los datos personales deben dar 403 y la marca del gym 404 (público, sin objeto)"
for k in members/prueba-inexistente.webp proofs/prueba-inexistente.jpg gyms/prueba-inexistente.png exercises/prueba-inexistente.jpg; do
  printf '  %-34s %s\n' "$k" "$(curl -s -m 15 -o /dev/null -w '%{http_code}' "http://$PUBLIC_IP:9000/$BUCKET/$k")"
done
echo
echo "Listo. App: http://$PUBLIC_IP"
