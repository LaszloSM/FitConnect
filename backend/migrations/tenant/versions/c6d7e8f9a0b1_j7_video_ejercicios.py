"""j7: video propio del gym por ejercicio

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-09-07
"""
from alembic import op

from app.db.tenant_align import J7_VIDEO_EJERCICIOS

revision = "c6d7e8f9a0b1"
down_revision = "b5c6d7e8f9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for stmt in J7_VIDEO_EJERCICIOS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS exercise_media")
