"""video del catálogo de ejercicios (wger, CC-BY-SA)

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-09-07
"""
from alembic import op

revision = "c8d9e0f1a2b3"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE exercises ADD COLUMN IF NOT EXISTS video_url VARCHAR(500) NULL")
    op.execute("ALTER TABLE exercises ADD COLUMN IF NOT EXISTS video_license VARCHAR(80) NULL")
    op.execute("ALTER TABLE exercises ADD COLUMN IF NOT EXISTS video_author VARCHAR(120) NULL")


def downgrade() -> None:
    for col in ("video_url", "video_license", "video_author"):
        op.execute(f"ALTER TABLE exercises DROP COLUMN IF EXISTS {col}")
