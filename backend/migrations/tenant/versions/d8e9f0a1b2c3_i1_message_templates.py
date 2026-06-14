"""i1: tabla message_templates (mensajes editables por ocasión)

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-06-14 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS: las tenant DBs se bootstrapean con create_all; la migración
    # debe ser idempotente para que un upgrade futuro no choque (lección de fleet).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS message_templates (
            id UUID PRIMARY KEY,
            occasion VARCHAR(50) NOT NULL,
            channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
            body TEXT NOT NULL,
            header_image_url VARCHAR(500),
            is_active BOOLEAN NOT NULL DEFAULT true,
            meta_template_name VARCHAR(100),
            meta_status VARCHAR(20) NOT NULL DEFAULT 'draft',
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT uq_message_template_occasion UNIQUE (occasion)
        )
        """
    )


def downgrade() -> None:
    op.drop_table("message_templates")
