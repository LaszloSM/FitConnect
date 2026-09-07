# Deploy Lite — 1 EC2 + Docker Compose (~$17/mes)

Versión austera del despliegue para la etapa pre-ingresos. Una sola instancia
EC2 corre todo el stack (Postgres, Redis, MinIO, backend, frontend, Caddy)
con el mismo `docker-compose` que ya funciona en local.

La infraestructura "seria" (ECS/RDS/ALB, ~$150-250/mes) sigue definida en
`infra/` y [DEPLOY.md](DEPLOY.md) — migrar a ella cuando haya ingresos es
cuestión de aplicar ese Terraform y restaurar un dump de la DB.

## Arquitectura

```
Internet ──► EIP:80 ──► Caddy ──► /api/*, /docs, /openapi.json ──► backend:8000
                          │
                          └─► resto ──► frontend:3000
         EIP:9000 ──► MinIO (media pública)
```

- **EC2 t3.small** (2 vCPU / 2GB + 2GB swap), Amazon Linux 2023, 30GB gp3 cifrado
- **Elastic IP**: IP fija que sobrevive reinicios
- **ECR**: 2 repos (backend/frontend) con lifecycle de 5 imágenes
- **Sin RDS/ElastiCache/ALB/NAT/WAF**: Postgres, Redis y MinIO corren como
  contenedores en la instancia con volúmenes Docker
- **Backups**: snapshots EBS (ver abajo)

## Despliegue en un comando (redeploy)

Con la infraestructura ya creada, todo el despliegue está automatizado:

```bash
bash scripts/deploy-lite.sh
```

Abre SSH para tu IP actual, construye y sube las dos imágenes a ECR, copia
`docker-compose.prod.yml` y el `Caddyfile`, levanta la nueva versión, **alinea
las tenant DBs** (`migrate_tenants.py`) e **importa la biblioteca de ejercicios**,
y al final verifica ruta por ruta. Es idempotente. El `.env` del servidor no se
toca nunca: ahí viven los secretos.

Requiere Docker Desktop corriendo. Si dice "Virtualization support not detected",
el problema es la BIOS: habilita **SVM Mode** (Gigabyte: Tweaker › Advanced CPU
Settings) o **Intel VT-x**, y reinicia.

Correr desde **Git Bash**, no desde PowerShell 5.1 (rompe el login de ECR).

## Despliegue desde cero

### 1. Terraform

```bash
cd infra-lite
terraform init
terraform apply -var="ssh_allowed_cidr=$(curl -s ifconfig.me)/32"
```

Genera `infra-lite/saas-gym-lite.pem` (clave SSH, gitignored) y muestra
`public_ip`, `app_url`, `ecr_backend`, `ecr_frontend`, `ssh_command`.

### 2. Construir y subir imágenes

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PUBLIC_IP=$(terraform -chdir=infra-lite output -raw public_ip)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

docker build -t $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/saas-gym-lite-backend:latest ./backend
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/saas-gym-lite-backend:latest

# NEXT_PUBLIC_API_URL se hornea en build-time → necesita la IP del paso 1
docker build --build-arg NEXT_PUBLIC_API_URL="http://$PUBLIC_IP" \
  -t $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/saas-gym-lite-frontend:latest ./frontend
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/saas-gym-lite-frontend:latest
```

### 3. Configurar la instancia

Crear `deploy/.env.prod` (gitignored) con:

```
PUBLIC_URL=http://<public_ip>
BACKEND_IMAGE=<ecr_backend>:latest
FRONTEND_IMAGE=<ecr_frontend>:latest
DB_PASSWORD=<db_password del terraform.tfvars>
SECRET_KEY=<secret_key del terraform.tfvars>
NEXTAUTH_SECRET=<nextauth_secret del terraform.tfvars>
SETTINGS_ENCRYPTION_KEY=<clave Fernet: openssl rand -base64 32 | tr '+/' '-_'>
MINIO_PASSWORD=<openssl rand -hex 16>
```

Copiar los archivos y arrancar:

```bash
PEM=infra-lite/saas-gym-lite.pem
scp -i $PEM deploy/docker-compose.prod.yml ec2-user@$PUBLIC_IP:/opt/fitconnect/docker-compose.yml
scp -i $PEM deploy/Caddyfile deploy/.env.prod ec2-user@$PUBLIC_IP:/opt/fitconnect/
scp -i $PEM -r backend/db-init ec2-user@$PUBLIC_IP:/opt/fitconnect/db-init

ssh -i $PEM ec2-user@$PUBLIC_IP << 'EOSSH'
cd /opt/fitconnect
mv .env.prod .env
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $(echo $BACKEND_IMAGE | cut -d/ -f1)
docker compose pull
docker compose up -d
EOSSH
```

### 4. Verificar

```bash
curl http://$PUBLIC_IP/api/health
```

Las migraciones del Master DB corren solas al arrancar el backend
(`RUN_MIGRATIONS_ON_STARTUP=true`, con advisory lock).

## Redeploy (nueva versión)

```bash
# build + push (paso 2) y luego:
ssh -i $PEM ec2-user@$PUBLIC_IP "cd /opt/fitconnect && docker compose pull && docker compose up -d"
```

## Backups

Snapshot diario del volumen EBS vía Amazon Data Lifecycle Manager, o manual:

```bash
aws ec2 create-snapshot --volume-id <vol-id> --description "fitconnect backup"
```

Para un dump lógico de la DB:

```bash
ssh -i $PEM ec2-user@$PUBLIC_IP \
  "docker compose -f /opt/fitconnect/docker-compose.yml exec db pg_dumpall -U gymuser" > backup.sql
```

## Dominio + HTTPS (después)

Con un dominio apuntando a la EIP, editar `deploy/Caddyfile`: cambiar `:80`
por el dominio (`fitconnect.com { ... }`) y Caddy emite el certificado
Let's Encrypt automáticamente. Actualizar `PUBLIC_URL=https://<dominio>` en
`.env`, rebuild del frontend con el nuevo `NEXT_PUBLIC_API_URL` y
`docker compose up -d`.

## Costo

| Recurso | $/mes |
|---|---|
| EC2 t3.small on-demand | ~$15.2 |
| EBS 30GB gp3 | ~$2.4 |
| EIP (adjunta a instancia corriendo) | $0 |
| ECR (~2GB) | ~$0.20 |
| **Total** | **~$18/mes** (menos con créditos del free tier) |
