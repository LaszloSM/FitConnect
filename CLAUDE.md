# Reglas del proyecto — FitConnect

## Idioma de los commits

**Todos los mensajes de commit deben escribirse en español.**

Esto aplica a cualquier cambio en cualquier parte del repositorio (frontend, backend, infra, docs). No hay excepciones.

**Formato correcto:**
```
feat: agregar módulo de notificaciones con preferencias por usuario
fix: corregir acceso seguro a full_name en MembersClient
refactor: extraer lógica de autenticación a helper compartido
docs: actualizar README con instrucciones de despliegue
```

**Formato incorrecto:**
```
feat: add notification module         ← en inglés
fix: safe full_name access            ← en inglés
```

Usa los prefijos convencionales (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`) pero el mensaje descriptivo siempre en español.

---

## Stack técnico

- **Frontend:** Next.js 16.2.4 App Router + React 19 + TypeScript + Tailwind CSS v4
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL (multi-tenant: master DB + tenant DB)
- **Auth:** NextAuth.js v5 (beta) + JWT
- **UI:** Base UI (`@base-ui/react`) — NO es Radix UI. El patrón de composición usa `render` prop, NO `asChild`.
- **Animaciones:** Framer Motion v12
- **Infra:** Docker Compose (local) + AWS ECS/RDS (producción)

## Notas críticas de implementación

### Base UI (dialog, dropdown, etc.)
```tsx
// CORRECTO — patrón render prop
<DialogTrigger render={<Button>Crear</Button>} />

// INCORRECTO — asChild no existe en Base UI
<DialogTrigger asChild><Button>Crear</Button></DialogTrigger>
```

### Next.js 16 — AGENTS.md
Lee `frontend/AGENTS.md` antes de escribir cualquier código Next.js. Esta versión tiene breaking changes respecto a tu data de entrenamiento.

### Framer Motion v12
```tsx
// CORRECTO — type Variants importado explícitamente
import { motion, type Variants } from "framer-motion";
const variants: Variants = { hidden: {}, visible: {} };

// transition NO va dentro de los variants — ponlo en el motion element
<motion.div variants={variants} transition={{ duration: 0.35 }} />
```

---

## Graphify — Mapa del proyecto

Usamos [graphify](https://github.com/safishamsi/graphify) para generar un knowledge graph del repo y evitar releer todo el código en cada sesión.

**Setup (una sola vez):**
```bash
uv tool install graphifyy
graphify install   # registra en Claude Code
```

**Uso habitual:**
```bash
graphify .                              # genera el grafo del proyecto
graphify query "autenticación tenants"  # búsqueda semántica
graphify path "AuthMiddleware" "MemberRouter"  # traza conexiones
```

Antes de explorar código desconocido, ejecuta `graphify query "<concepto>"` para ubicarte sin leer archivos manualmente.

---

## Aprendizaje de errores

Cuando cometas un error durante una sesión, agrégalo aquí antes de terminar:

| Error | Causa | Regla aprendida |
|-------|-------|-----------------|
| `DialogTrigger asChild` rompía en Base UI | Base UI usa `render` prop, no Radix UI | Siempre usar `render={<Component />}` |
| `type Variants` no importado | Framer Motion v12 requiere import explícito | `import { motion, type Variants } from "framer-motion"` |
| imports sin uso en Dashboard | React 19 es estricto con tree-shaking | Revisar imports al terminar cada archivo |
| `z.record(z.boolean())` TS error | Zod strict requiere key schema explícito | Siempre `z.record(z.string(), z.boolean())` |
| Colores shadcn (`text-muted-foreground`, `bg-popover`) en componentes | Este proyecto usa CSS vars propios, NO shadcn | Usar `var(--text-muted)`, `var(--bg-card)`, etc. Nunca tokens shadcn |
| `border-l-4` en banners/alertas | Violación de impeccable: side-stripe border baneado | Usar `bg-amber-50 dark:bg-amber-950/20 border border-amber-200` |
| `LinearGradient` id duplicado en SVGs | Múltiples SVGs con mismo id causan conflicto visual | Usar `useId()` de React para ids únicos en SVGs inline |
| Filtros de fecha en pagos sin `alias` en FastAPI | `from` es palabra reservada en Python | Usar `Query(None, alias="from")` en parámetros de fecha |
| `Promise.all` con N resultados — agregar más rompe destructuring | Agregar endpoint extra sin actualizar el `.then(([...])` | Siempre actualizar la desestructuración al agregar a `Promise.all` |
| JS weekday (0=Dom) ≠ gym weekday (0=Lun) en clases | Diferentes convenciones de índice | Convertir: `gymWeekday = jsWeekday === 0 ? 6 : jsWeekday - 1` |
| Token de owner sin `staff_id` → 500 en todo endpoint con `require_role`/`get_current_staff` | `create_access_token` no incluía `staff_id` pero `get_current_staff` lo leía con `payload["staff_id"]` | El owner es también `UserStaff` en su tenant DB: el login resuelve esa fila y mete `staff_id` en el token. Usar `payload.get("staff_id")` con guard 401, nunca `payload[...]` |
| Router `users.py` no registrado en `router.py` → endpoints 404 silenciosos | Se reescribió el router pero nunca se agregó al agregador | Al crear/editar un router, verificar que esté en `app/api/v1/router.py` |
| Login de staff en multi-tenant no sabe qué tenant DB consultar | El email del staff no revela su gym | Índice global `staff_directory` (email→tenant_id/db_name/staff_id) en Master DB; escribir al invitar y al crear owner |
| Tests/imports stale tras refactor multi-tenant (`from app.models.tenant import Tenant`) | `Tenant` vive en `app.models.master.tenant`, no en el paquete `tenant` | Tras refactor de modelos, actualizar imports de tests; correr `pytest` dentro del contenedor `saasgym-backend-1` con `TEST_DB_URL` apuntando a `db:5432` |
| Feature fantasma: el front llamaba `PUT /settings/gym` que no existía (solo PATCH) y `operating_hours` no estaba en schema ni DB | Contrato frontend↔backend desalineado; el botón fallaba siempre | Al tocar una pantalla, verificar que el endpoint/método/campo exista en el backend (probar el contrato en vivo) |
| Agregado de ingresos sumaba pagos de cualquier estado | `total_payments_month` sin filtro `status` mientras caja/revenue sí filtran `paid` | Todo agregado de ingresos filtra `Payment.status == paid`; lo pendiente se reporta aparte |
| Frontend corre como build standalone (`node server.js`, sin volumen ni HMR) | Editar el source no se refleja sin `docker compose build frontend` | Verificar frontend con `tsc --noEmit` (host tiene node_modules); para ver en navegador, rebuild |
| Screenshots del preview mostraban el login viejo | El navegador del preview seguía en `localhost:3000` (build viejo) mientras el dev server estaba en `localhost:3001` | Verificar `location.origin`/puerto antes de confiar en un screenshot; navegar con URL absoluta del puerto correcto |
| `globals.css`/tokens no se reflejaban (color seguía naranja) en dev | Caché de Turbopack/`.next` de una sesión previa | Tras cambiar tokens de color, borrar `frontend/.next` y reiniciar el dev server |
| `bg-primary` del `Button` seguía naranja pese a cambiar `globals.css` | `primary` también está en `tailwind.config.ts` (theme.colors) | Al rebrandear, actualizar `tailwind.config.ts` (`primary`, `primary-foreground`, glow) junto con las CSS vars |
| Texto blanco sobre relleno Volt = bajo contraste | Volt (lima) es color claro | Usar `--color-primary-contrast` (casi-negro) como ink sobre rellenos Volt; `text-white` solo sobre rojo/oscuro |
| Inputs de distinto color en card blanca (auth) | `PhoneInput`/`PasswordInput` hardcodean `bg-[var(--bg-input)]` (oscuro en dark) | Prop `surface="on-light"` para forzar superficie blanca sobre cards claras |
| CORS preflight `OPTIONS` daba 400 en el navegador | El preview cargó la página en un origin no permitido (`:3001`); el backend solo permite `:3000` (`cors_origins`) | La app real corre en `:3000`; verificar siempre desde ahí. Para añadir orígenes, editar `cors_origins` en `backend/app/core/config.py` |
| Migraciones tenant fallaban: `gymdb_template` no existe / `DuplicateColumnError` | `migrations/tenant/env.py` hardcodeaba la URL e ignoraba la inyectada; las tenant DBs se crean con `create_all` (sin `alembic_version`) | `env.py` debe leer `config.get_main_option("sqlalchemy.url")`; para DBs creadas con `create_all`, `alembic stamp <rev_previa>` y luego `upgrade head` |
| Relación plan↔membresía por `plan_name` (string) era frágil | Renombrar/borrar plan rompía el vínculo con cobros | `Membership.plan_id` (FK) + snapshot de `plan_name`/`price`; borrar plan en uso = soft-delete (`is_active=False`, 200 `{archived:true}`, nunca 500) |
| `URL.createObjectURL` (blob) se guardaba como `photo_url` | El blob local no persiste tras recargar | No enviar `photo_url` si empieza con `blob:`; la subida real de imágenes es fase posterior |
| 422 al crear miembro: "Datetimes provided to dates should have zero time" | `parq_completed_at` se enviaba con `toISOString()` (datetime) pero el schema lo tipa como `date` | Para campos `date` del backend enviar `toISOString().split("T")[0]` (fecha pura), nunca el datetime completo |
| `html5-qrcode`: "Cannot stop, scanner is not running or paused" | El cleanup llamaba `stop()` aunque la cámara nunca arrancó | Verificar `getState()` (2=SCANNING, 3=PAUSED) antes de `stop()`; si no, solo `clear()` |
| Imágenes de `/public` (logo) daban 307 → /login | El `matcher` del middleware de auth no excluía archivos estáticos con extensión | Añadir `.*\.[\w]+$` a la negación del matcher en `frontend/middleware.ts` para dejar pasar `.png/.svg/...` sin sesión |
| Tests fallaban con "Event loop is closed" / "attached to a different loop" al reutilizar tenant | Los engines (tenant cache + master global) quedan atados al event loop del primer test | Fixture autouse en conftest que hace `dispose_tenant_engines()` + `master_engine.dispose()` tras cada test; el cache de engines es dict iterable, no `lru_cache` |
| `receipt_number_seq` no existía en tenants nuevos pese a estar en la migración | Los tenants nuevos se crean con `create_all` + `stamp head` — el cuerpo de las migraciones nunca corre | Todo objeto DDL (secuencias, índices parciales) debe estar ligado a `TenantBase.metadata` (`Sequence(..., metadata=...)`) además de en la migración |
| Tests con KeyError 'access_token' esporádico | Rate limit de `/auth/register` (5/min) y `/auth/login` (10/min) con un register+login por test | Cachear el token por email en un dict a nivel de módulo de test; un solo register/login por suite |
| Login de staff invitado devolvía 401 en `/auth/login` | El staff entra por `/auth/staff/login` (resuelve tenant vía staff_directory); `/auth/login` es solo para owners | En tests y frontend usar el endpoint correcto según el rol |
| `await get_gym_settings(db)` recibía un AsyncSession como `tenant` y explotaba con `.name` | El handler de ruta `get_gym_settings` (GET /settings/gym) sombrea el import del servicio homónimo en `settings.py` | Importar servicios con alias cuando el módulo tiene un handler del mismo nombre (`as load_gym_settings`) |
| Webhook de Wompi llega sin JWT y no sabe de qué gym es | Endpoint público multi-tenant | `reference = FC-{slug}-{hex12}`: el slug resuelve el tenant en Master DB y la firma se valida con el `events_secret` de ESE gym (cifrado en gym_settings); idempotencia por `event_id` unique |
| El job diario corre por todos los tenants y uno roto tumbaba el resto | Excepciones no aisladas | `for_each_tenant`: cada tenant en su propia sesión/transacción con try/except + log; lock `pg_try_advisory_lock` en Master para evitar doble worker |
| La suite se colgaba para siempre en `DROP TABLE` (teardown de fixtures) | `drop_all` corría dentro del contexto de la sesión: `refresh`/`select` dejan una transacción abierta cuyos AccessShareLock bloquean el DROP | Cerrar la sesión (`await session.close()`) ANTES de `drop_all` en fixtures; si la test DB queda zombi: `pg_terminate_backend` + `DROP DATABASE ... WITH (FORCE)` y recrear |
| "Error cargando datos" en Pagos: el front pedía `limit=200` y el endpoint capaba `le=100` → 422 silencioso | Tope de paginación desalineado entre frontend y backend | Al subir el `limit` que pide el front, alinear el `le=` del Query; verificar el request real con el panel network, no asumir el 422 |
| Test de mantenimiento fallaba solo de 7pm a medianoche | El test comparaba `date.today()` (UTC del contenedor) con la fecha Bogotá del backend | En tests, comparar fechas con `datetime.now(ZoneInfo("America/Bogota")).date()`, nunca `date.today()` |
| "Duplicación" de membresía al descongelar: aparecían dos "Activa" del mismo plan | (a) `/assign` no validaba solapamiento y creaba membresías libremente; (b) `effective_status` marcaba "active" a una membresía futura (start>hoy) → se veían dos activas; (c) unfreeze extendía end_date sin correr las encadenadas | Estado `scheduled` (start>hoy) en `effective_status`; helper `next_chain_start` compartido por assign/charge/webhook; unfreeze desplaza también las membresías programadas posteriores. Nunca solapar |
| Job diario agotaba conexiones de Postgres con muchos tenants (`TooManyConnectionsError`) | `for_each_tenant` usaba `get_tenant_engine` (cache con pool por tenant): un pool por cada tenant abierto a la vez | En el job, engine desechable `create_async_engine(..., poolclass=NullPool)` por tenant + `engine.dispose()` en finally. El cache de engines es solo para el request-path |
| Columnas nuevas de `gym_settings`/`members` no existían en tenant DBs de dev/test (`UndefinedColumnError`) | Los tenants existentes se crearon con `create_all` + `stamp head`: la migración nueva nunca corre su cuerpo en ellos | Tras agregar columna a un modelo tenant: además de la migración, alinear las DBs ya creadas con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` sobre todas las `gym_%` (loop psql en el contenedor db) |
| `migrate_tenants.py` fallaba en 112/118 tenants con `DuplicateColumnError` incluso en DBs CON `alembic_version` | Schema-drift: el esquema lo bootstrapea `create_all` (tenant_service), no las migraciones; muchas DBs quedaron stampeadas en revisión vieja pero con esquema completo → el upgrade replaya migraciones cuyo efecto ya existe | El aligner de fleet hace `create_all` (idempotente) + `stamp head` para TODAS las tenant DBs, nunca `upgrade` sobre drift. Migraciones nuevas deben usar `ADD COLUMN IF NOT EXISTS` para que el siguiente `upgrade` aplique limpio |
| Scheduler in-process duplicaba WhatsApp/reconciliación con varias réplicas | Solo `expire_memberships_job` tomaba `pg_try_advisory_lock`; los jobs de intervalo (`process_outbox`, `reconcile_payments`) iban directo a `for_each_tenant` | Helper `_run_with_advisory_lock(key, name, work)` con clave por job envuelve los 3; verificado que dos corridas concurrentes → una toma lock, otra salta |
| `DataError: can't subtract offset-naive and offset-aware` al filtrar `CheckIn.created_at >= cutoff` | `now_bogota()` es tz-aware pero `checkins.created_at` (y `created_at` en general) es TIMESTAMP WITHOUT TIME ZONE (UTC naive) | Para cutoffs contra `created_at` usar naive: `utcnow_naive() - timedelta(...)`, nunca `now_bogota()`. Las comparaciones de fecha de negocio (vencimientos) sí usan `today_bogota()` |
| Job/emitter encolaba notificaciones que no persistían | El emitter no hacía `await session.commit()`; `for_each_tenant` abre la sesión pero no auto-commitea al salir | Cada emitter (`_emit_*`) debe terminar con `await session.commit()`, igual que `_emit_maintenance_alerts` |
| `alembic upgrade head` sobre `gymdb_master` de dev fallaba con `DuplicateColumnError` (column "country") | La Master DB de dev también tiene schema-drift: `alembic_version` quedó en una rev vieja pero el esquema ya tenía la columna | Igual que tenants: `alembic stamp <rev_donde_está_el_esquema>` y luego `alembic upgrade head`. La Master sí es migration-driven (a diferencia de tenants), pero el dev DB puede driftar |
| Staff invitado no podía entrar por la web pese a existir `/auth/staff/login` | El `authorize()` de NextAuth (`frontend/auth.ts`) solo llamaba `/auth/login` (owners) | `authorize` prueba `/auth/login` y cae a `/auth/staff/login`; un solo formulario sirve owner y staff |
| Invitación de staff con `TEMP_PASSWORD = "TempPass123!"` (pública, igual para todos) | El invite creaba el `UserStaff` con password fijo del código | Invitación por token de un solo uso (`StaffInvitation` en Master DB, hash sha256, expira 48h): el invite devuelve `invite_url`; el invitado fija su password en `/auth/staff/accept-invite`. El usuario no se crea hasta aceptar |
| 14 tests fallaban en DB fresca solo de 7pm-medianoche Bogotá (membresía "scheduled" en vez de "active") | Los tests usaban `date.today()` (fecha **UTC**) como `start_date`; el backend usa fecha Bogotá (`today_bogota`). De 00-05 UTC, UTC ya es mañana → la membresía arranca "en el futuro". Nunca se detectó porque CI corría con `pytest \|\| true` (los tests nunca corrían de verdad) | En tests usar `today_bogota()` de `app.core.timeutil` (la misma fuente que el backend), nunca `date.today()`. Validar la suite contra una DB **fresca** (réplica de CI), no solo contra el dev DB acumulado |
| Screenshot full-page de la landing mostraba secciones intermedias en negro | Las secciones usan Framer `whileInView` con `initial="hidden"` (opacity 0): un screenshot full-page no dispara las animaciones de scroll, así que quedan invisibles | Para verificar secciones con scroll-reveal, hacer `js "window.scrollTo(0,N)"` + screenshot `--viewport` por sección, no un solo full-page. El contenido sí renderiza (confirmar con `text`) |
| Assets nuevos en `frontend/public` (screenshots) daban 404 pese a existir en el repo | El frontend corre como build standalone (`node server.js`) sin volumen: `/public` se hornea en la imagen en build-time | Tras agregar archivos a `frontend/public`, `docker compose build frontend` para que se sirvan; verificar con `curl /ruta` (200) antes de confiar en la UI |
| `apiClient` (axios con `Content-Type: application/json` por defecto) rompía el upload multipart | El header JSON fijo del cliente impedía que axios pusiera el boundary de `multipart/form-data` | Para subir `FormData` pasar `headers: { "Content-Type": undefined }` en el config del request; axios entonces setea el multipart con boundary |
| `docker login` a ECR daba 400 Bad Request desde PowerShell 5.1 | El pipe de PowerShell re-codifica el password (UTF-16/newline) | Hacer `aws ecr get-login-password \| docker login --password-stdin` desde Git Bash, nunca desde PowerShell 5.1 |
| Enrutar `/api/*` completo al backend rompía NextAuth | `/api/auth/*` y `/api/health` son rutas del frontend Next.js; el backend FastAPI solo sirve `/api/v1/*` | En proxys/ALB enrutar solo `/api/v1/*`, `/docs`, `/openapi.json` al backend; el resto de `/api/*` cae al frontend (corregido en `infra/alb.tf` y `deploy/Caddyfile`) |
| El trigger del Select de roles mostraba `admin`/`receptionist` crudo (inglés) aunque los items estaban en español | `SelectValue` de Base UI sin children renderiza el **value** crudo, no el label del item | Siempre pasar children función a `SelectValue`: `{(v) => LABELS[v]}` cuando el value no es texto presentable |
| Overlay decorativo capturaba clicks del botón Editar en cards de planes | Div `absolute` de `glassEffect` en `pricing-card.tsx` sin `pointer-events-none` quedaba encima de los botones | Todo overlay decorativo (`aria-hidden`, gradientes) lleva `pointer-events-none` |
| El wizard de miembros no cargaba planes al abrir el diálogo | El `useEffect` que hace el fetch no tenía `dialogOpen` en las deps: el efecto nunca se re-ejecutaba al abrir | Toda condición que gatilla un efecto (`if (!x) return`) debe estar en el array de deps; verificar con el panel network que el request salga |
| 500 latente: miembro con única membresía cancelada rompía el check-in | `checkin_status` devolvía "cancelled" pero el Literal de `CheckInResponse.membership_status` no lo admite y FastAPI valida el response | Mapear estados internos a los del Literal en el servicio (`cancelled` → `no_membership`); al agregar un estado, revisar TODOS los Literals de response que lo transportan |
| Receivables ocultaba el saldo de un miembro con membresía cancelada del mismo día | `latest` por miembro se quedaba con la cancelada (empate de `end_date` con la vigente) | Al elegir "la membresía más reciente" siempre saltar `status == cancelled` |

**Protocolo:** Al detectar un error que no estaba documentado, añade una fila a la tabla antes del commit.

---

## Flujo de trabajo gstack (OBLIGATORIO)

gstack es la caja de herramientas profesional del repo. **Úsala siempre**, no improvises equivalentes:

- **`/browse`** — toda navegación/QA visual en el navegador (nunca Claude-in-Chrome). Verificar en `localhost:3000` (app real), no en el dev server.
- **`/qa`** — test + fix iterativo de una pantalla antes de darla por lista (tiers Quick/Standard/Exhaustive).
- **`/review`** — revisar el diff antes de cada commit (SQL safety, trust boundaries, side effects).
- **`/design-review`** — auditoría visual con evidencia antes/después tras cambios de UI.
- **`/ship`** + **`/land-and-deploy`** — crear PR (commits en español) y desplegar.
- **`/investigate`** — debugging sistemático con causa raíz (no parchar sin entender).

Regla: ningún cambio de UI se considera terminado sin verificación en vivo (`/browse`), y ningún commit sale sin `/review`.

---

## Preferencias del usuario

- **Idioma de respuesta:** español (código en inglés, comunicación en español)
- **Estilo de código:** sin comentarios salvo que el WHY sea no obvio; sin abstracciones prematuras
- **Commits:** español, convencionales (`feat`, `fix`, `refactor`…) — ver sección arriba
- **UI:** premium, dark mode first, Framer Motion para animaciones de entrada (stagger en listas)
- **Respuestas:** concisas — sin repetir lo que el usuario ya sabe, sin resúmenes al final
- **CLAUDE.md como documento vivo:** actualizar al final de cada sesión con errores encontrados o reglas nuevas que funcionen

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).
