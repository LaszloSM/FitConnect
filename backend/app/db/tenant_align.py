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

J4_CONSENTIMIENTOS: list[str] = [
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS consent_data_at TIMESTAMP NULL",
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS consent_image_at TIMESTAMP NULL",
]

J6_ACCESO: list[str] = [
    "ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'kiosk'",
    "ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS vendor VARCHAR(30) NULL",
    "ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS model VARCHAR(60) NULL",
    "ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS serial VARCHAR(80) NULL",
    "ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS location VARCHAR(80) NULL",
    "ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS offline_policy VARCHAR(20) NOT NULL DEFAULT 'deny'",
    "ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb",
    """CREATE TABLE IF NOT EXISTS biometric_consents (
        id UUID PRIMARY KEY,
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        kind VARCHAR(20) NOT NULL,
        text_version VARCHAR(20) NOT NULL DEFAULT 'v1',
        signature_method VARCHAR(20) NOT NULL DEFAULT 'checkbox',
        document_key VARCHAR(500) NULL,
        signed_at TIMESTAMP NOT NULL DEFAULT now(),
        signed_by_staff UUID NULL REFERENCES users(id),
        revoked_at TIMESTAMP NULL,
        revoked_by UUID NULL REFERENCES users(id)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_biometric_consents_member_id ON biometric_consents (member_id)",
    """CREATE TABLE IF NOT EXISTS member_credentials (
        id UUID PRIMARY KEY,
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        device_id UUID NULL REFERENCES kiosk_devices(id) ON DELETE SET NULL,
        kind VARCHAR(20) NOT NULL,
        device_user_id VARCHAR(64) NOT NULL,
        label VARCHAR(80) NULL,
        consent_id UUID NULL REFERENCES biometric_consents(id) ON DELETE SET NULL,
        enrolled_at TIMESTAMP NOT NULL DEFAULT now(),
        enrolled_by UUID NULL REFERENCES users(id),
        revoked_at TIMESTAMP NULL,
        revoked_by UUID NULL REFERENCES users(id)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_member_credentials_member_id ON member_credentials (member_id)",
    "CREATE INDEX IF NOT EXISTS ix_member_credentials_lookup ON member_credentials (kind, device_user_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_member_credentials_global ON member_credentials (kind, device_user_id) WHERE revoked_at IS NULL AND device_id IS NULL",
    """CREATE TABLE IF NOT EXISTS access_events (
        id UUID PRIMARY KEY,
        device_id UUID NULL REFERENCES kiosk_devices(id) ON DELETE SET NULL,
        member_id UUID NULL REFERENCES members(id) ON DELETE SET NULL,
        credential_kind VARCHAR(20) NOT NULL DEFAULT 'id_number',
        credential_ref VARCHAR(64) NULL,
        direction VARCHAR(10) NOT NULL DEFAULT 'entry',
        decision VARCHAR(20) NOT NULL,
        reason VARCHAR(40) NULL,
        offline BOOLEAN NOT NULL DEFAULT false,
        client_event_id VARCHAR(64) NULL,
        checkin_id UUID NULL REFERENCES checkins(id) ON DELETE SET NULL,
        occurred_at TIMESTAMP NOT NULL DEFAULT now(),
        created_at TIMESTAMP NOT NULL DEFAULT now()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_access_events_member_id ON access_events (member_id)",
    "CREATE INDEX IF NOT EXISTS ix_access_events_device_time ON access_events (device_id, occurred_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_access_events_client ON access_events (device_id, client_event_id) WHERE client_event_id IS NOT NULL",
]

J7_VIDEO_EJERCICIOS: list[str] = [
    """CREATE TABLE IF NOT EXISTS exercise_media (
        id UUID PRIMARY KEY,
        exercise_id UUID NOT NULL,
        video_url VARCHAR(500) NOT NULL,
        poster_url VARCHAR(500) NULL,
        uploaded_by UUID NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT now()
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_exercise_media_exercise ON exercise_media (exercise_id)",
]

J8_GYM_SETTINGS_FLAGS: list[str] = [
    # b7c8d9e0f1a2_cash_shifts_enabled.py
    "ALTER TABLE gym_settings ADD COLUMN IF NOT EXISTS cash_shifts_enabled BOOLEAN NOT NULL DEFAULT true",
    # c9d0e1f2a3b4_tour_completed_at.py
    "ALTER TABLE gym_settings ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMP NULL",
]

# Orden cronológico: el aligner las aplica todas, en orden, tras create_all.
ALIGN_STATEMENTS: list[str] = [*J1_INGRESOS_PASE_TRANSFERENCIAS, *J2_INVENTARIO, *J4_CONSENTIMIENTOS, *J6_ACCESO, *J7_VIDEO_EJERCICIOS, *J8_GYM_SETTINGS_FLAGS]
