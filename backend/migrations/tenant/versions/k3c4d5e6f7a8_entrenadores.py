"""K3: entrenador como rol del gimnasio

Revision ID: k3c4d5e6f7a8
Revises: k2b3c4d5e6f7
"""
from alembic import op

from app.db.tenant_align import K3_ENTRENADORES

revision = "k3c4d5e6f7a8"
down_revision = "k2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Las tenant DBs se bootstrapean con create_all + stamp head: el cuerpo de
    # esta migración nunca corre en un gym ya creado, por eso las mismas
    # sentencias viven en tenant_align para que el aligner las aplique.
    for statement in K3_ENTRENADORES:
        op.execute(statement)


def downgrade() -> None:
    # El valor del enum no se quita: PostgreSQL no lo permite sin recrear el tipo
    # y habría filas apuntando a él.
    op.execute("ALTER TABLE class_sessions DROP COLUMN IF EXISTS instructor_override_id")
    op.execute("ALTER TABLE memberships DROP COLUMN IF EXISTS trainer_sessions_per_month")
    op.execute("ALTER TABLE memberships DROP COLUMN IF EXISTS includes_trainer")
    op.execute("ALTER TABLE member_plans DROP COLUMN IF EXISTS trainer_sessions_per_month")
    op.execute("ALTER TABLE member_plans DROP COLUMN IF EXISTS includes_trainer")
    op.execute("ALTER TABLE members DROP COLUMN IF EXISTS trainer_id")
    op.execute("ALTER TABLE instructors DROP COLUMN IF EXISTS staff_id")
