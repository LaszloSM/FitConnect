terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }

  backend "s3" {
    bucket         = "saas-gym-terraform-state"
    key            = "lite/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "saas-gym-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "saas-gym"
      Environment = "lite"
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name_prefix = "saas-gym-lite"
}
