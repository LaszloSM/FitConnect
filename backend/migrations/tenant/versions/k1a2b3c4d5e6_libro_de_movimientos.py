"""K1: libro de movimientos de pagos e idempotencia de cobros

Revision ID: k1a2b3c4d5e6
Revises: c6d7e8f9a0b1
"""
from alembic import op

from app.db.tenant_align import K1_LIBRO_MOVIMIENTOS

revision = "k1a2b3c4d5e6"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Las tenant DBs se bootstrapean con create_all + stamp head, así que el
    # cuerpo de esta migración nunca corre en un gym ya creado: las mismas
    # sentencias viven en tenant_align para que el aligner las aplique.
    for statement in K1_LIBRO_MOVIMIENTOS:
        op.execute(statement)


def downgrade() -> None:
    """DESTRUCTIVO: borra el libro contable, que es la única evidencia de quién
    devolvió qué y por qué. Postgres no permite quitar un label de un enum, así
    que los pagos anulados vuelven a 'failed' para que el código viejo pueda
    leerlos sin reventar con LookupError."""
    op.execute("UPDATE payments SET status = 'failed' WHERE status = 'voided'")
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_entity")
    op.execute("DROP TABLE IF EXISTS payment_movements")
    op.execute("DROP TABLE IF EXISTS idempotency_keys")
    op.execute("ALTER TABLE payments DROP COLUMN IF EXISTS refunded_amount")
