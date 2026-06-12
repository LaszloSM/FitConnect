"""h1: cuentas de recaudo para transferencias + datos fiscales del gym

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, None] = "a5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("gym_settings", sa.Column("transfer_accounts", postgresql.JSONB(), nullable=True))
    op.add_column("gym_settings", sa.Column("legal_name", sa.String(200), nullable=True))
    op.add_column("gym_settings", sa.Column("nit", sa.String(30), nullable=True))
    op.add_column("gym_settings", sa.Column("tax_regime", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("gym_settings", "tax_regime")
    op.drop_column("gym_settings", "nit")
    op.drop_column("gym_settings", "legal_name")
    op.drop_column("gym_settings", "transfer_accounts")
