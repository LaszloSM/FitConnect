"""Panel de plataforma, ciclo de suscripción de cada gym y recuperación de contraseña

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-08 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Valores nuevos del enum nativo (no se usan en esta misma transacción).
    op.execute("ALTER TYPE tenantstatus ADD VALUE IF NOT EXISTS 'trialing'")
    op.execute("ALTER TYPE tenantstatus ADD VALUE IF NOT EXISTS 'past_due'")
    op.add_column('tenants', sa.Column('trial_ends_at', sa.Date(), nullable=True))
    op.add_column('tenants', sa.Column('comp_until', sa.Date(), nullable=True))
    op.add_column('tenants', sa.Column('comp_reason', sa.String(255), nullable=True))
    op.add_column('tenants', sa.Column('status_changed_at', sa.DateTime(), nullable=True))
    op.add_column('tenants', sa.Column('modules', JSONB(), nullable=False, server_default='{}'))
    op.add_column('tenants', sa.Column('internal_notes', sa.Text(), nullable=True))

    op.create_table(
        'platform_admins',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('totp_secret_enc', sa.String(500), nullable=True),
        sa.Column('totp_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('backup_codes', JSONB(), nullable=True),
        sa.Column('failed_logins', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('locked_until', sa.DateTime(), nullable=True),
        sa.Column('last_login_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_platform_admins_email', 'platform_admins', ['email'], unique=True)

    op.create_table(
        'platform_audit_log',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('admin_id', UUID(as_uuid=True), nullable=True),
        sa.Column('admin_email', sa.String(255), nullable=True),
        sa.Column('action', sa.String(60), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), nullable=True),
        sa.Column('details', JSONB(), nullable=True),
        sa.Column('ip', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_platform_audit_log_admin_id', 'platform_audit_log', ['admin_id'])
    op.create_index('ix_platform_audit_log_tenant_id', 'platform_audit_log', ['tenant_id'])

    op.create_table(
        'password_resets',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('token_hash', sa.String(64), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_password_resets_token_hash', 'password_resets', ['token_hash'], unique=True)
    op.create_index('ix_password_resets_email', 'password_resets', ['email'])


def downgrade() -> None:
    op.drop_table('password_resets')
    op.drop_table('platform_audit_log')
    op.drop_table('platform_admins')
    for col in ('internal_notes', 'modules', 'status_changed_at', 'comp_reason', 'comp_until', 'trial_ends_at'):
        op.drop_column('tenants', col)
