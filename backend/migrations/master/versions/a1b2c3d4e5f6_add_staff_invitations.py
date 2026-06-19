"""add staff_invitations (invitaciones de staff por token de un solo uso)

Revision ID: a1b2c3d4e5f6
Revises: f6a1b2c3d4e5
Create Date: 2026-06-19 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f6a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'staff_invitations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('token_hash', sa.String(64), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), nullable=False),
        sa.Column('db_name', sa.String(255), nullable=False),
        sa.Column('invited_by', UUID(as_uuid=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_staff_invitations_token_hash', 'staff_invitations', ['token_hash'])
    op.create_index('ix_staff_invitations_email', 'staff_invitations', ['email'])
    op.create_index('ix_staff_invitations_tenant_id', 'staff_invitations', ['tenant_id'])
    op.create_unique_constraint('uq_staff_invitations_token_hash', 'staff_invitations', ['token_hash'])


def downgrade() -> None:
    op.drop_constraint('uq_staff_invitations_token_hash', 'staff_invitations', type_='unique')
    op.drop_index('ix_staff_invitations_tenant_id', table_name='staff_invitations')
    op.drop_index('ix_staff_invitations_email', table_name='staff_invitations')
    op.drop_index('ix_staff_invitations_token_hash', table_name='staff_invitations')
    op.drop_table('staff_invitations')
