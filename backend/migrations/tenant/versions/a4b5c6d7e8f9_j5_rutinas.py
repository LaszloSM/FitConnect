"""j5: rutinas del gym (días, ejercicios) y asignación a socios

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-09-06
"""
from alembic import op

revision = "a4b5c6d7e8f9"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS routines (
            id UUID PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            description VARCHAR(1000) NULL,
            goal VARCHAR(40) NULL,
            level VARCHAR(20) NOT NULL DEFAULT 'beginner',
            days_per_week INTEGER NOT NULL DEFAULT 3,
            is_public_on_screen BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID NULL REFERENCES users(id),
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS routine_days (
            id UUID PRIMARY KEY,
            routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
            day_index INTEGER NOT NULL,
            title VARCHAR(80) NOT NULL,
            notes VARCHAR(500) NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_routine_days_routine_id ON routine_days (routine_id)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS routine_exercises (
            id UUID PRIMARY KEY,
            day_id UUID NOT NULL REFERENCES routine_days(id) ON DELETE CASCADE,
            exercise_id UUID NOT NULL,
            exercise_name VARCHAR(200) NOT NULL,
            "order" INTEGER NOT NULL DEFAULT 0,
            sets INTEGER NOT NULL DEFAULT 3,
            reps VARCHAR(40) NOT NULL DEFAULT '10-12',
            rest_seconds INTEGER NOT NULL DEFAULT 60,
            notes VARCHAR(300) NULL,
            video_url VARCHAR(500) NULL
        )
    """)
    op.execute('CREATE INDEX IF NOT EXISTS ix_routine_exercises_day_order ON routine_exercises (day_id, "order")')
    op.execute("""
        CREATE TABLE IF NOT EXISTS member_routines (
            id UUID PRIMARY KEY,
            member_id UUID NOT NULL REFERENCES members(id),
            routine_id UUID NOT NULL REFERENCES routines(id),
            assigned_by UUID NULL REFERENCES users(id),
            assigned_at TIMESTAMP NOT NULL DEFAULT now(),
            ended_at TIMESTAMP NULL,
            notes VARCHAR(500) NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_member_routines_member ON member_routines (member_id, assigned_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS member_routines")
    op.execute("DROP TABLE IF EXISTS routine_exercises")
    op.execute("DROP TABLE IF EXISTS routine_days")
    op.execute("DROP TABLE IF EXISTS routines")
