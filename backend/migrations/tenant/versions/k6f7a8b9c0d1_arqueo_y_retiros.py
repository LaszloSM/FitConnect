"""Arqueo por denominaciones y retiros a boveda.

El cierre recibia un total suelto: sin el desglose no hay forma de revisar
despues en que se equivoco el cajero. Y el efectivo que se lleva a la boveda a
mitad de jornada no tenia donde registrarse sin inflar los gastos del mes.

Revision ID: k6f7a8b9c0d1
Revises: k5e6f7a8b9c0
"""
from alembic import op

from app.db.tenant_align import K6_CAJA

revision = "k6f7a8b9c0d1"
down_revision = "k5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for sql in K6_CAJA:
        op.execute(sql)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cash_drops")
    op.execute("ALTER TABLE cash_shifts DROP COLUMN IF EXISTS denominations")
