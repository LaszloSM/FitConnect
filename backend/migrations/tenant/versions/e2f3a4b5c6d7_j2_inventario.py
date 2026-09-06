"""j2: inventario real — categorías, costo, sku/barcode y movimientos de stock

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-09-06
"""
from alembic import op

from app.db.tenant_align import J2_INVENTARIO

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS product_categories (
            id UUID PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS stock_movements (
            id UUID PRIMARY KEY,
            product_id UUID NOT NULL REFERENCES products(id),
            type VARCHAR(20) NOT NULL,
            quantity INTEGER NOT NULL,
            unit_cost NUMERIC(12,2) NULL,
            stock_after INTEGER NOT NULL,
            note VARCHAR(255) NULL,
            payment_id UUID NULL REFERENCES payments(id),
            created_by UUID NULL REFERENCES users(id),
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_stock_movements_product_created ON stock_movements (product_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_stock_movements_payment_id ON stock_movements (payment_id)")
    for sql in J2_INVENTARIO:
        op.execute(sql)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_products_barcode")
    op.execute("DROP INDEX IF EXISTS uq_products_sku")
    for col in ("category_id", "cost_price", "sku", "barcode"):
        op.execute(f"ALTER TABLE products DROP COLUMN IF EXISTS {col}")
    op.execute("DROP TABLE IF EXISTS stock_movements")
    op.execute("DROP TABLE IF EXISTS product_categories")
