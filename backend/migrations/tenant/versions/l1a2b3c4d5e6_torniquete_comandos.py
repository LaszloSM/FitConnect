"""Cola de comandos para torniquetes y usuarios guardados en cada equipo.

Revision ID: l1a2b3c4d5e6
Revises: k9c0d1e2f3a4
"""
from alembic import op

from app.db.tenant_align import K10_TORNIQUETE

revision = "l1a2b3c4d5e6"
down_revision = "k9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for sql in K10_TORNIQUETE:
        op.execute(sql)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS device_users")
    op.execute("DROP TABLE IF EXISTS device_commands")
    op.execute("DROP SEQUENCE IF EXISTS device_command_seq")
