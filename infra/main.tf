terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "saas-gym-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "saas-gym-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name_prefix = "saas-gym-${var.environment}"
  common_tags = {
    Project     = "saas-gym"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
  # Con dominio + ACM la app se sirve por HTTPS; sin dominio, fallback al DNS del
  # ALB por HTTP (solo para staging/pruebas, nunca producción con datos reales).
  tls_enabled  = var.domain_name != ""
  app_base_url = local.tls_enabled ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
  # Las reglas de ruteo cuelgan del listener HTTPS si hay TLS, si no del HTTP.
  app_listener_arn = local.tls_enabled ? one(aws_lb_listener.https[*].arn) : aws_lb_listener.http.arn
}
