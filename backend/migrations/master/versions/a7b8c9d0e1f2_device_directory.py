"""device_directory: serial del torniquete -> gimnasio (ZKTeco ADMS)

Revision ID: a7b8c9d0e1f2
Revises: c8d9e0f1a2b3
Create Date: 2026-10-08 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'device_directory',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('serial', sa.String(80), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), nullable=False),
        sa.Column('db_name', sa.String(255), nullable=False),
        sa.Column('device_id', UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_device_directory_serial', 'device_directory', ['serial'])
    op.create_index('ix_device_directory_tenant_id', 'device_directory', ['tenant_id'])
    op.create_unique_constraint('uq_device_directory_serial', 'device_directory', ['serial'])


def downgrade() -> None:
    op.drop_table('device_directory')
