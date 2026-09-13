"""Modelos de ML entrenados por gimnasio.

Revision ID: k8b9c0d1e2f3
Revises: k7a8b9c0d1e2
"""
from alembic import op

from app.db.tenant_align import K8_MODELOS

revision = "k8b9c0d1e2f3"
down_revision = "k7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for sql in K8_MODELOS:
        op.execute(sql)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ml_models")
