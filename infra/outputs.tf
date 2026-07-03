output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "alb_dns" {
  description = "Application Load Balancer DNS"
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "RDS Master DB endpoint"
  value       = aws_db_instance.master.endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "s3_bucket" {
  description = "S3 uploads bucket"
  value       = aws_s3_bucket.uploads.id
}

output "ecr_backend" {
  description = "Backend ECR repository URL"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend" {
  description = "Frontend ECR repository URL"
  value       = aws_ecr_repository.frontend.repository_url
}

output "github_actions_deploy_role_arn" {
  description = "ARN del rol OIDC a pegar como secret AWS_DEPLOY_ROLE_ARN en GitHub"
  value       = aws_iam_role.github_actions_deploy.arn
}
