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
}
