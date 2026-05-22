# Deploy Guide

## AWS Infrastructure

All infrastructure is defined as code in `infra/` using Terraform.

### Prerequisites

- AWS CLI configured
- Terraform >= 1.5.0
- Docker

### 1. Bootstrap Terraform State

Create the S3 bucket and DynamoDB table for Terraform state locking:

```bash
aws s3 mb s3://saas-gym-terraform-state --region us-east-1
aws dynamodb create-table \
  --table-name saas-gym-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### 2. Initialize Terraform

```bash
cd infra
terraform init
```

### 3. Apply Infrastructure

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform plan
terraform apply
```

### 4. Build and Push Images

```bash
# Login to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com

# Backend
docker build -t saas-gym-prod-backend ./backend
docker tag saas-gym-prod-backend:latest <ecr-backend-url>:latest
docker push <ecr-backend-url>:latest

# Frontend
docker build -t saas-gym-prod-frontend ./frontend
docker tag saas-gym-prod-frontend:latest <ecr-frontend-url>:latest
docker push <ecr-frontend-url>:latest
```

### 5. Run Migrations

```bash
# Connect to the ECS task and run Alembic migrations
aws ecs execute-command \
  --cluster saas-gym-prod-cluster \
  --task <task-id> \
  --container backend \
  --interactive \
  --command "alembic -c alembic.ini upgrade head"
```

## CI/CD

A GitHub Actions workflow is defined in `.github/workflows/deploy.yml`.

Required secrets:
- `AWS_DEPLOY_ROLE_ARN` - IAM role ARN for OIDC authentication
- `ECR_BACKEND` - ECR repository name for backend
- `ECR_FRONTEND` - ECR repository name for frontend

## Architecture

- **VPC**: Public + private subnets across 2 AZs
- **ECS Fargate**: Backend (FastAPI) + Frontend (Next.js) containers
- **ALB**: Routes `/api/*` to backend, everything else to frontend
- **RDS PostgreSQL 16**: Master DB (tenant registry)
- **ElastiCache Redis**: Session/cache store
- **S3**: File uploads
