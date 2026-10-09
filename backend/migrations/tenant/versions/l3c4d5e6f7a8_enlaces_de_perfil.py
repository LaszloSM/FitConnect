"""Enlaces para que el socio complete sus datos.

Revision ID: l3c4d5e6f7a8
Revises: l2b3c4d5e6f7
"""
from alembic import op

from app.db.tenant_align import L3_PERFIL

revision = "l3c4d5e6f7a8"
down_revision = "l2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for sql in L3_PERFIL:
        op.execute(sql)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS profile_links")
