"""f1: ciclo de vida de membresías — status string + frozen, descuentos,
freezes, promo_codes, audit_logs, gym_settings, backfill de expiradas

Revision ID: d6e7f8a9b0c1
Revises: c4d5e6f7a8b9
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── memberships.status: enum nativo → String(20) (permite agregar estados sin ALTER TYPE) ───
    op.execute("ALTER TABLE memberships ALTER COLUMN status TYPE VARCHAR(20) USING status::text")
    op.execute("DROP TYPE IF EXISTS membershipstatus")

    # ─── memberships: descuentos y expiración por job ───
    op.add_column("memberships", sa.Column("discount_amount", sa.Numeric(12, 2), nullable=True))
    op.add_column("memberships", sa.Column("discount_reason", sa.String(255), nullable=True))
    op.add_column("memberships", sa.Column("promo_code_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("memberships", sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True))

    # ─── promo_codes ───
    op.create_table(
        "promo_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("discount_type", sa.String(10), nullable=False),
        sa.Column("value", sa.Numeric(12, 2), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("times_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_foreign_key(
        "fk_memberships_promo_code_id", "memberships", "promo_codes",
        ["promo_code_id"], ["id"],
    )

    # ─── membership_freezes ───
    op.create_table(
        "membership_freezes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("membership_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("memberships.id"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("days_applied", sa.Integer(), nullable=True),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_membership_freezes_membership_id", "membership_freezes", ["membership_id"])

    # ─── audit_logs ───
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_staff_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_name", sa.String(255), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_logs_action_created", "audit_logs", ["action", "created_at"])
    op.create_index("ix_audit_logs_actor_staff_id", "audit_logs", ["actor_staff_id"])

    # ─── gym_settings (fila única; columnas de Wompi/WhatsApp listas para F4/F6) ───
    op.create_table(
        "gym_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("grace_days", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="America/Bogota"),
        sa.Column("receipt_prefix", sa.String(10), nullable=False, server_default="FC"),
        sa.Column("wompi_public_key", sa.String(255), nullable=True),
        sa.Column("wompi_private_key", sa.String(500), nullable=True),
        sa.Column("wompi_events_secret", sa.String(500), nullable=True),
        sa.Column("wompi_integrity_secret", sa.String(500), nullable=True),
        sa.Column("whatsapp_phone_number_id", sa.String(100), nullable=True),
        sa.Column("whatsapp_access_token", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ─── Backfill: arrancar consistentes — lo vencido queda 'expired' ───
    op.execute("""
        UPDATE memberships
        SET status = 'expired'
        WHERE status = 'active'
          AND end_date < (now() AT TIME ZONE 'America/Bogota')::date
    """)


def downgrade() -> None:
    op.drop_table("gym_settings")
    op.drop_index("ix_audit_logs_actor_staff_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action_created", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index("ix_membership_freezes_membership_id", table_name="membership_freezes")
    op.drop_table("membership_freezes")
    op.drop_constraint("fk_memberships_promo_code_id", "memberships", type_="foreignkey")
    op.drop_table("promo_codes")
    op.drop_column("memberships", "expired_at")
    op.drop_column("memberships", "promo_code_id")
    op.drop_column("memberships", "discount_reason")
    op.drop_column("memberships", "discount_amount")
    op.execute("CREATE TYPE membershipstatus AS ENUM ('active', 'expired', 'cancelled')")
    op.execute(
        "ALTER TABLE memberships ALTER COLUMN status TYPE membershipstatus "
        "USING (CASE WHEN status = 'frozen' THEN 'active' ELSE status END)::membershipstatus"
    )
