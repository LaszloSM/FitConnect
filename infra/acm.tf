# Certificado TLS para el dominio (validación por DNS). Solo se crea si
# var.domain_name está seteado. Tras `apply`, agregar los registros CNAME de
# validación que aparecen en `aws_acm_certificate.main.domain_validation_options`
# en el DNS del dominio (o usar Route53 con aws_route53_record + cert_validation).

resource "aws_acm_certificate" "main" {
  count             = local.tls_enabled ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-cert" })
}

output "acm_validation_records" {
  description = "Registros CNAME a crear en el DNS para validar el certificado"
  value = local.tls_enabled ? [
    for o in aws_acm_certificate.main[0].domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ] : []
}
