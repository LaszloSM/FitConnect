"""tenant add db_name, db_connection_string, phone, address, city

Revision ID: c3d4e5f6a1b2
Revises: b2c3d4e5f6a1
Create Date: 2026-05-23 00:01:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a1b2'
down_revision: Union[str, None] = 'b2c3d4e5f6a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('db_name', sa.String(100), nullable=True))
    op.add_column('tenants', sa.Column('db_connection_string', sa.String(500), nullable=True))
    op.add_column('tenants', sa.Column('phone', sa.String(50), nullable=True))
    op.add_column('tenants', sa.Column('address', sa.String(500), nullable=True))
    op.add_column('tenants', sa.Column('city', sa.String(100), nullable=True))

    # Apply NOT NULL constraint after adding (table is empty in dev)
    op.alter_column('tenants', 'db_name', nullable=False)
    op.alter_column('tenants', 'db_connection_string', nullable=False)

    op.create_unique_constraint('uq_tenants_db_name', 'tenants', ['db_name'])


def downgrade() -> None:
    op.drop_constraint('uq_tenants_db_name', 'tenants', type_='unique')
    op.drop_column('tenants', 'city')
    op.drop_column('tenants', 'address')
    op.drop_column('tenants', 'phone')
    op.drop_column('tenants', 'db_connection_string')
    op.drop_column('tenants', 'db_name')
