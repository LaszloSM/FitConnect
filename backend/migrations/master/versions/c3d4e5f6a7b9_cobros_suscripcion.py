"""Cobros de la suscripción: pagos de cada gimnasio, pagado hasta y precio acordado

Revision ID: c3d4e5f6a7b9
Revises: e1f2a3b4c5d7
Create Date: 2026-10-16 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "c3d4e5f6a7b9"
down_revision: Union[str, None] = "e1f2a3b4c5d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paid_until DATE")
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS price_cop INTEGER")
    op.create_table(
        "subscription_payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount_cop", sa.Integer(), nullable=False),
        sa.Column("months", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(120), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("plan", sa.String(20), nullable=False),
        sa.Column("recorded_by", sa.String(255), nullable=True),
        sa.Column("voided_at", sa.DateTime(), nullable=True),
        sa.Column("void_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_subscription_payments_tenant_id", "subscription_payments", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_subscription_payments_tenant_id", table_name="subscription_payments")
    op.drop_table("subscription_payments")
    op.drop_column("tenants", "price_cop")
    op.drop_column("tenants", "paid_until")
