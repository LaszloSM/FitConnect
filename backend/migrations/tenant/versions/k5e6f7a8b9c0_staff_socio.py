"""El personal del gimnasio tambien es socio.

Un entrenador o un recepcionista entrena en el gimnasio donde trabaja, pero no
tenia forma de entrar: no habia ningun vinculo entre `users`/`instructors` y
`members`, asi que su huella, su QR y el torniquete no lo reconocian.

Dos columnas porque el equipo tiene dos poblaciones: quien tiene cuenta en el
software (`staff_id`) y quien no la necesita (`instructor_profile_id`), como el
profesor por horas que solo viene a dictar spinning.

Revision ID: k5e6f7a8b9c0
Revises: k4d5e6f7a8b9
"""
from alembic import op

from app.db.tenant_align import K5_STAFF_SOCIO

revision = "k5e6f7a8b9c0"
down_revision = "k4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Las sentencias viven en tenant_align para que `migrate_tenants.py` las
    # aplique a los tenants que nacieron con create_all + stamp head, donde el
    # cuerpo de esta migracion nunca corre.
    for sql in K5_STAFF_SOCIO:
        op.execute(sql)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_members_instructor_profile_id")
    op.execute("DROP INDEX IF EXISTS uq_members_staff_id")
    op.execute("ALTER TABLE members DROP COLUMN IF EXISTS instructor_profile_id")
    op.execute("ALTER TABLE members DROP COLUMN IF EXISTS staff_id")
