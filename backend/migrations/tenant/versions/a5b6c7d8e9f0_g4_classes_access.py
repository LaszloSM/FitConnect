"""g4: instructores + access rules de planes (snapshot en membresías)

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-06-11 03:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "instructors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("photo_url", sa.String(500), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("specialty", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.add_column("gym_classes", sa.Column(
        "instructor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("instructors.id"), nullable=True
    ))
    # Backfill no destructivo: los planes y membresías existentes quedan con
    # acceso completo ilimitado (era el comportamiento implícito hasta hoy).
    op.add_column("member_plans", sa.Column(
        "access_type", sa.String(20), nullable=False, server_default="gym_and_classes"
    ))
    op.add_column("member_plans", sa.Column("class_credits_per_month", sa.Integer(), nullable=True))
    op.add_column("memberships", sa.Column(
        "access_type", sa.String(20), nullable=False, server_default="gym_and_classes"
    ))
    op.add_column("memberships", sa.Column("class_credits_per_month", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("memberships", "class_credits_per_month")
    op.drop_column("memberships", "access_type")
    op.drop_column("member_plans", "class_credits_per_month")
    op.drop_column("member_plans", "access_type")
    op.drop_column("gym_classes", "instructor_id")
    op.drop_table("instructors")
