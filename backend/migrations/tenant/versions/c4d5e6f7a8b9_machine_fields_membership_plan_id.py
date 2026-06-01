"""machines: area/last_maintenance/photo + memberships.plan_id con backfill

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-05-31 02:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── machines: campos del nuevo formulario ───
    op.add_column("machines", sa.Column("area", sa.String(50), nullable=True))
    op.add_column("machines", sa.Column("last_maintenance_date", sa.Date(), nullable=True))
    op.add_column("machines", sa.Column("photo_url", sa.String(500), nullable=True))

    # ─── memberships.plan_id (FK al catálogo) con backfill por nombre ───
    op.add_column("memberships", sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_memberships_plan_id", "memberships", ["plan_id"])
    op.create_foreign_key(
        "fk_memberships_plan_id", "memberships", "member_plans",
        ["plan_id"], ["id"],
    )
    # Backfill: matchear membresías existentes con su plan por nombre
    op.execute("""
        UPDATE memberships m
        SET plan_id = p.id
        FROM member_plans p
        WHERE m.plan_id IS NULL AND m.plan_name = p.name
    """)


def downgrade() -> None:
    op.drop_constraint("fk_memberships_plan_id", "memberships", type_="foreignkey")
    op.drop_index("ix_memberships_plan_id", table_name="memberships")
    op.drop_column("memberships", "plan_id")
    op.drop_column("machines", "photo_url")
    op.drop_column("machines", "last_maintenance_date")
    op.drop_column("machines", "area")
