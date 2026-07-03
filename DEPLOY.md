# Deploy Guide

## AWS Infrastructure

All infrastructure is defined as code in `infra/` using Terraform. This guide
assumes you're running these commands **locally** (or from AWS CloudShell) with
real AWS credentials — Terraform apply is not something to run from an
untrusted/ephemeral sandbox.

### Prerequisites

- AWS CLI configured (`aws configure` or SSO) with an IAM principal that can
  create VPC/RDS/ECS/IAM/ACM/WAF resources
- Terraform >= 1.5.0
- Docker

### 0. Get `infra/terraform.tfvars`

`infra/terraform.tfvars` is gitignored on purpose (it holds plaintext secrets)
and is never pushed to the repo. Generate it locally:

```bash
cd infra
cat > terraform.tfvars <<EOF
aws_region      = "us-east-1"
environment     = "prod"
db_username     = "gymuser"
db_password     = "$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-32)"
secret_key      = "$(openssl rand -hex 32)"
nextauth_secret = "$(openssl rand -base64 32)"
domain_name     = ""
github_repo     = "LaszloSM/FitConnect"
EOF
```

Leave `domain_name` empty for the first deploy (the app is served over HTTP via
the ALB's own DNS name). Add a real domain later — see step 6.

### 1. Bootstrap Terraform State

Create the S3 bucket and DynamoDB table for Terraform state locking (one-time,
per AWS account):

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

### 3. First Apply

The ECS task definitions reference `backend_image_tag`/`frontend_image_tag` —
there's no default, since a real image must exist in ECR at that tag before
ECS can start tasks. Pick a tag now (e.g. the current commit's short SHA) and
reuse it in step 4:

```bash
export IMAGE_TAG=$(git rev-parse --short HEAD)
terraform plan  -var="backend_image_tag=$IMAGE_TAG" -var="frontend_image_tag=$IMAGE_TAG"
terraform apply -var="backend_image_tag=$IMAGE_TAG" -var="frontend_image_tag=$IMAGE_TAG"
```

This creates the VPC, RDS (Multi-AZ), ElastiCache, ALB, ECS cluster/services,
ECR repos, Secrets Manager entries, WAF, and the GitHub Actions OIDC role.
**The ECS services will be unhealthy right after this step** — no image exists
at `$IMAGE_TAG` yet. That's expected; step 4 fixes it.

### 4. Build and Push Images

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Backend
docker build -t saas-gym-prod-backend ./backend
docker tag saas-gym-prod-backend:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/saas-gym-prod-backend:$IMAGE_TAG
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/saas-gym-prod-backend:$IMAGE_TAG

# Frontend (bake the public API URL in at build time — it's inlined into the JS bundle)
ALB_DNS=$(terraform -chdir=infra output -raw alb_dns)
docker build --build-arg NEXT_PUBLIC_API_URL="http://$ALB_DNS" -t saas-gym-prod-frontend ./frontend
docker tag saas-gym-prod-frontend:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/saas-gym-prod-frontend:$IMAGE_TAG
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/saas-gym-prod-frontend:$IMAGE_TAG
```

ECS will pick up the new images and stabilize within a couple of minutes
(deployment circuit breaker is on, so a bad image auto-rolls-back instead of
looping forever).

### 5. Verify

```bash
curl http://$(terraform -chdir=infra output -raw alb_dns)/api/health
```

Master DB migrations run automatically on backend boot (advisory-lock guarded,
safe with multiple replicas) — no manual `alembic upgrade` step needed against
a fresh RDS. Tenant DBs are provisioned on demand when a gym signs up.

### 6. Enable GitHub Actions CI/CD (recommended)

`infra/github_oidc.tf` creates an IAM role GitHub Actions can assume via OIDC
(no long-lived AWS keys in GitHub). After step 3's apply:

```bash
terraform -chdir=infra output -raw github_actions_deploy_role_arn
```

> If this account already has GitHub's OIDC provider registered (common if
> another repo set it up first — the provider is per-account, not per-repo),
> `apply` fails with `EntityAlreadyExists` on
> `aws_iam_openid_connect_provider.github`. Delete that resource block from
> `infra/github_oidc.tf`, hardcode the existing provider's ARN into the trust
> policy's `Federated` field instead, and re-apply.

In the GitHub repo (Settings → Secrets and variables → Actions):

- **Secrets**: `AWS_DEPLOY_ROLE_ARN` (output above), `ECR_BACKEND=saas-gym-prod-backend`, `ECR_FRONTEND=saas-gym-prod-frontend`
- **Variables**: `AWS_DEPLOY_ENABLED=true`, `NEXT_PUBLIC_API_URL=http://<alb_dns>`

From then on, every push to `main` that passes tests builds, pushes, and
`terraform apply`s automatically (`.github/workflows/deploy.yml`).

### 7. Add a Custom Domain + HTTPS (optional, later)

Set `domain_name` in `terraform.tfvars`, re-apply, then read the validation
records and add them to your DNS:

```bash
terraform -chdir=infra output -json acm_validation_records
```

Once ACM validates, the ALB listens on HTTPS and `local.app_base_url` switches
to `https://<domain>` automatically (redeploy backend/frontend after this so
`CORS_ORIGINS`/`NEXTAUTH_URL` pick up the new URL).

## Cost

Roughly (us-east-1, always-on): 2 NAT Gateways (~$65/mo) + RDS `db.t3.micro`
Multi-AZ (~$50-60/mo) + ElastiCache `cache.t3.micro` (~$12/mo) + ALB (~$16/mo)
+ WAF + Fargate tasks + data transfer ≈ **$150-250/mo**. `db_instance.master`
has `deletion_protection = true` and takes a final snapshot on destroy — to
tear down, first `terraform apply` with `deletion_protection = false` (or
`aws rds modify-db-instance`), then `terraform destroy`.

## Architecture

- **VPC**: Public + private subnets across 2 AZs
- **ECS Fargate**: Backend (FastAPI) + Frontend (Next.js) containers
- **ALB**: Routes `/api/*` to backend, everything else to frontend
- **RDS PostgreSQL 16**: Master DB (tenant registry), Multi-AZ
- **ElastiCache Redis**: Session/cache store
- **S3**: File uploads
- **GitHub OIDC**: `github_actions_deploy` role, no static AWS keys in CI
