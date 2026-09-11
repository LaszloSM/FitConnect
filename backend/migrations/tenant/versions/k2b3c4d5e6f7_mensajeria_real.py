"""K2: anuncios, plantilla de Meta editable y fin del teatro de mensajería

Revision ID: k2b3c4d5e6f7
Revises: k1a2b3c4d5e6
"""
from alembic import op

from app.db.tenant_align import K2_MENSAJERIA

revision = "k2b3c4d5e6f7"
down_revision = "k1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Las tenant DBs se bootstrapean con create_all + stamp head: el cuerpo de
    # esta migración nunca corre en un gym ya creado, por eso las mismas
    # sentencias viven en tenant_align para que el aligner las aplique.
    for statement in K2_MENSAJERIA:
        op.execute(statement)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS announcements")
    op.execute("ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_status VARCHAR(20) NOT NULL DEFAULT 'draft'")
    op.execute("ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp'")
    op.execute("ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS header_image_url VARCHAR(500) NULL")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NULL")
