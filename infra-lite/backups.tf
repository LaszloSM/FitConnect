# Respaldos diarios cifrados (deploy/backup.sh) y avisos de la instancia.
#
# La instancia solo puede ESCRIBIR respaldos: no puede leerlos ni borrarlos. Si
# alguien entra al servidor, no puede destruir las copias; el bloqueo de objetos
# además impide borrarlas o sobrescribirlas durante 30 días.

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "backups" {
  bucket              = "${local.name_prefix}-backups-${data.aws_caller_identity.current.account_id}"
  object_lock_enabled = true
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = 30
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    id     = "expirar"
    status = "Enabled"
    filter {}
    expiration {
      days = 35
    }
    noncurrent_version_expiration {
      noncurrent_days = 35
    }
  }
}

resource "aws_iam_role_policy" "backups_write" {
  name = "${local.name_prefix}-backups-write"
  role = aws_iam_role.instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = "${aws_s3_bucket.backups.arn}/*"
    }]
  })
}

# Correo transaccional (recuperar contraseña). El dominio remitente se verifica
# en SES aparte (aws_ses_domain_identity) cuando exista el dominio.
resource "aws_iam_role_policy" "ses_send" {
  name = "${local.name_prefix}-ses-send"
  role = aws_iam_role.instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = "*"
    }]
  })
}

# Si el hardware de AWS falla, la instancia se recupera sola en otro host
# (misma IP elástica, mismo disco).
resource "aws_cloudwatch_metric_alarm" "auto_recover" {
  alarm_name          = "${local.name_prefix}-auto-recover"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  dimensions          = { InstanceId = aws_instance.app.id }
  alarm_actions       = ["arn:aws:automate:${var.aws_region}:ec2:recover"]
}

output "backups_bucket" {
  value = aws_s3_bucket.backups.bucket
}

output "ecr_platform" {
  value = aws_ecr_repository.platform.repository_url
}
