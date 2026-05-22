variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "db_username" {
  description = "Master DB username"
  type        = string
  default     = "gymuser"
}

variable "db_password" {
  description = "Master DB password"
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "FastAPI secret key"
  type        = string
  sensitive   = true
}

variable "nextauth_secret" {
  description = "NextAuth secret"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = ""
}

variable "backend_image_tag" {
  description = "Docker image tag for backend (e.g. git SHA)"
  type        = string
}

variable "frontend_image_tag" {
  description = "Docker image tag for frontend (e.g. git SHA)"
  type        = string
}
