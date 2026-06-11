"""f2: decisión de check-in (allowed/denied/override) con auditoría de overrides

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-06-10 01:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("checkins", sa.Column("decision", sa.String(20), nullable=False, server_default="allowed"))
    op.add_column("checkins", sa.Column("denial_reason", sa.String(50), nullable=True))
    op.add_column("checkins", sa.Column("override_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("checkins", sa.Column("override_reason", sa.String(255), nullable=True))
    op.create_foreign_key(
        "fk_checkins_override_by", "checkins", "users",
        ["override_by"], ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_checkins_override_by", "checkins", type_="foreignkey")
    op.drop_column("checkins", "override_reason")
    op.drop_column("checkins", "override_by")
    op.drop_column("checkins", "denial_reason")
    op.drop_column("checkins", "decision")
