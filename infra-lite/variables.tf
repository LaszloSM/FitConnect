variable "aws_region" {
  description = "Región AWS"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "Tipo de instancia EC2 (t3.small = 2 vCPU / 2GB, ~$15/mes)"
  type        = string
  default     = "t3.small"
}

variable "ssh_allowed_cidr" {
  description = "CIDR permitido para SSH (idealmente tu IP pública /32)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "root_volume_gb" {
  description = "Tamaño del disco raíz en GB"
  type        = number
  default     = 30
}
