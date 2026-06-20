# Secretos en AWS Secrets Manager (en vez de plain text en la task definition de
# ECS, que queda visible en la task def JSON / describe-tasks). ECS los inyecta en
# runtime vía el campo `secrets` del contenedor (ver ecs.tf).

locals {
  master_db_url  = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${aws_db_instance.master.endpoint}/gymdb_master"
  tenant_db_tmpl = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${aws_db_instance.master.endpoint}/{db_name}"

  # Claves NO sensibles para el for_each (un map con valores sensibles no se puede
  # usar como argumento de for_each); el valor se busca aparte por clave.
  app_secret_keys = [
    "master-database-url",
    "tenant-database-url-template",
    "database-url",
    "secret-key",
    "nextauth-secret",
  ]
  app_secret_values = {
    "master-database-url"          = local.master_db_url
    "tenant-database-url-template" = local.tenant_db_tmpl
    "database-url"                 = local.master_db_url
    "secret-key"                   = var.secret_key
    "nextauth-secret"              = var.nextauth_secret
  }
}

resource "aws_secretsmanager_secret" "app" {
  for_each = toset(local.app_secret_keys)
  name     = "${local.name_prefix}/${each.key}"
  tags     = merge(local.common_tags, { Name = "${local.name_prefix}-${each.key}" })
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each      = toset(local.app_secret_keys)
  secret_id     = aws_secretsmanager_secret.app[each.key].id
  secret_string = local.app_secret_values[each.key]
}

# El execution role de ECS necesita leer estos secretos al arrancar la tarea.
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.name_prefix}-secrets-access"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [for s in aws_secretsmanager_secret.app : s.arn]
    }]
  })
}
