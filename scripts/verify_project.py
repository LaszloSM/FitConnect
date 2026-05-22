#!/usr/bin/env python3
"""
Verificacion estatica del proyecto SaaS Gym.
Comprueba que todos los modulos se importan correctamente,
las rutas existen, y los archivos de config son validos.
"""

import ast
import os
import sys
from pathlib import Path


def check_syntax(path: Path) -> list[str]:
    errors = []
    for f in path.rglob("*.py"):
        if "__pycache__" in str(f):
            continue
        try:
            compile(f.read_text(encoding="utf-8"), str(f), "exec")
        except SyntaxError as e:
            errors.append(f"Syntax error in {f}: {e}")
    return errors


def check_backend_imports() -> list[str]:
    errors = []
    original_dir = os.getcwd()
    os.chdir("backend")
    sys.path.insert(0, ".")

    modules_to_test = [
        "app.main",
        "app.core.config",
        "app.core.security",
        "app.db.master_base",
        "app.db.tenant_base",
        "app.db.master_session",
        "app.db.tenant_session",
        "app.api.deps",
        "app.api.v1.router",
        "app.api.v1.auth",
        "app.api.v1.members",
        "app.api.v1.payments",
        "app.api.v1.checkins",
        "app.api.v1.dashboard",
        "app.api.v1.classes",
        "app.api.v1.machines",
        "app.api.v1.notifications",
        "app.api.v1.reports",
        "app.models.master.tenant",
        "app.models.master.owner",
        "app.models.tenant.user_staff",
        "app.models.tenant.member",
        "app.models.tenant.membership",
        "app.models.tenant.payment",
        "app.models.tenant.checkin",
        "app.models.tenant.gym_class",
        "app.models.tenant.class_enrollment",
        "app.models.tenant.machine",
        "app.models.tenant.maintenance",
        "app.models.tenant.notification",
        "app.models.tenant.location",
        "app.schemas.auth",
        "app.schemas.member",
        "app.schemas.operations",
        "app.services.tenant_service",
    ]

    for mod in modules_to_test:
        try:
            __import__(mod)
            print(f"  [OK] {mod}")
        except Exception as e:
            errors.append(f"[FAIL] {mod}: {e}")
            print(f"  [FAIL] {mod}: {e}")

    sys.path.pop(0)
    os.chdir(original_dir)
    return errors


def check_required_files() -> list[str]:
    errors = []
    required = [
        "docker-compose.yml",
        "backend/Dockerfile",
        "frontend/Dockerfile",
        "backend/requirements.txt",
        "backend/.env",
        "frontend/.env.local",
        "frontend/next.config.ts",
        "frontend/tailwind.config.ts",
        "backend/alembic.ini",
        "backend/alembic/master/env.py",
        "backend/alembic/tenant/env.py",
        "infra/main.tf",
        "infra/variables.tf",
        "infra/vpc.tf",
        "infra/rds.tf",
        "infra/ecs.tf",
        "infra/alb.tf",
        ".github/workflows/deploy.yml",
        "DEPLOY.md",
    ]
    for f in required:
        if not Path(f).exists():
            errors.append(f"Missing required file: {f}")
        else:
            print(f"  [OK] {f}")
    return errors


def check_frontend_pages() -> list[str]:
    errors = []
    expected_pages = [
        "frontend/app/(auth)/login/page.tsx",
        "frontend/app/(auth)/register/page.tsx",
        "frontend/app/(dashboard)/dashboard/page.tsx",
        "frontend/app/(dashboard)/members/page.tsx",
        "frontend/app/(dashboard)/payments/page.tsx",
        "frontend/app/(dashboard)/checkins/page.tsx",
        "frontend/app/(dashboard)/classes/page.tsx",
        "frontend/app/(dashboard)/machines/page.tsx",
        "frontend/app/(dashboard)/reports/page.tsx",
        "frontend/components/common/GlassCard.tsx",
        "frontend/components/dashboard/KPICard.tsx",
        "frontend/components/layout/Sidebar.tsx",
        "frontend/components/layout/Header.tsx",
        "frontend/auth.ts",
        "frontend/middleware.ts",
        "frontend/lib/api.ts",
    ]
    for f in expected_pages:
        if not Path(f).exists():
            errors.append(f"Missing frontend page: {f}")
        else:
            print(f"  [OK] {f}")
    return errors


def main():
    print("=" * 60)
    print("SaaS Gym MVP - Verificacion Estatica")
    print("=" * 60)

    all_errors = []

    print("\n1. Verificando sintaxis Python...")
    errors = check_syntax(Path("backend"))
    if errors:
        all_errors.extend(errors)
        print(f"  [FAIL] {len(errors)} errores de sintaxis")
    else:
        print("  [OK] Todos los archivos Python tienen sintaxis valida")

    print("\n2. Verificando imports del backend...")
    errors = check_backend_imports()
    all_errors.extend(errors)

    print("\n3. Verificando archivos requeridos...")
    errors = check_required_files()
    all_errors.extend(errors)

    print("\n4. Verificando paginas del frontend...")
    errors = check_frontend_pages()
    all_errors.extend(errors)

    print("\n" + "=" * 60)
    if all_errors:
        print(f"RESULTADO: {len(all_errors)} error(es) encontrado(s)")
        for e in all_errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print("RESULTADO: Todo OK - Proyecto listo para Docker Compose")
        sys.exit(0)


if __name__ == "__main__":
    main()
