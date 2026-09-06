"""DDL idempotente que create_all NO aplica sobre tablas ya existentes.

create_all crea tablas/secuencias/índices nuevos pero nunca agrega columnas ni
relaja NOT NULL en tablas que ya existen. Cada migración tenant que toque
tablas existentes registra aquí sus sentencias (todas IF NOT EXISTS / idempotentes)
para que `migrate_tenants.py` las aplique a los tenants ya creados y la propia
migración las reutilice sin duplicar.
"""

J1_INGRESOS_PASE_TRANSFERENCIAS: list[str] = [
    "CREATE SEQUENCE IF NOT EXISTS transfer_ref_seq START 1",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'other'",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS destination_account_id VARCHAR(36) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS transfer_reference VARCHAR(20) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_url VARCHAR(500) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_uploaded_at TIMESTAMP NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_approval_code VARCHAR(50) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_terminal VARCHAR(100) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_note VARCHAR(255) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason VARCHAR(500) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_by UUID NULL REFERENCES users(id)",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_expense_id UUID NULL REFERENCES expenses(id)",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS void_reason VARCHAR(500) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_by UUID NULL REFERENCES users(id)",
    "CREATE INDEX IF NOT EXISTS ix_payments_kind_created ON payments (kind, created_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_transfer_reference "
    "ON payments (transfer_reference) WHERE transfer_reference IS NOT NULL",
    "UPDATE payments SET kind = 'membership' WHERE kind = 'other' AND membership_id IS NOT NULL",
    "UPDATE payments p SET kind = 'product' WHERE p.kind = 'other' "
    "AND EXISTS (SELECT 1 FROM payment_items i WHERE i.payment_id = p.id AND i.product_id IS NOT NULL)",
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS member_type VARCHAR(20) NOT NULL DEFAULT 'member'",
    "ALTER TABLE members ALTER COLUMN email DROP NOT NULL",
    "ALTER TABLE members DROP CONSTRAINT IF EXISTS uq_member_email",
    "DROP INDEX IF EXISTS uq_member_email",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_member_email ON members (email) WHERE email IS NOT NULL",
    "ALTER TABLE gym_settings ADD COLUMN IF NOT EXISTS transfer_auto_void_hours INTEGER NOT NULL DEFAULT 24",
]

J2_INVENTARIO: list[str] = [
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID NULL REFERENCES product_categories(id)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) NULL",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(50) NULL",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(64) NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_products_sku ON products (sku) WHERE sku IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_products_barcode ON products (barcode) WHERE barcode IS NOT NULL",
    # Saldo inicial: un movimiento por producto que aún no tiene historial
    "INSERT INTO stock_movements (id, product_id, type, quantity, unit_cost, stock_after, note, created_at) "
    "SELECT gen_random_uuid(), p.id, 'adjustment', p.stock, p.cost_price, p.stock, 'Saldo inicial', now() "
    "FROM products p WHERE p.stock <> 0 AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id)",
]

# Orden cronológico: el aligner las aplica todas, en orden, tras create_all.
ALIGN_STATEMENTS: list[str] = [*J1_INGRESOS_PASE_TRANSFERENCIAS, *J2_INVENTARIO]
