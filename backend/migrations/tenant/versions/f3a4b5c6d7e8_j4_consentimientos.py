"""j4: consentimiento de datos e imagen en members

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-09-06
"""
from alembic import op

from app.db.tenant_align import J4_CONSENTIMIENTOS

revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for sql in J4_CONSENTIMIENTOS:
        op.execute(sql)


def downgrade() -> None:
    op.execute("ALTER TABLE members DROP COLUMN IF EXISTS consent_image_at")
    op.execute("ALTER TABLE members DROP COLUMN IF EXISTS consent_data_at")
