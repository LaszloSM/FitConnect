"""f3: caja real — turnos, egresos, recibos con secuencia

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-06-10 02:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cash_shifts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("opened_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opening_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("closed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("counted_cash", sa.Numeric(12, 2), nullable=True),
        sa.Column("expected_cash", sa.Numeric(12, 2), nullable=True),
        sa.Column("difference", sa.Numeric(12, 2), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("locations.id"), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    # Un solo turno abierto por sede (coalesce para sede nula = sede única)
    op.execute("""
        CREATE UNIQUE INDEX uq_cash_shifts_open_per_location
        ON cash_shifts (COALESCE(location_id, '00000000-0000-0000-0000-000000000000'))
        WHERE status = 'open'
    """)

    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("shift_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cash_shifts.id"), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("concept", sa.String(255), nullable=False),
        sa.Column("method", sa.String(20), nullable=False, server_default="cash"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_expenses_shift_id", "expenses", ["shift_id"])

    op.execute("CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1")
    op.create_table(
        "receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payments.id"), unique=True, nullable=False),
        sa.Column("number", sa.Integer(), unique=True, nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.add_column("payments", sa.Column("shift_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cash_shifts.id"), nullable=True))
    op.add_column("payments", sa.Column("received_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.create_index("ix_payments_shift_id", "payments", ["shift_id"])


def downgrade() -> None:
    op.drop_index("ix_payments_shift_id", table_name="payments")
    op.drop_column("payments", "received_by")
    op.drop_column("payments", "shift_id")
    op.drop_table("receipts")
    op.execute("DROP SEQUENCE IF EXISTS receipt_number_seq")
    op.drop_index("ix_expenses_shift_id", table_name="expenses")
    op.drop_table("expenses")
    op.execute("DROP INDEX IF EXISTS uq_cash_shifts_open_per_location")
    op.drop_table("cash_shifts")
