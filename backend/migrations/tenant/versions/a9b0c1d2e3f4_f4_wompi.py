"""f4: Wompi — payment_links y webhook_events

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-06-10 03:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a9b0c1d2e3f4"
down_revision: Union[str, None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payments.id"), nullable=False),
        sa.Column("wompi_link_id", sa.String(100), nullable=True),
        sa.Column("reference", sa.String(120), unique=True, nullable=False),
        sa.Column("amount_in_cents", sa.BigInteger(), nullable=False),
        sa.Column("checkout_url", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="created"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("membership_intent", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_payment_links_payment_id", "payment_links", ["payment_id"])

    op.create_table(
        "webhook_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False, server_default="wompi"),
        sa.Column("event_id", sa.String(120), unique=True, nullable=False),
        sa.Column("transaction_id", sa.String(120), nullable=True),
        sa.Column("reference", sa.String(120), nullable=True),
        sa.Column("raw", postgresql.JSONB(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("webhook_events")
    op.drop_index("ix_payment_links_payment_id", table_name="payment_links")
    op.drop_table("payment_links")
