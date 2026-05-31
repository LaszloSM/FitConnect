"""add staff_directory index (email -> tenant) para login de staff

Revision ID: d4e5f6a1b2c3
Revises: c3d4e5f6a1b2
Create Date: 2026-05-31 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'd4e5f6a1b2c3'
down_revision: Union[str, None] = 'c3d4e5f6a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'staff_directory',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), nullable=False),
        sa.Column('db_name', sa.String(255), nullable=False),
        sa.Column('staff_id', UUID(as_uuid=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_staff_directory_email', 'staff_directory', ['email'])
    op.create_index('ix_staff_directory_tenant_id', 'staff_directory', ['tenant_id'])
    op.create_unique_constraint('uq_staff_directory_email', 'staff_directory', ['email'])


def downgrade() -> None:
    op.drop_constraint('uq_staff_directory_email', 'staff_directory', type_='unique')
    op.drop_index('ix_staff_directory_tenant_id', table_name='staff_directory')
    op.drop_index('ix_staff_directory_email', table_name='staff_directory')
    op.drop_table('staff_directory')
