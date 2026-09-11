"""K4: máquinas y mantenimiento que funcionan

Revision ID: k4d5e6f7a8b9
Revises: k3c4d5e6f7a8
"""
from alembic import op

from app.db.tenant_align import K4_MAQUINAS

revision = "k4d5e6f7a8b9"
down_revision = "k3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Las tenant DBs se bootstrapean con create_all + stamp head: el cuerpo de
    # esta migración nunca corre en un gym ya creado, por eso las mismas
    # sentencias viven en tenant_align para que el aligner las aplique.
    for statement in K4_MAQUINAS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("ALTER TABLE maintenance_logs DROP COLUMN IF EXISTS reported_by")
    op.execute("ALTER TABLE maintenance_logs DROP COLUMN IF EXISTS kind")
