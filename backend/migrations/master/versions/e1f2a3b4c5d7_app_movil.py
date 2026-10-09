"""App móvil: cuentas, sesiones, vínculos con gimnasios y consentimientos

Revision ID: e1f2a3b4c5d7
Revises: b8c9d0e1f2a3
Create Date: 2026-10-08 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'e1f2a3b4c5d7'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _user_fk():
    return sa.Column('app_user_id', UUID(as_uuid=True), sa.ForeignKey('app_users.id', ondelete='CASCADE'), nullable=False)


def upgrade() -> None:
    op.create_table(
        'app_users',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=True),
        sa.Column('terms_version', sa.String(20), nullable=False),
        sa.Column('terms_accepted_at', sa.DateTime(), nullable=False),
        sa.Column('last_login_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_app_users_email', 'app_users', ['email'], unique=True)

    op.create_table(
        'app_login_codes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('code_hash', sa.String(64), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_app_login_codes_email', 'app_login_codes', ['email'])

    op.create_table(
        'app_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        _user_fk(),
        sa.Column('token_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('previous_hash', sa.String(64), nullable=True),
        sa.Column('device_name', sa.String(120), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_app_sessions_app_user_id', 'app_sessions', ['app_user_id'])
    op.create_index('ix_app_sessions_previous_hash', 'app_sessions', ['previous_hash'])

    op.create_table(
        'member_links',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        _user_fk(),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('db_name', sa.String(100), nullable=False),
        sa.Column('member_id', UUID(as_uuid=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_member_links_app_user_id', 'member_links', ['app_user_id'])
    op.create_index('uq_member_links_active_member', 'member_links', ['tenant_id', 'member_id'], unique=True,
                    postgresql_where=sa.text('revoked_at IS NULL'))
    op.create_index('uq_member_links_active_user', 'member_links', ['app_user_id', 'tenant_id'], unique=True,
                    postgresql_where=sa.text('revoked_at IS NULL'))

    op.create_table(
        'app_link_codes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('code_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('member_id', UUID(as_uuid=True), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by', UUID(as_uuid=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_app_link_codes_member_id', 'app_link_codes', ['member_id'])

    op.create_table(
        'app_consents',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        _user_fk(),
        sa.Column('kind', sa.String(30), nullable=False),
        sa.Column('granted', sa.Boolean(), nullable=False),
        sa.Column('version', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_app_consents_app_user_id', 'app_consents', ['app_user_id'])

    op.create_table(
        'app_push_tokens',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        _user_fk(),
        sa.Column('token', sa.String(255), nullable=False, unique=True),
        sa.Column('platform', sa.String(10), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_app_push_tokens_app_user_id', 'app_push_tokens', ['app_user_id'])


def downgrade() -> None:
    for t in ('app_push_tokens', 'app_consents', 'app_link_codes', 'member_links', 'app_sessions',
              'app_login_codes', 'app_users'):
        op.drop_table(t)
