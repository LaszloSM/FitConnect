# Deploy Lite — 1 EC2 + Docker Compose (~$17/mes)

Versión austera del despliegue para la etapa pre-ingresos. Una sola instancia
EC2 corre todo el stack (Postgres, Redis, MinIO, backend, frontend, Caddy)
con el mismo `docker-compose` que ya funciona en local.

La infraestructura "seria" (ECS/RDS/ALB, ~$150-250/mes) sigue definida en
`infra/` y [DEPLOY.md](DEPLOY.md) — migrar a ella cuando haya ingresos es
cuestión de aplicar ese Terraform y restaurar un dump de la DB.

## Arquitectura

```
Internet ──► EIP:80/443 ──► Caddy ─┬─► /api/v1/*, /iclock/*, /docs, /health ──► backend:8000
                                   ├─► /fitconnect-media/* ──► MinIO (sin puerto público)
                                   └─► resto ──► frontend:3000
             admin.<dominio> ──► Caddy (lista de IPs) ─┬─► /api/platform/* ──► backend:8000
                                                       └─► resto ──► platform:3100
```

- **EC2 t3.small** (2 vCPU / 2GB + 2GB swap), Amazon Linux 2023, 30GB gp3 cifrado
- **Elastic IP**: IP fija que sobrevive reinicios
- **ECR**: 2 repos (backend/frontend) con lifecycle de 5 imágenes
- **Sin RDS/ElastiCache/ALB/NAT/WAF**: Postgres, Redis y MinIO corren como
  contenedores en la instancia con volúmenes Docker
- **Backups**: respaldo diario cifrado a S3 con bloqueo de 30 días (ver abajo)
- **Recuperación**: alarma de CloudWatch que mueve la instancia a otro host si falla el hardware

## Desplegar desde GitHub (sin Docker ni SSH)

Actions › **Desplegar servidor (EC2 lite)** › *Run workflow*. Construye las tres
imágenes en GitHub, las sube a ECR y le habla a la instancia por SSM (Session
Manager), así que no hace falta Docker en tu PC ni abrir el puerto 22. En orden:

1. **Revisión previa:** si al `.env` del servidor le falta una clave obligatoria
   (`PUBLIC_URL`, `BACKEND_IMAGE`, `FRONTEND_IMAGE`, `DB_PASSWORD`, `SECRET_KEY`,
   `NEXTAUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `MINIO_PASSWORD`) o hay menos de
   3 GB libres, se detiene **antes** de tocar nada y dice cuál falta.
2. Build y push de backend, frontend (con `NEXT_PUBLIC_API_URL` = `PUBLIC_URL`
   del servidor) y panel de plataforma, con la etiqueta del commit.
3. En el servidor:
   - respaldo de la base (`backups/pre-deploy-<fecha>.sql.gz`, quedan los 3 últimos);
   - las imágenes que estaban corriendo se etiquetan `:previo`;
   - compose, Caddyfile y respaldos nuevos, y `up -d` del commit exacto;
   - espera a que `/health` diga `ok`.
4. Aligner de gimnasios (`migrate_tenants.py`) y scripts idempotentes; con la
   casilla marcada, reimporta la biblioteca de ejercicios.
5. Verificación desde afuera: `/health`, el frontend y una ruta nueva
   (`/api/v1/me/plans/options` debe dar 401, no 404).

El `.env` del servidor no se reescribe: solo se agrega `PLATFORM_IMAGE` si falta.

**Volver atrás** (si la versión nueva falla después de arrancar), por Session Manager:

```bash
cd /opt/fitconnect
R=902734531628.dkr.ecr.us-east-1.amazonaws.com
sudo BACKEND_IMAGE=$R/saas-gym-lite-backend:previo FRONTEND_IMAGE=$R/saas-gym-lite-frontend:previo \
  PLATFORM_IMAGE=$R/saas-gym-lite-platform:previo docker compose up -d
```

Las migraciones del Master ya corrieron hacia adelante; si la base también hay
que devolverla, está el respaldo `backups/pre-deploy-*.sql.gz` de ese despliegue.

### Configuración (una vez)

En IAM, crear el usuario `github-deploy-lite` **sin acceso a la consola**, con
esta política en línea (cambia `ACCOUNT` por tu número de cuenta), y sacarle una
llave de acceso («Aplicación que se ejecuta fuera de AWS»):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ecr:GetAuthorizationToken", "ec2:DescribeInstances",
        "ssm:DescribeInstanceInformation", "ssm:GetCommandInvocation"], "Resource": "*" },
    { "Effect": "Allow",
      "Action": ["ecr:DescribeRepositories", "ecr:CreateRepository", "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"],
      "Resource": "arn:aws:ecr:us-east-1:ACCOUNT:repository/saas-gym-lite-*" },
    { "Effect": "Allow", "Action": "ssm:SendCommand",
      "Resource": "arn:aws:ssm:us-east-1::document/AWS-RunShellScript" },
    { "Effect": "Allow", "Action": "ssm:SendCommand",
      "Resource": "arn:aws:ec2:us-east-1:ACCOUNT:instance/*",
      "Condition": { "StringEquals": { "ssm:resourceTag/Name": "saas-gym-lite-app" } } }
  ]
}
```

En GitHub › Settings › Secrets and variables › Actions › *New repository secret*:
`AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`. (Si prefieres no guardar llaves,
un rol OIDC en `AWS_DEPLOY_ROLE_ARN` tiene prioridad sobre ellas.)

Ojo: `ssm:SendCommand` corre comandos como root en el servidor. Quien pueda
lanzar el workflow controla la instancia: el entorno `produccion` de GitHub
(Settings › Environments) permite exigir aprobación antes de cada despliegue.

## Despliegue en un comando desde tu PC (redeploy)

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
PLATFORM_IMAGE=<ecr_platform>:latest
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
# Solo backend y frontend: `docker compose pull` a secas también baja
# postgres/redis/minio/caddy de Docker Hub, que limita los pulls anónimos.
ssh -i $PEM ec2-user@$PUBLIC_IP   "cd /opt/fitconnect && docker compose pull backend frontend && docker compose up -d"
```

## Respaldos

`deploy/backup.sh` corre todos los días a las 3:15 a. m. (timer `fitconnect-backup`):
base completa (todos los gimnasios) y fotos/comprobantes, cifrados con AES-256 y
subidos al bucket `backups_bucket` de Terraform. La instancia solo puede escribir
en ese bucket (no leer ni borrar) y cada copia queda bloqueada 30 días: si alguien
entra al servidor, no puede destruir los respaldos.

Activarlos (una vez), en `/opt/fitconnect/.env`:

```
BACKUP_BUCKET=<terraform output -raw backups_bucket>
BACKUP_PASSPHRASE=<openssl rand -base64 48>
```

**Guarda la frase también fuera del servidor** (gestor de contraseñas): sin ella
los respaldos no se pueden abrir. El siguiente `deploy-lite.sh` instala el timer.
Probar a mano: `ssh ... 'bash /opt/fitconnect/backup.sh'`.

**Prueba de restauración (una vez al mes):** bajar el último respaldo con tus
credenciales, copiarlo al servidor y correr
`bash restore.sh --check backups/db-<fecha>.sql.gz.enc`. Levanta un Postgres
temporal, restaura y cuenta gimnasios sin tocar la base en uso. Restaurar de
verdad: `--apply` (pide escribir RESTAURAR) y `--media` para las fotos.

Los snapshots EBS siguen siendo un buen complemento (Data Lifecycle Manager).

## Dominio + HTTPS

1. Apuntar el dominio y `admin.<dominio>` (registros A) a la EIP.
2. En `/opt/fitconnect/.env`:

```
SITE_ADDRESS=tudominio.co
PUBLIC_URL=https://tudominio.co
PLATFORM_ADDRESS=admin.tudominio.co
PLATFORM_URL=https://admin.tudominio.co
PLATFORM_ALLOWED_IPS=<tu IP>/32 <IP de la oficina>/32
```

3. `bash scripts/deploy-lite.sh` (recompila el frontend con la URL nueva).
   Caddy saca y renueva los certificados de Let's Encrypt solo.

Los torniquetes ZKTeco se configuran con el dominio, puerto 443 y HTTPS. Si un
modelo viejo no soporta HTTPS: `ICLOCK_HTTP_ADDRESS=http://tudominio.co` y abrir
solo `/iclock/*` por HTTP (no transporta datos de socios).

## Panel de plataforma

Las cuentas solo se crean en el servidor:

```bash
ssh ... 'cd /opt/fitconnect && docker compose exec backend python scripts/create_platform_admin.py --email tu@correo.com --name "Tu Nombre"'
```

En el primer ingreso muestra un QR para la app autenticadora (obligatoria) y 8
códigos de respaldo. Celular perdido: `--reset-2fa`. Sin dominio, el panel no se
publica: `ssh -L 9100:localhost:9100 ec2-user@<ip>` y abrir http://localhost:9100.

## Correo

LSMFit envía por correo: recuperar contraseña, invitaciones al equipo, el enlace
para que el socio complete su ficha, la invitación a la app de socios, códigos
de verificación en dos pasos y avisos de seguridad.

Sin `SES_FROM_EMAIL` **no sale ningún correo** (quedan en el log y `/health` lo
marca). Para enviarlos:

1. En Amazon SES (región `us-east-1`), verificar el dominio (registros DKIM en el
   DNS) y agregar SPF y DMARC. Mientras no haya dominio se puede verificar una
   sola dirección, pero los correos "desde" una cuenta @gmail.com suelen caer
   en spam: para clientes reales hace falta dominio propio.
2. Pedir la salida del sandbox de SES (en sandbox solo llega a direcciones
   verificadas).
3. En `.env`: `SES_FROM_EMAIL=no-responder@<dominio>` (y `SES_REGION` si no es
   `us-east-1`). El permiso `ses:SendEmail` ya está en el rol de la instancia.
4. Probar: `docker compose exec backend python scripts/probar_correos.py --to tu@correo.com`
   envía una muestra de cada correo y dice cuál falló.

Enlaces de descarga de la app de socios para el correo de bienvenida:
`MEMBER_APP_ANDROID_URL` y `MEMBER_APP_IOS_URL` (vacíos = el correo dice
"descarga la app LSMFit" sin enlace).

En desarrollo los correos van a Mailpit: http://localhost:8025.

## Verificación en dos pasos

Dueños y administradores deben configurar la app autenticadora en su siguiente
ingreso (incluidas las cuentas que ya existían). Si un dueño pierde el celular y
los códigos de respaldo, se reinicia desde el panel de plataforma › gimnasio ›
"El dueño perdió el celular", verificando antes su identidad por teléfono.

## Costo

| Recurso | $/mes |
|---|---|
| EC2 t3.small on-demand | ~$15.2 |
| EBS 30GB gp3 | ~$2.4 |
| EIP (adjunta a instancia corriendo) | $0 |
| ECR (~2GB) | ~$0.20 |
| **Total** | **~$18/mes** (menos con créditos del free tier) |
