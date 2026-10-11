# Plan: Rediseño de lógica LSMFit — de demo a producto vendible

## Contexto

LSMFit hoy es mayormente CRUD: las membresías nunca expiran de verdad (estado pasivo por fecha), el check-in siempre deja entrar, los pagos no tienen caja real ni recibos, Wompi es solo un valor de enum, las clases son inscripciones permanentes sin sesiones ni asistencia, y no hay notificaciones reales ni auditoría. El objetivo es convertirlo en un producto operable por gimnasios reales en Colombia (todo tipo de gym, online-first con Wompi, usuarios: dueño + recepcionista; app de miembros queda para el futuro).

**Decisiones del usuario:** auto-expiración con job diario + gracia configurable + freeze + descuentos/promos (sin cobro recurrente ni tiqueteras); Wompi sandbox real (links + webhook + reconciliación); check-in bloquea con override auditado; clases por sesión con reservas, waitlist y asistencia; caja con turnos/cierres, egresos y recibos consecutivos; WhatsApp como canal de notificaciones; auditoría básica; multi-sede asentada (CRUD Location + filtros) sin features avanzadas; mantenimiento preventivo, reportes comparativos/export y dashboard operativo; APScheduler dentro del backend. **Fuera de fase:** billing SaaS, recurrente, app miembros, 2FA.

## Decisiones transversales (previas a Fase 1)

- **`gym_settings`** (tabla singleton en Tenant DB, `backend/app/models/tenant/gym_settings.py`): `grace_days` (default 3), llaves Wompi (`public_key`, `private_key`, `events_secret`, `integrity_secret`), WhatsApp (`phone_number_id`, `access_token`), `receipt_prefix`, `timezone` default `America/Bogota`. Secretos cifrados (Fernet, `SETTINGS_ENCRYPTION_KEY` en env via `core/config.py`).
- **Zona horaria**: `backend/app/core/timeutil.py` con `today_bogota()`/`now_bogota()` (zoneinfo). Reemplazar `date.today()`/`datetime.now()` naive en `checkins.py` y `services/membership_status.py`. Timestamps en UTC; cortes de día en Bogotá.
- **Iteración de tenants para jobs**: `backend/app/services/tenant_iterator.py::for_each_tenant(fn)` — lee tenants activos de Master DB, abre sesión por tenant reutilizando el cache de engines de `db/tenant_session.py`, try/except por tenant.
- **Enums**: migrar `Membership.status` a `String(20)` (como ya hace `ClassSession.status`) en vez de pelear con `ALTER TYPE` de Postgres.
- **Reutilizar**: `services/membership_status.py::effective_status` (extender, única fuente de verdad), `get_tenant_engine`, `core/rate_limit.py`, patrón de registro de routers en `api/v1/router.py` (¡registrar cada router nuevo!), `models/tenant/__init__.py` (registrar cada modelo nuevo para migraciones).

---

## Fase 1 — Núcleo: ciclo de vida de membresías, scheduler, auditoría, sedes

**Migración tenant `f1`:**
- `memberships`: status→String(20) + valor `frozen`; columnas `discount_amount`, `discount_reason`, `promo_code_id FK`, `expired_at`. Backfill: `status='expired'` donde `end_date < hoy AND status='active'`.
- Nuevas tablas: `membership_freezes` (start/end_date, days_applied, reason, created_by), `promo_codes` (code unique, percent|fixed, value, vigencia, max_uses/times_used), `audit_logs` (actor_staff_id, actor_name snapshot, action, entity_type/id, details JSONB, índice (action, created_at)), `gym_settings`.

**Scheduler:** `backend/app/services/scheduler.py` con APScheduler (AsyncIOScheduler, TZ Bogotá) arrancado en `lifespan` de `main.py` (hoy no existe lifespan — crearlo). Job diario 00:10: expira membresías (`UPDATE ... WHERE status='active' AND end_date < today`, excluye frozen), idempotente, con `pg_try_advisory_lock` en Master DB.

**Lógica:**
- `effective_status(membership, grace_days, today)` → `active | frozen | in_grace | expired | cancelled`; `in_grace` = vencida hace ≤ grace_days.
- Freeze: crea registro abierto + status=frozen; unfreeze: `end_date += días congelados`. Máx un freeze abierto; no congelar expiradas/canceladas.
- Descuentos en asignación de plan: `discount_amount + discount_reason` manual o `promo_code` validado (vigencia/usos, incrementa times_used en la misma transacción). Snapshot guarda precio neto.
- `services/audit.py::audit(db, actor, action, ...)` llamado desde routers sensibles, mismo commit.

**Endpoints:** `POST /memberships/{id}/freeze|unfreeze|cancel`; CRUD `api/v1/promo_codes.py`; CRUD `api/v1/locations.py` (delete = is_active=false); `GET /audit` (solo owner, `api/v1/audit.py`); `GET/PATCH /settings/operations` (grace_days). Registrar routers nuevos.

**Frontend:** member detail con freeze/unfreeze/cancel y badge `in_grace` (ámbar); sección sedes y grace_days en settings; `app/(dashboard)/audit/page.tsx` (solo owner); tipos en `lib/types.ts`.

**Verificar:** `tests/test_membership_lifecycle.py` (freeze corre fecha, grace, job idempotente), `test_audit.py`, `test_locations.py` en contenedor `saasgym-backend-1`. En vivo: membresía vencida + disparo manual del job (endpoint dev-only `POST /admin/run-job/{name}`).

**Riesgos:** el flujo de creación de tenants nuevos (`services/tenant_service.py`) debe incluir tablas nuevas + `alembic stamp head`; jobs 100% async sin I/O bloqueante.

---

## Fase 2 — Check-in estricto con override + dashboard operativo

**Migración `f2`:** `checkins` += `decision` (`allowed|denied|override`, default allowed para backfill), `denial_reason`, `override_by FK`, `override_reason`.

**Lógica:** check-in usa `effective_status` + grace de `gym_settings`: `ok`→allowed; `in_grace`→allowed con warning "vence hace N días, cobrar"; `expired/frozen/no_membership`→ se registra con `decision='denied'` (el intento queda registrado a propósito). `POST /checkins/{id}/override`: convierte un denied reciente (<10 min) en override con motivo obligatorio + `audit('checkin.override')`. Anti-duplicado 5 min no aplica entre denied y su override. Corregir TZ naive en `/checkins/today`.

**Endpoints:** modificar `POST /checkins` y `/checkins/qr/{qr_code}` (respuesta con decision/denial_reason); nuevo override; `GET /dashboard/operations` (vencen hoy/semana con teléfono, morosos en gracia, denieds de hoy, ocupación clases hoy, caja del turno — se enriquece en F3/F5).

**Frontend:** pantalla check-in tipo semáforo (verde/ámbar/rojo) con botón "Autorizar entrada" (modal motivo); dashboard sección "Hoy" con vencimientos accionables (botón Cobrar → payments con member preseleccionado).

**Verificar:** `tests/test_checkin_decisions.py` (matriz estado×decisión, override audita). En vivo: vencido → rojo → override → aparece en /audit.

---

## Fase 3 — Caja real: turnos, egresos, recibos

**Migración `f3`:**
- `cash_shifts`: opened_by/at, opening_amount, closed_by/at, counted_cash, expected_cash, difference, status open|closed, location_id, notes. Unique index parcial `WHERE status='open'` por sede (coalesce para sede nula).
- `expenses`: shift_id?, amount, category (servicios/nómina/insumos/otros), concept, method cash|transfer, created_by.
- `receipts`: payment_id unique, number unique, issued_at, snapshot JSONB inmutable. Consecutivo con `CREATE SEQUENCE receipt_number_seq` (por-tenant automático al ser DB por gym, atómico; huecos por rollback aceptables).
- `payments` += `shift_id FK`, `received_by FK`.

**Lógica:** pagos cash requieren turno abierto (bloquear si no hay — disciplina); transfer/card/wompi no. Cierre: `expected = base + Σcash − Σegresos cash`, staff cuenta, se persiste difference, `audit('cash.close')`, inmutable. Recibo se genera al pasar a `paid` (los pending de Wompi no consumen consecutivo).

**Endpoints:** `api/v1/cash.py`: open/close/current/list shifts, CRUD expenses. `GET /payments/{id}/receipt` + `.pdf` (reportlab). Reorientar `GET /payments/cash` al shift activo.

**Frontend:** tab caja en payments (abrir turno, egresos, cierre con cuadre verde/rojo, histórico); recibo imprimible (CSS print 80mm) + PDF + botón `wa.me` como puente WhatsApp gratuito.

**Verificar:** `tests/test_cash.py` (turno único por sede, cuadre, N pagos concurrentes → números únicos). En vivo: turno completo simulado.

---

## Fase 4 — Wompi sandbox real: links, webhook, reconciliación

**Migración `f4`:** `payment_links` (payment_id, wompi_link_id, reference unique `FC-{slug}-{hex12}`, amount_in_cents, checkout_url, status, expires_at, `membership_intent JSONB` para crear/renovar membresía al confirmar); `webhook_events` (event_id unique → idempotencia, transaction_id, raw JSONB, processed_at).

**Lógica:**
- `services/wompi.py`: cliente httpx contra sandbox (URL por config), crea payment links.
- `POST /api/v1/webhooks/wompi` (público, sin JWT, rate-limited, `api/v1/webhooks.py`): resolver tenant por slug del reference → abrir tenant DB → verificar firma (SHA256 de properties+timestamp+events_secret, `hmac.compare_digest`; 403 si falla) → idempotencia por event_id → si APPROVED: transición `pending→paid` como `UPDATE ... WHERE status='pending'` (rowcount, evita doble recibo), genera recibo (F3), aplica membership_intent, audit, emite evento de notificación. DECLINED→failed, VOIDED→refunded. 200 si procesado o ya procesado.
- **Reconciliación**: job cada 30 min consulta `GET /transactions?reference=` para links pendientes <7 días; misma transición vía `services/payment_confirmation.py` compartido con el webhook (única fuente de verdad).

**Endpoints:** `POST /payments/{id}/payment-link`; `POST /members/{id}/renewal-link` (pago pending + intent + link); `GET/PATCH /settings/integrations` (llaves Wompi, private key solo últimos 4).

**Frontend:** settings → Integraciones (llaves + test de conexión); botón "Generar link de pago" en member detail/payments con copiar + `wa.me`; refetch de estado.

**Verificar:** `tests/test_wompi_webhook.py` (firma válida/inválida, idempotencia doble evento, renovación crea membresía). En vivo: sandbox Wompi con tarjetas de prueba + túnel (cloudflared) para el webhook.

**Riesgos:** montos en centavos COP (`int(amount*100)`, ojo redondeo de descuentos); validar formato del reference antes de consultar Master DB; nunca loguear secrets.

---

## Fase 5 — Clases por sesión: reservas, waitlist, asistencia

**Migración `f5`:** `class_sessions` += `location_id`, unique `(gym_class_id, session_date, start_time)`. Nueva `session_bookings`: session_id, member_id, status (`booked|waitlisted|cancelled|attended|no_show`), waitlist_position, booked_by, unique (session_id, member_id).

**ClassEnrollment se conserva** como "reserva fija semanal": el generador siembra bookings para los enrollados mientras haya cupo (orden por created_at). Sin migración destructiva.

**Lógica:**
- `services/class_sessions.py::materialize_sessions(horizon_days=14)`: genera sesiones desde `GymClass.weekdays` (0=Lun, convención existente) con `ON CONFLICT DO NOTHING`; corre en el job diario y al crear/editar clase (solo sesiones futuras sin bookings).
- Reserva: capacidad efectiva = override o max_capacity; lleno → waitlisted. Concurrencia: `SELECT FOR UPDATE` sobre la fila de sesión antes de contar. Validar membresía con `effective_status` (`in_grace` puede reservar, con warning).
- Cancelar booking → promover primer waitlisted (misma transacción/lock) → evento notificación. Cancelar sesión → notificar booked. Asistencia: attended/no_show por booking; walk-ins como booking directo.

**Endpoints** (`api/v1/class_sessions.py`): `GET /class-sessions?date_from&date_to&location_id`, `GET /class-sessions/{id}` (roster), `POST/DELETE /class-sessions/{id}/bookings...`, `PATCH .../bookings/{id}` (asistencia), `PATCH /class-sessions/{id}` (cancelar/overrides), `POST /class-sessions/materialize`.

**Frontend:** vista agenda semanal con ocupación `7/12` y waitlist; detalle de sesión con roster y toggles de asistencia; dashboard "clases de hoy" con ocupación real.

**Verificar:** `tests/test_class_sessions.py`: generación idempotente, weekday 0=Lun, gather de N reservas → exactamente cap booked, promoción waitlist, siembra desde enrollments.

---

## Fase 6 — WhatsApp + motor de eventos + secundarios

**6a. Notificaciones** (migración `f6`): `notification_outbox` (event_type, channel whatsapp|in_app, recipient_phone, template_name/params, status pending|sent|failed|skipped, attempts, `idempotency_key` unique p.ej. `expiring:{membership_id}:{end_date}`, scheduled_for).
- `services/events.py::emit(...)`: evento → filas outbox según canales configurados (sin WhatsApp configurado → solo in_app con el modelo `Notification` existente). Llamado desde: webhook Wompi, creación de link, job de vencimientos (D-3 y D-0), promoción waitlist.
- `services/whatsapp.py`: WhatsApp Business Cloud API (Meta) con plantillas pre-aprobadas (`recordatorio_vencimiento`, `confirmacion_pago`, `link_de_pago` — documentar guía para que el gym las cree en su WABA); credenciales por gym en gym_settings. Job cada 60s procesa outbox con backoff (3 intentos). Normalizar teléfonos a E.164 `+57...`.
- Reescribir `generate-expiry-notifications` sobre este motor. Settings: sección WhatsApp + mensaje de prueba + toggles por evento; `GET /notifications/outbox` (owner).

**6b. Mantenimiento preventivo:** `machines` += `maintenance_interval_days`, `last_maintenance_date` (backfill desde último MaintenanceLog). Job diario alerta cuando vence (idempotente); registrar mantenimiento actualiza la fecha. Badge "mantenimiento vencido" en machines.

**6c. Reportes accionables:** parámetro `compare=true` (deltas vs período anterior equivalente); `GET /reports/profit` (paid − expenses, por período y sede); filtro `location_id` en reportes/dashboard; export `?format=xlsx|pdf` (openpyxl + reportlab, StreamingResponse). Frontend: selector de sede, botones export, tarjetas comparativas ↑↓.

**Verificar:** `tests/test_notifications_engine.py` (idempotencia, retry con cliente mock), `test_preventive_maintenance.py`, `test_reports_compare.py`. En vivo: número de prueba gratuito de Meta.

---

## Dependencias y cierre de cada fase

```
F1 ─→ F2 (check-in)        — corta, alto valor
  ├─→ F3 (caja) ─→ F4 (Wompi)
  ├─→ F5 (clases por sesión)
  └─→ F6 (WhatsApp + secundarios, consume eventos de F2–F5)
```

Cada fase cierra con: migración tenant aplicada a todos los tenants existentes (iterar tenants con la URL inyectada en `migrations/tenant/env.py`; tenant DBs de `create_all` requieren `alembic stamp` previo), pytest verde en `saasgym-backend-1`, `tsc --noEmit` limpio, rebuild del frontend standalone y prueba manual en `localhost:3000`, commit en español, y fila nueva en la tabla de errores de CLAUDE.md si aplica.

## Archivos críticos

- `backend/app/api/v1/router.py` — registrar TODOS los routers nuevos (locations, promo_codes, audit, cash, webhooks, class_sessions)
- `backend/app/models/tenant/__init__.py` — registrar todos los modelos nuevos (los lee migrations/tenant/env.py)
- `backend/app/services/membership_status.py` — única fuente de verdad del estado (check-in, reservas, job)
- `backend/app/db/tenant_session.py` + `backend/app/api/deps.py` — base para tenant_iterator y resolución de tenant en webhook
- `backend/app/main.py` — lifespan para APScheduler
- `backend/app/services/tenant_service.py` — creación de tenants nuevos debe incluir tablas nuevas + stamp