"""j1: tipo de ingreso, pase del día, transferencias trazables, tarjeta, descuento, devolución

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-09-06
"""
from alembic import op

from app.db.tenant_align import J1_INGRESOS_PASE_TRANSFERENCIAS

revision = "d1e2f3a4b5c6"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Todo IF NOT EXISTS: las tenant DBs se bootstrapean con create_all y
    # pueden tener ya parte del esquema cuando corre el upgrade.
    op.execute("""
        CREATE TABLE IF NOT EXISTS day_pass_types (
            id UUID PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            price NUMERIC(12,2) NOT NULL,
            includes_trainer BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS day_passes (
            id UUID PRIMARY KEY,
            member_id UUID NOT NULL REFERENCES members(id),
            pass_type_id UUID NULL REFERENCES day_pass_types(id),
            pass_name VARCHAR(100) NOT NULL,
            includes_trainer BOOLEAN NOT NULL DEFAULT false,
            valid_on DATE NOT NULL,
            price NUMERIC(12,2) NOT NULL,
            payment_id UUID NULL REFERENCES payments(id),
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_by UUID NULL REFERENCES users(id),
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_day_passes_member_valid ON day_passes (member_id, valid_on)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_day_passes_payment_id ON day_passes (payment_id)")

    # Columnas/índices sobre tablas existentes: lista compartida con migrate_tenants.py
    for sql in J1_INGRESOS_PASE_TRANSFERENCIAS:
        op.execute(sql)


def downgrade() -> None:
    op.execute("ALTER TABLE gym_settings DROP COLUMN IF EXISTS transfer_auto_void_hours")
    op.execute("DROP INDEX IF EXISTS uq_member_email")
    op.execute("ALTER TABLE members ADD CONSTRAINT uq_member_email UNIQUE (email)")
    op.execute("ALTER TABLE members DROP COLUMN IF EXISTS member_type")
    for col in (
        "kind", "destination_account_id", "transfer_reference", "proof_url", "proof_uploaded_at",
        "card_approval_code", "card_terminal", "discount_amount", "discount_note",
        "refunded_at", "refund_reason", "refunded_by", "refund_expense_id",
        "voided_at", "void_reason", "voided_by",
    ):
        op.execute(f"ALTER TABLE payments DROP COLUMN IF EXISTS {col}")
    op.execute("DROP SEQUENCE IF EXISTS transfer_ref_seq")
    op.execute("DROP TABLE IF EXISTS day_passes")
    op.execute("DROP TABLE IF EXISTS day_pass_types")
