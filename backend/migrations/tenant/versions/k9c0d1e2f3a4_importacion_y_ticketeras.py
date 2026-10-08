"""Importación desde el software anterior y ticketeras.

Revision ID: k9c0d1e2f3a4
Revises: k8b9c0d1e2f3
"""
from alembic import op

from app.db.tenant_align import K9_IMPORTACION

revision = "k9c0d1e2f3a4"
down_revision = "k8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for sql in K9_IMPORTACION:
        op.execute(sql)


def downgrade() -> None:
    op.execute("ALTER TABLE member_plans DROP COLUMN IF EXISTS entries_total")
    for col in ("entries_used", "entries_total", "import_batch_id", "source"):
        op.execute(f"ALTER TABLE memberships DROP COLUMN IF EXISTS {col}")
    for col in ("import_batch_id", "access_by_document", "expectation", "eps"):
        op.execute(f"ALTER TABLE members DROP COLUMN IF EXISTS {col}")
    op.execute("DROP TABLE IF EXISTS import_batches")
