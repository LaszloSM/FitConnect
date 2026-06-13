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
