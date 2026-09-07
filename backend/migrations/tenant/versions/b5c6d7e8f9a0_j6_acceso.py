"""j6: control de acceso (dispositivos tipados, credenciales, consentimiento biométrico, eventos)

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-09-07
"""
from alembic import op

from app.db.tenant_align import J6_ACCESO

revision = "b5c6d7e8f9a0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for stmt in J6_ACCESO:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS access_events")
    op.execute("DROP TABLE IF EXISTS member_credentials")
    op.execute("DROP TABLE IF EXISTS biometric_consents")
    for col in ("kind", "vendor", "model", "serial", "location", "offline_policy", "config"):
        op.execute(f"ALTER TABLE kiosk_devices DROP COLUMN IF EXISTS {col}")
