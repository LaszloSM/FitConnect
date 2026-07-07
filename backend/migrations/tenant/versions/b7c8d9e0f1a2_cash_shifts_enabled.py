"""gym_settings.cash_shifts_enabled — turnos de caja opcionales

Revision ID: b7c8d9e0f1a2
Revises: d8e9f0a1b2c3
Create Date: 2026-07-04
"""
from alembic import op

revision = "b7c8d9e0f1a2"
down_revision = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS: las tenant DBs se bootstrapean con create_all (el esquema
    # puede ya tener la columna cuando corre el upgrade)
    op.execute(
        "ALTER TABLE gym_settings "
        "ADD COLUMN IF NOT EXISTS cash_shifts_enabled BOOLEAN NOT NULL DEFAULT true"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE gym_settings DROP COLUMN IF EXISTS cash_shifts_enabled")
