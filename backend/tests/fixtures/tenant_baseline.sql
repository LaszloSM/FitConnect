-- GENERADO por scripts/freeze_tenant_baseline.py — no editar a mano.
--
-- Esquema congelado del fleet: lo que se garantiza que TODO tenant ya desplegado
-- tiene. Es la referencia de "tenant viejo" del test anti-drift.
--
-- Regenerar SOLO tras correr migrate_tenants.py sobre el fleet con 0 fallos.
-- Si lo regeneras para poner un test en verde, estás desactivando la única
-- defensa contra que un gym en producción se quede sin una columna.


CREATE TYPE checkintype AS ENUM ('entry', 'exit');

CREATE TYPE gender AS ENUM ('M', 'F', 'other');

CREATE TYPE idtype AS ENUM ('CC', 'NIT', 'CE', 'PP', 'TI');

CREATE TYPE machinestatus AS ENUM ('active', 'maintenance', 'damaged', 'retired');

CREATE TYPE memberstatus AS ENUM ('active', 'inactive');

CREATE TYPE paymentmethod AS ENUM ('cash', 'transfer', 'card', 'wompi');

CREATE TYPE paymentstatus AS ENUM ('paid', 'pending', 'failed', 'refunded');

CREATE TYPE traininggoal AS ENUM ('weight_loss', 'muscle_gain', 'endurance', 'flexibility', 'general_fitness');

CREATE TYPE userrole AS ENUM ('owner', 'admin', 'receptionist');

CREATE TABLE audit_logs (
	id UUID NOT NULL, 
	actor_staff_id UUID, 
	actor_name VARCHAR(255) NOT NULL, 
	action VARCHAR(100) NOT NULL, 
	entity_type VARCHAR(50), 
	entity_id VARCHAR(64), 
	details JSONB, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_audit_logs_action_created ON audit_logs (action, created_at);

CREATE INDEX ix_audit_logs_actor_staff_id ON audit_logs (actor_staff_id);

CREATE TABLE day_pass_types (
	id UUID NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	price NUMERIC(12, 2) NOT NULL, 
	includes_trainer BOOLEAN DEFAULT 'false' NOT NULL, 
	is_active BOOLEAN DEFAULT 'true' NOT NULL, 
	sort_order INTEGER DEFAULT '0' NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE gym_settings (
	id UUID NOT NULL, 
	grace_days INTEGER NOT NULL, 
	timezone VARCHAR(50) NOT NULL, 
	receipt_prefix VARCHAR(10) NOT NULL, 
	cash_shifts_enabled BOOLEAN DEFAULT 'true' NOT NULL, 
	tour_completed_at TIMESTAMP WITHOUT TIME ZONE, 
	wompi_public_key VARCHAR(255), 
	wompi_private_key VARCHAR(500), 
	wompi_events_secret VARCHAR(500), 
	wompi_integrity_secret VARCHAR(500), 
	whatsapp_phone_number_id VARCHAR(100), 
	whatsapp_access_token VARCHAR(1000), 
	transfer_accounts JSONB, 
	transfer_auto_void_hours INTEGER DEFAULT '24' NOT NULL, 
	legal_name VARCHAR(200), 
	nit VARCHAR(30), 
	tax_regime VARCHAR(50), 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE instructors (
	id UUID NOT NULL, 
	full_name VARCHAR(255) NOT NULL, 
	photo_url VARCHAR(500), 
	phone VARCHAR(50), 
	specialty VARCHAR(255), 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE locations (
	id UUID NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	address VARCHAR(500) NOT NULL, 
	phone VARCHAR(50), 
	max_capacity INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE member_plans (
	id UUID NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	price NUMERIC(12, 2) NOT NULL, 
	duration_days INTEGER NOT NULL, 
	description VARCHAR(1000), 
	is_active BOOLEAN NOT NULL, 
	access_type VARCHAR(20) DEFAULT 'gym_and_classes' NOT NULL, 
	class_credits_per_month INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE members (
	id UUID NOT NULL, 
	full_name VARCHAR(255) NOT NULL, 
	email VARCHAR(255), 
	member_type VARCHAR(20) DEFAULT 'member' NOT NULL, 
	phone VARCHAR(50), 
	id_type idtype, 
	id_number VARCHAR(50), 
	gender gender, 
	birth_date DATE, 
	address VARCHAR(500), 
	city VARCHAR(100), 
	country VARCHAR(2), 
	emergency_contact_name VARCHAR(255), 
	emergency_contact_phone VARCHAR(50), 
	blood_type VARCHAR(5), 
	photo_url VARCHAR(500), 
	consent_data_at TIMESTAMP WITHOUT TIME ZONE, 
	consent_image_at TIMESTAMP WITHOUT TIME ZONE, 
	parq_answers JSONB, 
	parq_completed_at DATE, 
	training_goal traininggoal, 
	qr_code VARCHAR(36) NOT NULL, 
	status memberstatus NOT NULL, 
	notes VARCHAR(1000), 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_members_email ON members (email);

CREATE UNIQUE INDEX ix_members_qr_code ON members (qr_code);

CREATE UNIQUE INDEX uq_member_email ON members (email) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX uq_member_id_number ON members (id_number) WHERE id_number IS NOT NULL;

CREATE TABLE message_templates (
	id UUID NOT NULL, 
	occasion VARCHAR(50) NOT NULL, 
	channel VARCHAR(20) NOT NULL, 
	body TEXT NOT NULL, 
	header_image_url VARCHAR(500), 
	is_active BOOLEAN NOT NULL, 
	meta_template_name VARCHAR(100), 
	meta_status VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_message_template_occasion UNIQUE (occasion)
);

CREATE TABLE notification_outbox (
	id UUID NOT NULL, 
	event_type VARCHAR(50) NOT NULL, 
	channel VARCHAR(15) NOT NULL, 
	recipient_phone VARCHAR(20), 
	member_id UUID, 
	template_name VARCHAR(80), 
	template_params JSONB, 
	status VARCHAR(15) NOT NULL, 
	attempts INTEGER NOT NULL, 
	last_error VARCHAR(500), 
	idempotency_key VARCHAR(150) NOT NULL, 
	scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL, 
	sent_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (idempotency_key)
);

CREATE TABLE notifications (
	id UUID NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	message VARCHAR(1000) NOT NULL, 
	type VARCHAR(100) NOT NULL, 
	is_read BOOLEAN NOT NULL, 
	member_id UUID, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE product_categories (
	id UUID NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	sort_order INTEGER DEFAULT '0' NOT NULL, 
	is_active BOOLEAN DEFAULT 'true' NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);

CREATE TABLE promo_codes (
	id UUID NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	discount_type VARCHAR(10) NOT NULL, 
	value NUMERIC(12, 2) NOT NULL, 
	valid_from DATE, 
	valid_until DATE, 
	max_uses INTEGER, 
	times_used INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	description VARCHAR(255), 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (code)
);

CREATE TABLE users (
	id UUID NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	hashed_password VARCHAR(255) NOT NULL, 
	full_name VARCHAR(255) NOT NULL, 
	role userrole NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	email_verified BOOLEAN NOT NULL, 
	notification_prefs JSONB, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_user_email UNIQUE (email)
);

CREATE INDEX ix_users_email ON users (email);

CREATE TABLE webhook_events (
	id UUID NOT NULL, 
	provider VARCHAR(20) NOT NULL, 
	event_id VARCHAR(120) NOT NULL, 
	transaction_id VARCHAR(120), 
	reference VARCHAR(120), 
	raw JSONB, 
	processed_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (event_id)
);

CREATE TABLE biometric_consents (
	id UUID NOT NULL, 
	member_id UUID NOT NULL, 
	kind VARCHAR(20) NOT NULL, 
	text_version VARCHAR(20) NOT NULL, 
	signature_method VARCHAR(20) NOT NULL, 
	document_key VARCHAR(500), 
	signed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	signed_by_staff UUID, 
	revoked_at TIMESTAMP WITHOUT TIME ZONE, 
	revoked_by UUID, 
	PRIMARY KEY (id), 
	FOREIGN KEY(member_id) REFERENCES members (id) ON DELETE CASCADE, 
	FOREIGN KEY(signed_by_staff) REFERENCES users (id), 
	FOREIGN KEY(revoked_by) REFERENCES users (id)
);

CREATE INDEX ix_biometric_consents_member_id ON biometric_consents (member_id);

CREATE TABLE cash_shifts (
	id UUID NOT NULL, 
	opened_by UUID, 
	opened_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	opening_amount NUMERIC(12, 2) NOT NULL, 
	closed_by UUID, 
	closed_at TIMESTAMP WITH TIME ZONE, 
	counted_cash NUMERIC(12, 2), 
	expected_cash NUMERIC(12, 2), 
	difference NUMERIC(12, 2), 
	status VARCHAR(10) NOT NULL, 
	location_id UUID, 
	notes VARCHAR(500), 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(opened_by) REFERENCES users (id), 
	FOREIGN KEY(closed_by) REFERENCES users (id), 
	FOREIGN KEY(location_id) REFERENCES locations (id)
);

CREATE TABLE checkins (
	id UUID NOT NULL, 
	member_id UUID NOT NULL, 
	location_id UUID, 
	type checkintype NOT NULL, 
	notes VARCHAR(255), 
	decision VARCHAR(20) NOT NULL, 
	denial_reason VARCHAR(50), 
	override_by UUID, 
	override_reason VARCHAR(255), 
	source VARCHAR(20) DEFAULT 'reception' NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(member_id) REFERENCES members (id), 
	FOREIGN KEY(location_id) REFERENCES locations (id), 
	FOREIGN KEY(override_by) REFERENCES users (id)
);

CREATE INDEX ix_checkins_member_id ON checkins (member_id);

CREATE TABLE exercise_media (
	id UUID NOT NULL, 
	exercise_id UUID NOT NULL, 
	video_url VARCHAR(500) NOT NULL, 
	poster_url VARCHAR(500), 
	uploaded_by UUID, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(uploaded_by) REFERENCES users (id)
);

CREATE UNIQUE INDEX uq_exercise_media_exercise ON exercise_media (exercise_id);

CREATE TABLE gym_classes (
	id UUID NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	instructor VARCHAR(255) NOT NULL, 
	instructor_id UUID, 
	schedule VARCHAR(255), 
	weekdays JSONB, 
	start_time TIME WITHOUT TIME ZONE, 
	category VARCHAR(50), 
	difficulty VARCHAR(20), 
	color VARCHAR(7), 
	max_capacity INTEGER NOT NULL, 
	duration_minutes INTEGER NOT NULL, 
	location_id UUID, 
	is_active BOOLEAN NOT NULL, 
	description VARCHAR(1000), 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(instructor_id) REFERENCES instructors (id), 
	FOREIGN KEY(location_id) REFERENCES locations (id)
);

CREATE TABLE kiosk_devices (
	id UUID NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	token_jti VARCHAR(36) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	last_seen_at TIMESTAMP WITHOUT TIME ZONE, 
	created_by UUID, 
	kind VARCHAR(20) DEFAULT 'kiosk' NOT NULL, 
	vendor VARCHAR(30), 
	model VARCHAR(60), 
	serial VARCHAR(80), 
	location VARCHAR(80), 
	offline_policy VARCHAR(20) DEFAULT 'deny' NOT NULL, 
	config JSONB DEFAULT '{}' NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (token_jti), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE TABLE machines (
	id UUID NOT NULL, 
	location_id UUID, 
	name VARCHAR(255) NOT NULL, 
	area VARCHAR(50), 
	brand VARCHAR(100), 
	serial_number VARCHAR(100), 
	status machinestatus NOT NULL, 
	last_maintenance_date DATE, 
	maintenance_interval_days INTEGER, 
	photo_url VARCHAR(500), 
	notes VARCHAR(1000), 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(location_id) REFERENCES locations (id)
);

CREATE TABLE memberships (
	id UUID NOT NULL, 
	member_id UUID NOT NULL, 
	plan_id UUID, 
	plan_name VARCHAR(100) NOT NULL, 
	price NUMERIC(12, 2) NOT NULL, 
	discount_amount NUMERIC(12, 2), 
	discount_reason VARCHAR(255), 
	promo_code_id UUID, 
	start_date DATE NOT NULL, 
	end_date DATE NOT NULL, 
	duration_days INTEGER NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	expired_at TIMESTAMP WITH TIME ZONE, 
	access_type VARCHAR(20) DEFAULT 'gym_and_classes' NOT NULL, 
	class_credits_per_month INTEGER, 
	notes VARCHAR(500), 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(member_id) REFERENCES members (id), 
	FOREIGN KEY(plan_id) REFERENCES member_plans (id), 
	FOREIGN KEY(promo_code_id) REFERENCES promo_codes (id)
);

CREATE INDEX ix_memberships_member_id ON memberships (member_id);

CREATE INDEX ix_memberships_plan_id ON memberships (plan_id);

CREATE TABLE products (
	id UUID NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	photo_url VARCHAR(500), 
	price NUMERIC(12, 2) NOT NULL, 
	stock INTEGER NOT NULL, 
	low_stock_threshold INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	category_id UUID, 
	cost_price NUMERIC(12, 2), 
	sku VARCHAR(50), 
	barcode VARCHAR(64), 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(category_id) REFERENCES product_categories (id)
);

CREATE UNIQUE INDEX uq_products_barcode ON products (barcode) WHERE barcode IS NOT NULL;

CREATE UNIQUE INDEX uq_products_sku ON products (sku) WHERE sku IS NOT NULL;

CREATE TABLE routines (
	id UUID NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	description VARCHAR(1000), 
	goal VARCHAR(40), 
	level VARCHAR(20) NOT NULL, 
	days_per_week INTEGER NOT NULL, 
	is_public_on_screen BOOLEAN DEFAULT 'false' NOT NULL, 
	is_active BOOLEAN DEFAULT 'true' NOT NULL, 
	created_by UUID, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE TABLE access_events (
	id UUID NOT NULL, 
	device_id UUID, 
	member_id UUID, 
	credential_kind VARCHAR(20) NOT NULL, 
	credential_ref VARCHAR(64), 
	direction VARCHAR(10) NOT NULL, 
	decision VARCHAR(20) NOT NULL, 
	reason VARCHAR(40), 
	offline BOOLEAN NOT NULL, 
	client_event_id VARCHAR(64), 
	checkin_id UUID, 
	occurred_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(device_id) REFERENCES kiosk_devices (id) ON DELETE SET NULL, 
	FOREIGN KEY(member_id) REFERENCES members (id) ON DELETE SET NULL, 
	FOREIGN KEY(checkin_id) REFERENCES checkins (id) ON DELETE SET NULL
);

CREATE INDEX ix_access_events_device_time ON access_events (device_id, occurred_at);

CREATE INDEX ix_access_events_member_id ON access_events (member_id);

CREATE UNIQUE INDEX uq_access_events_client ON access_events (device_id, client_event_id) WHERE client_event_id IS NOT NULL;

CREATE TABLE class_enrollments (
	id UUID NOT NULL, 
	gym_class_id UUID NOT NULL, 
	member_id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(gym_class_id) REFERENCES gym_classes (id), 
	FOREIGN KEY(member_id) REFERENCES members (id)
);

CREATE INDEX ix_class_enrollments_gym_class_id ON class_enrollments (gym_class_id);

CREATE INDEX ix_class_enrollments_member_id ON class_enrollments (member_id);

CREATE TABLE class_sessions (
	id UUID NOT NULL, 
	gym_class_id UUID NOT NULL, 
	session_date DATE NOT NULL, 
	start_time TIME WITHOUT TIME ZONE NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	notes VARCHAR(500), 
	location_id UUID, 
	instructor_override VARCHAR(255), 
	capacity_override INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_session_class_date_time UNIQUE (gym_class_id, session_date, start_time), 
	FOREIGN KEY(gym_class_id) REFERENCES gym_classes (id), 
	FOREIGN KEY(location_id) REFERENCES locations (id)
);

CREATE INDEX ix_class_sessions_gym_class_id ON class_sessions (gym_class_id);

CREATE TABLE expenses (
	id UUID NOT NULL, 
	shift_id UUID, 
	amount NUMERIC(12, 2) NOT NULL, 
	category VARCHAR(50) NOT NULL, 
	concept VARCHAR(255) NOT NULL, 
	method VARCHAR(20) NOT NULL, 
	created_by UUID, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(shift_id) REFERENCES cash_shifts (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE INDEX ix_expenses_shift_id ON expenses (shift_id);

CREATE TABLE maintenance_logs (
	id UUID NOT NULL, 
	machine_id UUID NOT NULL, 
	description VARCHAR(1000) NOT NULL, 
	technician VARCHAR(255) NOT NULL, 
	cost NUMERIC(12, 2), 
	resolved_at DATE, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(machine_id) REFERENCES machines (id)
);

CREATE INDEX ix_maintenance_logs_machine_id ON maintenance_logs (machine_id);

CREATE TABLE member_credentials (
	id UUID NOT NULL, 
	member_id UUID NOT NULL, 
	device_id UUID, 
	kind VARCHAR(20) NOT NULL, 
	device_user_id VARCHAR(64) NOT NULL, 
	label VARCHAR(80), 
	consent_id UUID, 
	enrolled_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	enrolled_by UUID, 
	revoked_at TIMESTAMP WITHOUT TIME ZONE, 
	revoked_by UUID, 
	PRIMARY KEY (id), 
	FOREIGN KEY(member_id) REFERENCES members (id) ON DELETE CASCADE, 
	FOREIGN KEY(device_id) REFERENCES kiosk_devices (id) ON DELETE SET NULL, 
	FOREIGN KEY(consent_id) REFERENCES biometric_consents (id) ON DELETE SET NULL, 
	FOREIGN KEY(enrolled_by) REFERENCES users (id), 
	FOREIGN KEY(revoked_by) REFERENCES users (id)
);

CREATE INDEX ix_member_credentials_lookup ON member_credentials (kind, device_user_id);

CREATE INDEX ix_member_credentials_member_id ON member_credentials (member_id);

CREATE UNIQUE INDEX uq_member_credentials_global ON member_credentials (kind, device_user_id) WHERE revoked_at IS NULL AND device_id IS NULL;

CREATE TABLE member_routines (
	id UUID NOT NULL, 
	member_id UUID NOT NULL, 
	routine_id UUID NOT NULL, 
	assigned_by UUID, 
	assigned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	ended_at TIMESTAMP WITHOUT TIME ZONE, 
	notes VARCHAR(500), 
	PRIMARY KEY (id), 
	FOREIGN KEY(member_id) REFERENCES members (id), 
	FOREIGN KEY(routine_id) REFERENCES routines (id), 
	FOREIGN KEY(assigned_by) REFERENCES users (id)
);

CREATE INDEX ix_member_routines_member ON member_routines (member_id, assigned_at);

CREATE TABLE membership_freezes (
	id UUID NOT NULL, 
	membership_id UUID NOT NULL, 
	start_date DATE NOT NULL, 
	end_date DATE, 
	days_applied INTEGER, 
	reason VARCHAR(255), 
	created_by UUID, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(membership_id) REFERENCES memberships (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE INDEX ix_membership_freezes_membership_id ON membership_freezes (membership_id);

CREATE TABLE routine_days (
	id UUID NOT NULL, 
	routine_id UUID NOT NULL, 
	day_index INTEGER NOT NULL, 
	title VARCHAR(80) NOT NULL, 
	notes VARCHAR(500), 
	PRIMARY KEY (id), 
	FOREIGN KEY(routine_id) REFERENCES routines (id) ON DELETE CASCADE
);

CREATE INDEX ix_routine_days_routine_id ON routine_days (routine_id);

CREATE TABLE payments (
	id UUID NOT NULL, 
	member_id UUID, 
	membership_id UUID, 
	amount NUMERIC(12, 2) NOT NULL, 
	method paymentmethod, 
	status paymentstatus NOT NULL, 
	concept VARCHAR(500) NOT NULL, 
	external_ref VARCHAR(255), 
	shift_id UUID, 
	received_by UUID, 
	kind VARCHAR(20) DEFAULT 'other' NOT NULL, 
	destination_account_id VARCHAR(36), 
	transfer_reference VARCHAR(20), 
	proof_url VARCHAR(500), 
	proof_uploaded_at TIMESTAMP WITHOUT TIME ZONE, 
	card_approval_code VARCHAR(50), 
	card_terminal VARCHAR(100), 
	discount_amount NUMERIC(12, 2) DEFAULT '0' NOT NULL, 
	discount_note VARCHAR(255), 
	refunded_at TIMESTAMP WITHOUT TIME ZONE, 
	refund_reason VARCHAR(500), 
	refunded_by UUID, 
	refund_expense_id UUID, 
	voided_at TIMESTAMP WITHOUT TIME ZONE, 
	void_reason VARCHAR(500), 
	voided_by UUID, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(member_id) REFERENCES members (id), 
	FOREIGN KEY(membership_id) REFERENCES memberships (id), 
	FOREIGN KEY(shift_id) REFERENCES cash_shifts (id), 
	FOREIGN KEY(received_by) REFERENCES users (id), 
	FOREIGN KEY(refunded_by) REFERENCES users (id), 
	FOREIGN KEY(refund_expense_id) REFERENCES expenses (id), 
	FOREIGN KEY(voided_by) REFERENCES users (id)
);

CREATE INDEX ix_payments_kind_created ON payments (kind, created_at);

CREATE INDEX ix_payments_member_id ON payments (member_id);

CREATE INDEX ix_payments_shift_id ON payments (shift_id);

CREATE UNIQUE INDEX uq_payments_transfer_reference ON payments (transfer_reference) WHERE transfer_reference IS NOT NULL;

CREATE TABLE routine_exercises (
	id UUID NOT NULL, 
	day_id UUID NOT NULL, 
	exercise_id UUID NOT NULL, 
	exercise_name VARCHAR(200) NOT NULL, 
	"order" INTEGER NOT NULL, 
	sets INTEGER NOT NULL, 
	reps VARCHAR(40) NOT NULL, 
	rest_seconds INTEGER NOT NULL, 
	notes VARCHAR(300), 
	video_url VARCHAR(500), 
	PRIMARY KEY (id), 
	FOREIGN KEY(day_id) REFERENCES routine_days (id) ON DELETE CASCADE
);

CREATE INDEX ix_routine_exercises_day_order ON routine_exercises (day_id, "order");

CREATE TABLE session_bookings (
	id UUID NOT NULL, 
	session_id UUID NOT NULL, 
	member_id UUID NOT NULL, 
	status VARCHAR(15) NOT NULL, 
	waitlist_position INTEGER, 
	booked_by UUID, 
	cancelled_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_session_member UNIQUE (session_id, member_id), 
	FOREIGN KEY(session_id) REFERENCES class_sessions (id), 
	FOREIGN KEY(member_id) REFERENCES members (id), 
	FOREIGN KEY(booked_by) REFERENCES users (id)
);

CREATE INDEX ix_session_bookings_member_id ON session_bookings (member_id);

CREATE INDEX ix_session_bookings_session_id ON session_bookings (session_id);

CREATE TABLE day_passes (
	id UUID NOT NULL, 
	member_id UUID NOT NULL, 
	pass_type_id UUID, 
	pass_name VARCHAR(100) NOT NULL, 
	includes_trainer BOOLEAN DEFAULT 'false' NOT NULL, 
	valid_on DATE NOT NULL, 
	price NUMERIC(12, 2) NOT NULL, 
	payment_id UUID, 
	status VARCHAR(20) DEFAULT 'pending' NOT NULL, 
	created_by UUID, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(member_id) REFERENCES members (id), 
	FOREIGN KEY(pass_type_id) REFERENCES day_pass_types (id), 
	FOREIGN KEY(payment_id) REFERENCES payments (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE INDEX ix_day_passes_member_valid ON day_passes (member_id, valid_on);

CREATE INDEX ix_day_passes_payment_id ON day_passes (payment_id);

CREATE TABLE payment_items (
	id UUID NOT NULL, 
	payment_id UUID NOT NULL, 
	product_id UUID, 
	description VARCHAR(255) NOT NULL, 
	quantity INTEGER NOT NULL, 
	unit_price NUMERIC(12, 2) NOT NULL, 
	subtotal NUMERIC(12, 2) NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(payment_id) REFERENCES payments (id), 
	FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX ix_payment_items_payment_id ON payment_items (payment_id);

CREATE TABLE payment_links (
	id UUID NOT NULL, 
	payment_id UUID NOT NULL, 
	wompi_link_id VARCHAR(100), 
	reference VARCHAR(120) NOT NULL, 
	amount_in_cents BIGINT NOT NULL, 
	checkout_url VARCHAR(500), 
	status VARCHAR(20) NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE, 
	membership_intent JSONB, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(payment_id) REFERENCES payments (id), 
	UNIQUE (reference)
);

CREATE INDEX ix_payment_links_payment_id ON payment_links (payment_id);

CREATE TABLE receipts (
	id UUID NOT NULL, 
	payment_id UUID NOT NULL, 
	number INTEGER NOT NULL, 
	snapshot JSONB NOT NULL, 
	issued_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (payment_id), 
	FOREIGN KEY(payment_id) REFERENCES payments (id), 
	UNIQUE (number)
);

CREATE TABLE stock_movements (
	id UUID NOT NULL, 
	product_id UUID NOT NULL, 
	type VARCHAR(20) NOT NULL, 
	quantity INTEGER NOT NULL, 
	unit_cost NUMERIC(12, 2), 
	stock_after INTEGER NOT NULL, 
	note VARCHAR(255), 
	payment_id UUID, 
	created_by UUID, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(product_id) REFERENCES products (id), 
	FOREIGN KEY(payment_id) REFERENCES payments (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE INDEX ix_stock_movements_payment_id ON stock_movements (payment_id);

CREATE INDEX ix_stock_movements_product_created ON stock_movements (product_id, created_at);
