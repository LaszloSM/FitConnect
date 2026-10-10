# Infraestructura (Terraform) — LSMFit

ECS Fargate + RDS Postgres + ElastiCache Redis + ALB + S3, en una VPC con subnets
privadas. **Este código está endurecido pero NO se ha aplicado todavía** (la cuenta
AWS aún no existe). Esta guía es el checklist para cuando se aplique.

## Antes del primer `apply`

1. **Backend de estado** (`main.tf`): crear a mano, una vez, el bucket S3
   `saas-gym-terraform-state` (con versioning + cifrado) y la tabla DynamoDB
   `saas-gym-terraform-locks` (clave `LockID`). El state lleva secretos → bucket
   privado, cifrado y acceso restringido.
2. **Variables** (`terraform.tfvars`, NO commitear): copiar de
   `terraform.tfvars.example` y completar `db_password`, `secret_key`,
   `nextauth_secret`, y opcionalmente `domain_name`.
   - Generar secretos: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

## TLS / dominio

- Si `domain_name` está vacío: el ALB sirve por HTTP (solo staging/pruebas, nunca
  producción con datos reales).
- Si `domain_name` está seteado: se crea un certificado ACM con validación DNS y
  el puerto 80 redirige a 443. Tras `apply`, crear los CNAME de validación que
  expone el output `acm_validation_records` en el DNS del dominio; cuando el cert
  pase a `ISSUED`, el listener 443 queda activo. Apuntar el dominio (A/ALIAS) al
  DNS del ALB.

## Secretos

`SECRET_KEY`, `NEXTAUTH_SECRET` y las URLs de DB (con password) viven en AWS
Secrets Manager (`secrets.tf`) y ECS los inyecta en runtime vía el campo `secrets`
de la task definition — ya no quedan en plain text en la task def. El execution
role tiene permiso `secretsmanager:GetSecretValue` solo sobre esos secretos.

Rotación: actualizar el valor en Secrets Manager (o `terraform apply` con el nuevo
valor en tfvars) y forzar un nuevo deployment de ECS para que las tareas tomen el
secreto rotado.

## Después del `apply`

1. Suscribir el email del equipo a las alarmas:
   ```bash
   aws sns subscribe --topic-arn <arn-de-saas-gym-prod-alerts> \
     --protocol email --notification-endpoint ops@tu-dominio.com
   ```
   (confirmar el correo de suscripción).
2. Verificar el flujo end-to-end en staging: crear tenant, miembro, cobrar,
   recibo, kiosko, webhook Wompi, auditoría.
3. Probar un restore de RDS desde snapshot al menos una vez (drill).

## Gotchas del primer deploy (cazados antes de aplicar)

Tres cosas que rompen el primer deploy si no se atienden. Las dos primeras ya
están resueltas en código; las dos últimas requieren un valor/decisión tuya.

1. **Frontend → API URL (resuelto).** `NEXT_PUBLIC_API_URL` se hornea en build-time
   en Next. El `deploy.yml` ya lo pasa como `--build-arg` desde la variable de
   repositorio **`NEXT_PUBLIC_API_URL`** (Settings → Secrets and variables →
   Actions → Variables). Debes setearla al dominio público (ej.
   `https://app.tudominio.com`). Implica: **usa `domain_name`**, porque sin dominio
   el DNS del ALB no se conoce al momento del build (huevo y gallina).

2. **Esquema del Master en RDS fresco (resuelto).** El backend corre
   `alembic upgrade head` del Master al arrancar (`RUN_MIGRATIONS_ON_STARTUP=true`,
   ya seteado en `ecs.tf`), con advisory lock para que solo una réplica migre. Los
   tenants siguen naciendo con `create_all` al registrarse.

3. **Guard de producción (requiere tus valores).** `config.py` **falla el arranque**
   del backend si en `environment=production` faltan:
   - `CORS_ORIGINS` / `FRONTEND_URL` → ya seteados en `ecs.tf` al `app_base_url`.
   - **`WOMPI_API_URL`** → debes ponerlo en `https://production.wompi.co/v1` (env del
     backend en `ecs.tf`). Si aún no vas a cobrar real, despliega con
     `environment != production` para saltar el guard, pero entonces no es prod.
   - **`SETTINGS_ENCRYPTION_KEY`** → llave Fernet para cifrar los secretos de
     Wompi/WhatsApp. Generar con
     `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`,
     guardarla como secreto (mismo patrón que `secret-key` en `secrets.tf` +
     `terraform.tfvars`) e inyectarla en el bloque `secrets` del backend.

## Endurecimiento ya incluido

- Secretos en Secrets Manager (no en la task def).
- TLS + ACM + redirect 80→443 (cuando hay dominio); HSTS se setea en la app.
- WAF en el ALB (rate-limit por IP + AWS managed common rules).
- Alarmas CloudWatch: 5xx ALB, latencia p99, CPU ECS, conexiones RDS → SNS.
- RDS: `storage_encrypted`, `skip_final_snapshot=false` (+ snapshot final),
  Multi-AZ, deletion protection, backups 7 días.
- ElastiCache: cifrado at-rest.
- S3: block public access total + policy deny sin TLS + cifrado + versioning.
- Logs CloudWatch con retención 30 días.

## Follow-ups (no bloqueantes)

- ElastiCache `transit_encryption_enabled` (requiere que la app use `rediss://` +
  auth token).
- Rate limit de login por `ip+email` (requiere middleware propio; ver
  `app/core/rate_limit.py`).
- IaC scanning (Checkov/tfsec) en CI; escaneo de imágenes ECR.
- Separar workspaces/cuentas de `staging` y `prod`.
