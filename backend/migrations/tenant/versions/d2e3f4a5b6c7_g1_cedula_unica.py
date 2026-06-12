"""g1: cédula (id_number) única — dedupe + índice único parcial

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dedupe previo: a los repetidos se les anula la cédula conservando el más
    # antiguo. Los afectados quedan logueados para que el gym los corrija.
    conn = op.get_bind()
    duplicated = conn.execute(sa.text(
        """
        SELECT m.id, m.full_name, m.id_number
        FROM members m
        JOIN (
            SELECT id_number, MIN(created_at) AS first_created
            FROM members
            WHERE id_number IS NOT NULL
            GROUP BY id_number
            HAVING COUNT(*) > 1
        ) d ON d.id_number = m.id_number
        WHERE m.created_at > d.first_created
        """
    )).fetchall()
    for row in duplicated:
        print(f"[g1] cédula duplicada anulada: member={row.id} {row.full_name} id_number={row.id_number}")
    conn.execute(sa.text(
        """
        UPDATE members m SET id_number = NULL
        FROM (
            SELECT id_number, MIN(created_at) AS first_created
            FROM members
            WHERE id_number IS NOT NULL
            GROUP BY id_number
            HAVING COUNT(*) > 1
        ) d
        WHERE m.id_number = d.id_number AND m.created_at > d.first_created
        """
    ))

    op.create_index(
        "uq_member_id_number",
        "members",
        ["id_number"],
        unique=True,
        postgresql_where=sa.text("id_number IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_member_id_number", table_name="members")
