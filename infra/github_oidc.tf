# Rol OIDC para que GitHub Actions despliegue sin credenciales de larga duración.
# deploy.yml asume este rol vía `role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}`.
#
# Si la cuenta YA tiene el proveedor OIDC de GitHub (algo común si otro repo lo
# creó antes — el proveedor es único por cuenta, no por repo), este `apply` falla
# con `EntityAlreadyExists`. En ese caso borra el resource "aws_iam_openid_connect_provider"
# de abajo y reemplaza su referencia en el trust policy por el ARN existente
# (`aws iam list-open-id-connect-providers`).
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = merge(local.common_tags, { Name = "${local.name_prefix}-github-oidc" })
}

resource "aws_iam_role" "github_actions_deploy" {
  name = "${local.name_prefix}-github-actions-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:ref:refs/heads/main"
        }
      }
    }]
  })
  tags = merge(local.common_tags, { Name = "${local.name_prefix}-github-actions-deploy" })
}

# Permisos amplios pero acotados por prefijo de nombre (saas-gym-*) para los
# servicios que Terraform administra. EC2/ELB/ECS/RDS/ElastiCache/ACM/CloudWatch
# no soportan restricción por ARN en sus acciones de creación, así que van a "*";
# IAM, S3, Secrets Manager y DynamoDB (más sensibles) sí quedan acotados por prefijo.
resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "${local.name_prefix}-github-actions-deploy-policy"
  role = aws_iam_role.github_actions_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InfraServicesBroad"
        Effect = "Allow"
        Action = [
          "ec2:*",
          "elasticloadbalancing:*",
          "ecs:*",
          "ecr:*",
          "rds:*",
          "elasticache:*",
          "wafv2:*",
          "acm:*",
          "logs:*",
          "cloudwatch:*",
        ]
        Resource = "*"
      },
      {
        Sid    = "S3Scoped"
        Effect = "Allow"
        Action = "s3:*"
        Resource = [
          "arn:aws:s3:::saas-gym-*",
          "arn:aws:s3:::saas-gym-*/*"
        ]
      },
      {
        Sid      = "SecretsManagerScoped"
        Effect   = "Allow"
        Action   = "secretsmanager:*"
        Resource = "arn:aws:secretsmanager:*:*:secret:${local.name_prefix}/*"
      },
      {
        Sid      = "TerraformLockTable"
        Effect   = "Allow"
        Action   = "dynamodb:*"
        Resource = "arn:aws:dynamodb:*:*:table/saas-gym-terraform-locks"
      },
      {
        Sid    = "IamScopedToProjectRoles"
        Effect = "Allow"
        Action = [
          "iam:GetRole",
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PassRole"
        ]
        Resource = "arn:aws:iam::*:role/${local.name_prefix}-*"
      }
    ]
  })
}
