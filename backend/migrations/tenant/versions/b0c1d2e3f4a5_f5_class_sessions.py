"""f5: clases por sesión — class_sessions (si falta) + session_bookings

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-06-10 04:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b0c1d2e3f4a5"
down_revision: Union[str, None] = "a9b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "class_sessions" not in inspector.get_table_names():
        op.create_table(
            "class_sessions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("gym_class_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gym_classes.id"), nullable=False),
            sa.Column("session_date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="scheduled"),
            sa.Column("notes", sa.String(500), nullable=True),
            sa.Column("location_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("locations.id"), nullable=True),
            sa.Column("instructor_override", sa.String(255), nullable=True),
            sa.Column("capacity_override", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_class_sessions_gym_class_id", "class_sessions", ["gym_class_id"])
    else:
        cols = {c["name"] for c in inspector.get_columns("class_sessions")}
        if "location_id" not in cols:
            op.add_column("class_sessions", sa.Column("location_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("locations.id"), nullable=True))

    op.create_unique_constraint(
        "uq_session_class_date_time", "class_sessions",
        ["gym_class_id", "session_date", "start_time"],
    )

    op.create_table(
        "session_bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("class_sessions.id"), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("members.id"), nullable=False),
        sa.Column("status", sa.String(15), nullable=False, server_default="booked"),
        sa.Column("waitlist_position", sa.Integer(), nullable=True),
        sa.Column("booked_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "member_id", name="uq_session_member"),
    )
    op.create_index("ix_session_bookings_session_id", "session_bookings", ["session_id"])
    op.create_index("ix_session_bookings_member_id", "session_bookings", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_session_bookings_member_id", table_name="session_bookings")
    op.drop_index("ix_session_bookings_session_id", table_name="session_bookings")
    op.drop_table("session_bookings")
    op.drop_constraint("uq_session_class_date_time", "class_sessions", type_="unique")
