"""Garantia, proveedor y QR de reporte por maquina; foto en el historial.

Revision ID: k7a8b9c0d1e2
Revises: k6f7a8b9c0d1
"""
from alembic import op

from app.db.tenant_align import K7_MANTENIMIENTO

revision = "k7a8b9c0d1e2"
down_revision = "k6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for sql in K7_MANTENIMIENTO:
        op.execute(sql)


def downgrade() -> None:
    op.execute("ALTER TABLE maintenance_logs DROP COLUMN IF EXISTS photo_url")
    op.execute("DROP INDEX IF EXISTS uq_machines_report_token")
    for col in ("report_token", "warranty_until", "supplier", "purchase_date"):
        op.execute(f"ALTER TABLE machines DROP COLUMN IF EXISTS {col}")
