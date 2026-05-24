"""member_fields_v2_gymclass_schedule

Revision ID: a1b2c3d4e5f6
Revises: ef77a9a26fa3
Create Date: 2026-05-23 00:00:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "ef77a9a26fa3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── Enums nuevos ───
    op.execute("CREATE TYPE idtype AS ENUM ('CC','NIT','CE','PP','TI')")
    op.execute("CREATE TYPE gender AS ENUM ('M','F','other')")
    op.execute("CREATE TYPE traininggoal AS ENUM ('weight_loss','muscle_gain','endurance','flexibility','general_fitness')")
    op.execute("CREATE TYPE classcategory AS ENUM ('yoga','crossfit','spinning','pilates','funcional','zumba','boxeo','natacion','otro')")
    op.execute("CREATE TYPE classdifficulty AS ENUM ('beginner','intermediate','advanced')")
    op.execute("CREATE TYPE sessionstatus AS ENUM ('scheduled','cancelled','completed')")

    # ─── Campos nuevos en members ───
    op.add_column("members", sa.Column("id_type", sa.Enum("CC","NIT","CE","PP","TI", name="idtype"), nullable=True))
    op.add_column("members", sa.Column("gender", sa.Enum("M","F","other", name="gender"), nullable=True))
    op.add_column("members", sa.Column("address", sa.String(500), nullable=True))
    op.add_column("members", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("members", sa.Column("emergency_contact_name", sa.String(255), nullable=True))
    op.add_column("members", sa.Column("emergency_contact_phone", sa.String(50), nullable=True))
    op.add_column("members", sa.Column("blood_type", sa.String(5), nullable=True))
    op.add_column("members", sa.Column("photo_url", sa.String(500), nullable=True))
    op.add_column("members", sa.Column("parq_answers", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("members", sa.Column("parq_completed_at", sa.Date(), nullable=True))
    op.add_column("members", sa.Column("training_goal", sa.Enum("weight_loss","muscle_gain","endurance","flexibility","general_fitness", name="traininggoal"), nullable=True))
    op.add_column("members", sa.Column("qr_code", sa.String(36), nullable=True))
    op.create_unique_constraint("uq_members_qr_code", "members", ["qr_code"])
    op.create_index("ix_members_qr_code", "members", ["qr_code"])

    # Generar qr_code único para miembros existentes
    op.execute("""
        UPDATE members
        SET qr_code = gen_random_uuid()::text
        WHERE qr_code IS NULL
    """)

    # ─── Campos nuevos en gym_classes ───
    op.alter_column("gym_classes", "schedule", nullable=True)
    op.add_column("gym_classes", sa.Column("weekdays", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("gym_classes", sa.Column("start_time", sa.Time(), nullable=True))
    op.add_column("gym_classes", sa.Column("category", sa.String(50), nullable=True))
    op.add_column("gym_classes", sa.Column("difficulty", sa.String(20), nullable=True))
    op.add_column("gym_classes", sa.Column("color", sa.String(7), nullable=True))

    # ─── Nueva tabla class_sessions ───
    op.create_table(
        "class_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("gym_class_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gym_classes.id"), nullable=False, index=True),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="scheduled"),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("instructor_override", sa.String(255), nullable=True),
        sa.Column("capacity_override", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("class_sessions")

    op.drop_column("gym_classes", "color")
    op.drop_column("gym_classes", "difficulty")
    op.drop_column("gym_classes", "category")
    op.drop_column("gym_classes", "start_time")
    op.drop_column("gym_classes", "weekdays")
    op.alter_column("gym_classes", "schedule", nullable=False)

    op.drop_index("ix_members_qr_code", table_name="members")
    op.drop_constraint("uq_members_qr_code", "members", type_="unique")
    op.drop_column("members", "qr_code")
    op.drop_column("members", "training_goal")
    op.drop_column("members", "parq_completed_at")
    op.drop_column("members", "parq_answers")
    op.drop_column("members", "photo_url")
    op.drop_column("members", "blood_type")
    op.drop_column("members", "emergency_contact_phone")
    op.drop_column("members", "emergency_contact_name")
    op.drop_column("members", "city")
    op.drop_column("members", "address")
    op.drop_column("members", "gender")
    op.drop_column("members", "id_type")

    op.execute("DROP TYPE IF EXISTS sessionstatus")
    op.execute("DROP TYPE IF EXISTS classdifficulty")
    op.execute("DROP TYPE IF EXISTS classcategory")
    op.execute("DROP TYPE IF EXISTS traininggoal")
    op.execute("DROP TYPE IF EXISTS gender")
    op.execute("DROP TYPE IF EXISTS idtype")
