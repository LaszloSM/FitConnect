"""gym_settings.tour_completed_at — tour de bienvenida del panel

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-07-07
"""
from alembic import op

revision = "c9d0e1f2a3b4"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE gym_settings ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMP NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE gym_settings DROP COLUMN IF EXISTS tour_completed_at")
