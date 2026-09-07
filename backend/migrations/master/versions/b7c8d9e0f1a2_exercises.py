"""biblioteca global de ejercicios (free-exercise-db)

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-09-06
"""
from typing import Sequence, Union
from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS exercises (
            id UUID PRIMARY KEY,
            slug VARCHAR(120) NOT NULL UNIQUE,
            name_en VARCHAR(200) NOT NULL,
            name_es VARCHAR(200) NOT NULL,
            category VARCHAR(40) NOT NULL,
            level VARCHAR(20) NOT NULL,
            force VARCHAR(20) NULL,
            mechanic VARCHAR(20) NULL,
            equipment VARCHAR(40) NULL,
            primary_muscles VARCHAR(40)[] NOT NULL DEFAULT '{}',
            secondary_muscles VARCHAR(40)[] NOT NULL DEFAULT '{}',
            instructions_en JSONB NOT NULL DEFAULT '[]',
            instructions_es JSONB NOT NULL DEFAULT '[]',
            images JSONB NOT NULL DEFAULT '[]',
            sort_weight INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_exercises_search ON exercises (name_es, name_en)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS exercises")
