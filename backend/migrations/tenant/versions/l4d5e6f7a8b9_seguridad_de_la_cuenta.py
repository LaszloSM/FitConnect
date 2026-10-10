"""Segundo paso por correo y llaves de acceso del personal.

Revision ID: l4d5e6f7a8b9
Revises: l3c4d5e6f7a8
"""
from alembic import op

from app.db.tenant_align import L4_SEGURIDAD

revision = "l4d5e6f7a8b9"
down_revision = "l3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for sql in L4_SEGURIDAD:
        op.execute(sql)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS staff_passkeys")
    for col in ("mfa_preferred", "mfa_passkey_enabled", "mfa_email_enabled"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {col}")
