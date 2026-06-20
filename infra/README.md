# Infraestructura (Terraform) — FitConnect

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
