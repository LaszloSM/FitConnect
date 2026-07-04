output "public_ip" {
  description = "IP pública fija (Elastic IP) de la app"
  value       = aws_eip.app.public_ip
}

output "app_url" {
  description = "URL base de la app"
  value       = "http://${aws_eip.app.public_ip}"
}

output "ecr_backend" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend" {
  value = aws_ecr_repository.frontend.repository_url
}

output "ssh_command" {
  value = "ssh -i infra-lite/${local.name_prefix}.pem ec2-user@${aws_eip.app.public_ip}"
}

output "instance_id" {
  value = aws_instance.app.id
}
