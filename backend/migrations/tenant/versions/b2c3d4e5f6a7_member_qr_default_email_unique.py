"""member: autogenerar qr_code, qr NOT NULL y email único por gym

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-31 00:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Backfill QR faltante antes de imponer NOT NULL
    op.execute("UPDATE members SET qr_code = gen_random_uuid()::text WHERE qr_code IS NULL")
    op.alter_column("members", "qr_code", nullable=False)
    op.create_unique_constraint("uq_member_email", "members", ["email"])


def downgrade() -> None:
    op.drop_constraint("uq_member_email", "members", type_="unique")
    op.alter_column("members", "qr_code", nullable=True)
