"""Verificación en dos pasos del personal (app autenticadora).

Revision ID: l2b3c4d5e6f7
Revises: l1a2b3c4d5e6
"""
from alembic import op

from app.db.tenant_align import L2_DOS_PASOS

revision = "l2b3c4d5e6f7"
down_revision = "l1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for sql in L2_DOS_PASOS:
        op.execute(sql)


def downgrade() -> None:
    for col in ("backup_codes", "totp_enabled", "totp_secret_enc"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {col}")
