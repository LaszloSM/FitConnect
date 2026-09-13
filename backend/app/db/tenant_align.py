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

K1_LIBRO_MOVIMIENTOS: list[str] = [
    # k1a2b3c4d5e6_libro_de_movimientos.py
    """CREATE TABLE IF NOT EXISTS payment_movements (
        id UUID PRIMARY KEY,
        payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        kind VARCHAR(20) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        reason VARCHAR(500) NULL,
        actor_staff_id UUID NULL REFERENCES users(id),
        actor_name VARCHAR(255) NOT NULL,
        shift_id UUID NULL REFERENCES cash_shifts(id),
        expense_id UUID NULL REFERENCES expenses(id),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_payment_movements_payment_id ON payment_movements (payment_id)",
    "CREATE INDEX IF NOT EXISTS ix_payment_movements_payment ON payment_movements (payment_id, created_at)",
    """CREATE TABLE IF NOT EXISTS idempotency_keys (
        id UUID PRIMARY KEY,
        key VARCHAR(64) NOT NULL,
        endpoint VARCHAR(80) NOT NULL,
        request_hash VARCHAR(64) NOT NULL,
        status_code INTEGER NOT NULL,
        response JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
    )""",
    # El modelo declara UniqueConstraint, no un índice suelto: en pg_constraint,
    # no solo en pg_indexes.
    """DO $$ BEGIN
        ALTER TABLE idempotency_keys ADD CONSTRAINT uq_idempotency_key UNIQUE (key);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$""",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0",
    # 'voided' separa la anulación manual del rechazo de la pasarela, que
    # compartían el estado 'failed' y eran indistinguibles en los reportes.
    "ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'voided' AFTER 'failed'",
    "CREATE INDEX IF NOT EXISTS ix_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at)",
    "CREATE INDEX IF NOT EXISTS ix_idempotency_keys_created ON idempotency_keys (created_at)",
    # Los pagos anteriores al libro tendrían la pantalla de movimientos en blanco:
    # se les crea su línea de apertura de una vez para todo el fleet.
    """INSERT INTO payment_movements (id, payment_id, kind, amount, reason, actor_name, created_at, updated_at)
       SELECT gen_random_uuid(), p.id, 'charge', p.amount, p.concept, 'sistema', p.created_at, p.created_at
       FROM payments p
       WHERE NOT EXISTS (SELECT 1 FROM payment_movements m WHERE m.payment_id = p.id AND m.kind = 'charge')""",
    # Los devueltos de antes del libro tienen refunded_amount en 0: sin esto
    # conviven dos escalas en la misma columna de los reportes.
    "UPDATE payments SET refunded_amount = amount WHERE status = 'refunded' AND refunded_amount = 0",
    """INSERT INTO payment_movements (id, payment_id, kind, amount, reason, actor_name, created_at, updated_at)
       SELECT gen_random_uuid(), p.id, 'refund', -p.amount, p.refund_reason, 'sistema',
              COALESCE(p.refunded_at, p.created_at), COALESCE(p.refunded_at, p.created_at)
       FROM payments p
       WHERE p.status = 'refunded'
         AND NOT EXISTS (SELECT 1 FROM payment_movements m WHERE m.payment_id = p.id AND m.kind = 'refund')""",
]

K2_MENSAJERIA: list[str] = [
    # k2b3c4d5e6f7_mensajeria_real.py
    """CREATE TABLE IF NOT EXISTS announcements (
        id UUID PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        body TEXT NOT NULL,
        segment VARCHAR(40) NOT NULL,
        segment_params JSONB NULL,
        meta_template_name VARCHAR(100) NULL,
        recipients INTEGER NOT NULL,
        sent_at TIMESTAMP NULL,
        sent_by UUID NULL REFERENCES users(id),
        sent_by_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
    )""",
    # El ciclo de aprobación de Meta no existe dentro de esta app: `meta_status`
    # solo se movía a 'draft' y la UI pintaba estados imposibles.
    "ALTER TABLE message_templates DROP COLUMN IF EXISTS meta_status",
    # `channel` y `header_image_url` se persistían y no los leía el envío.
    "ALTER TABLE message_templates DROP COLUMN IF EXISTS channel",
    "ALTER TABLE message_templates DROP COLUMN IF EXISTS header_image_url",
    # Cuatro toggles que ningún emisor consultaba.
    "ALTER TABLE users DROP COLUMN IF EXISTS notification_prefs",
    # Las claves de ocasión se unifican con el catálogo (antes convivían
    # `membership_expiring` y `membership.expiring` en dos catálogos paralelos).
    "UPDATE message_templates SET meta_template_name = 'recordatorio_vencimiento' "
    "WHERE occasion = 'membership_expiring' AND meta_template_name IS NULL",
    "UPDATE message_templates SET meta_template_name = 'recordatorio_vencido' "
    "WHERE occasion = 'membership_overdue' AND meta_template_name IS NULL",
    "UPDATE message_templates SET meta_template_name = 'confirmacion_pago' "
    "WHERE occasion = 'payment_confirmed' AND meta_template_name IS NULL",
    "UPDATE message_templates SET meta_template_name = 'bienvenida' "
    "WHERE occasion = 'welcome' AND meta_template_name IS NULL",
    "UPDATE message_templates SET meta_template_name = 'cumpleanos' "
    "WHERE occasion = 'birthday' AND meta_template_name IS NULL",
    "UPDATE message_templates SET meta_template_name = 'te_extranamos' "
    "WHERE occasion = 'winback' AND meta_template_name IS NULL",
    "CREATE INDEX IF NOT EXISTS ix_notification_outbox_status ON notification_outbox (status, scheduled_for)",
]

# Orden cronológico: el aligner las aplica todas, en orden, tras create_all.
K3_ENTRENADORES: list[str] = [
    # k3c4d5e6f7a8_entrenadores.py
    # El rol nuevo en el enum de Postgres: `create_all` no toca un tipo que ya
    # existe, así que un tenant viejo se quedaría sin poder guardar 'trainer'.
    "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'trainer'",
    # La persona del catálogo de instructores y su usuario son la misma: el
    # vínculo se agrega, las clases ya existentes no se tocan.
    "ALTER TABLE instructors ADD COLUMN IF NOT EXISTS staff_id UUID NULL REFERENCES users(id)",
    """DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_instructor_staff') THEN
            ALTER TABLE instructors ADD CONSTRAINT uq_instructor_staff UNIQUE (staff_id);
        END IF;
    END $$""",
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS trainer_id UUID NULL REFERENCES instructors(id)",
    "CREATE INDEX IF NOT EXISTS ix_members_trainer_id ON members (trainer_id)",
    # Derechos del plan y su snapshot en la membresía: lo comprado no cambia
    # aunque el plan se edite después.
    "ALTER TABLE member_plans ADD COLUMN IF NOT EXISTS includes_trainer BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE member_plans ADD COLUMN IF NOT EXISTS trainer_sessions_per_month INTEGER NULL",
    "ALTER TABLE memberships ADD COLUMN IF NOT EXISTS includes_trainer BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE memberships ADD COLUMN IF NOT EXISTS trainer_sessions_per_month INTEGER NULL",
    # El reemplazo por sesión deja de ser texto libre.
    "ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS instructor_override_id UUID NULL REFERENCES instructors(id)",
]

K4_MAQUINAS: list[str] = [
    # k4d5e6f7a8b9_maquinas.py
    # Preventivo y correctivo no son lo mismo: solo el primero reinicia el ciclo.
    "ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'preventivo'",
    "ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS reported_by VARCHAR(255) NULL",
    # Borrar una máquina con historial devolvía 500: la FK no tenía cascada.
    """DO $$
    DECLARE nombre text;
    BEGIN
        SELECT conname INTO nombre FROM pg_constraint
        WHERE conrelid = 'maintenance_logs'::regclass AND contype = 'f'
          AND confrelid = 'machines'::regclass
        LIMIT 1;
        IF nombre IS NOT NULL THEN
            EXECUTE format('ALTER TABLE maintenance_logs DROP CONSTRAINT %I', nombre);
        END IF;
        ALTER TABLE maintenance_logs
            ADD CONSTRAINT maintenance_logs_machine_id_fkey
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE;
    END $$""",
]

K5_STAFF_SOCIO: list[str] = [
    # k5e6f7a8b9c0_staff_socio.py
    # El personal del gimnasio tambien entrena aqui: su ficha de socio le da QR,
    # huella y torniquete sin tocar el motor de acceso.
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS staff_id UUID NULL REFERENCES users(id)",
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS instructor_profile_id UUID NULL REFERENCES instructors(id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_members_staff_id ON members (staff_id) WHERE staff_id IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_members_instructor_profile_id "
    "ON members (instructor_profile_id) WHERE instructor_profile_id IS NOT NULL",
]

K6_CAJA: list[str] = [
    # k6f7a8b9c0d1_arqueo_y_retiros.py
    # Arqueo por denominaciones y retiros a boveda durante el turno.
    "ALTER TABLE cash_shifts ADD COLUMN IF NOT EXISTS denominations JSONB NULL",
    """CREATE TABLE IF NOT EXISTS cash_drops (
        id UUID PRIMARY KEY,
        shift_id UUID NOT NULL REFERENCES cash_shifts(id),
        amount NUMERIC(12,2) NOT NULL,
        note VARCHAR(255) NULL,
        created_by UUID NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_cash_drops_shift_id ON cash_drops (shift_id)",
]

K7_MANTENIMIENTO: list[str] = [
    # k7a8b9c0d1e2_garantia_y_qr.py
    # Garantia y proveedor de cada maquina, QR de reporte y foto en el historial.
    "ALTER TABLE machines ADD COLUMN IF NOT EXISTS purchase_date DATE NULL",
    "ALTER TABLE machines ADD COLUMN IF NOT EXISTS supplier VARCHAR(150) NULL",
    "ALTER TABLE machines ADD COLUMN IF NOT EXISTS warranty_until DATE NULL",
    "ALTER TABLE machines ADD COLUMN IF NOT EXISTS report_token VARCHAR(64) NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_machines_report_token "
    "ON machines (report_token) WHERE report_token IS NOT NULL",
    "ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) NULL",
]

K8_MODELOS: list[str] = [
    # k8b9c0d1e2f3_modelos_por_gym.py
    # Modelos entrenados con los datos de cada gimnasio.
    """CREATE TABLE IF NOT EXISTS ml_models (
        id UUID PRIMARY KEY,
        name VARCHAR(40) NOT NULL,
        status VARCHAR(20) NOT NULL,
        detail VARCHAR(500) NULL,
        trained_at TIMESTAMP WITH TIME ZONE NOT NULL,
        n_samples INTEGER NOT NULL,
        metrics JSONB NULL,
        result JSONB NULL,
        payload BYTEA NULL,
        sklearn_version VARCHAR(20) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
    )""",
    # El modelo declara `unique=True`: create_all lo crea como constraint.
    """DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ml_models_name_key') THEN
            ALTER TABLE ml_models ADD CONSTRAINT ml_models_name_key UNIQUE (name);
        END IF;
    END $$""",
]

ALIGN_STATEMENTS: list[str] = [*J1_INGRESOS_PASE_TRANSFERENCIAS, *J2_INVENTARIO, *J4_CONSENTIMIENTOS, *J6_ACCESO, *J7_VIDEO_EJERCICIOS, *J8_GYM_SETTINGS_FLAGS, *K1_LIBRO_MOVIMIENTOS, *K2_MENSAJERIA, *K3_ENTRENADORES, *K4_MAQUINAS, *K5_STAFF_SOCIO, *K6_CAJA, *K7_MANTENIMIENTO, *K8_MODELOS]
