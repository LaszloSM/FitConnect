# Revision estrategica de FitConnect

Fecha: 2026-06-19  
Autor: Codex  
Alcance: revision de producto, arquitectura, seguridad, frontend, backend, infraestructura, landing y flujo de trabajo con gstack.

## Resumen ejecutivo

Mi opinion sincera: FitConnect ya no se siente como un MVP improvisado. Tiene una base de producto bastante seria para gimnasios en Colombia: multi-tenant real por base de datos, flujo de caja/POS, membresias, kiosko, check-ins, clases, Wompi, WhatsApp, auditoria y un frontend que compila en Next.js 16. Hay mucho trabajo acumulado y varias decisiones muestran aprendizaje de errores reales, no arquitectura de pizarra.

Pero todavia no lo consideraria listo para produccion comercial con clientes pagando sin una fase de endurecimiento. El mayor riesgo no es que "falten pantallas"; el mayor riesgo es operacional: CI permisivo, migraciones tenant con historia de drift, secretos y TLS incompletos en infraestructura, pruebas que existen pero no estan integradas como gate confiable, y algunas superficies de seguridad que necesitan pulirse antes de operar datos reales de miembros y pagos.

La direccion correcta seria: congelar el scope por 2-3 semanas, hacer hardening de seguridad/operacion, arreglar CI y migraciones, ejecutar QA visual real con gstack, y luego redisenar la landing como pagina de venta con evidencia del producto, no solo promesa.

## Contexto revisado

Revise:

- `CLAUDE.md`, `AGENTS.md`, `README.md`, `PRODUCT.md`, `DESIGN.md`, `FITCONNECT_DESIGN_SYSTEM.md`.
- `frontend/AGENTS.md`, `frontend/auth.ts`, `frontend/middleware.ts`, landing, dashboard, layout, componentes y configuracion.
- Backend FastAPI: auth, deps, tenants, pagos, webhooks, scheduler, settings, usuarios, auditoria, modelos tenant/master.
- Infra: Docker Compose, Terraform ECS/RDS/ALB/S3/Redis, GitHub Actions.
- Tests backend/e2e frontend.
- gstack local instalado en `~/.claude/skills/gstack`.
- Graphify: use consultas sobre arquitectura, auth/tenants, pagos, frontend, landing, infra y deploy.

Validaciones ejecutadas:

- `GSTACK_OK`: gstack esta instalado.
- `npm run build` en frontend: pasa correctamente. Next.js avisa que `middleware` esta deprecado y debe migrarse a `proxy`.
- `npm run lint`: falla por configuracion ESLint 9 con estructura circular en config.
- `pytest -q`: no arranca sin variables de entorno requeridas (`MASTER_DATABASE_URL`, `TENANT_DATABASE_URL_TEMPLATE`, `REDIS_URL`, `SECRET_KEY`).
- Import backend con env minima: `from app.main import app` funciona.

## Lo mejor del proyecto

### 1. El dominio esta bien elegido

El producto entiende problemas reales de gimnasios colombianos:

- Cedula, NIT, ciudad/pais y contexto COP.
- Caja y turnos, no solo "pagos".
- Kiosko con tablet/celular viejo.
- Wompi y WhatsApp, que son canales correctos para Colombia.
- Membresias con congelamiento, renovaciones, gracia, morosos y recibos.
- Staff con roles owner/admin/receptionist.

Esto es bueno. No parece un CRM generico pintado de gimnasio.

### 2. La arquitectura multi-tenant tiene intencion seria

Hay Master DB para tenants/owners/staff directory y tenant DB por gimnasio. Eso da aislamiento fuerte. Tambien hay pruebas de aislamiento entre tenants y resolucion de staff por indice global.

La separacion por base de datos es mas costosa de operar que un `tenant_id` en todas las tablas, pero para un SaaS con datos sensibles y potencial B2B es defendible.

### 3. Pagos y caja estan mas pensados que el promedio

Vi detalles buenos:

- Pago en efectivo requiere turno de caja abierto.
- Transferencia queda pendiente hasta confirmacion.
- Wompi confirma por webhook con firma e idempotencia.
- Recibos tienen secuencia por tenant.
- Stock se descuenta de forma atomica en venta POS.
- Pagos con recibo no se borran.

Esto muestra criterio de negocio. Muchos SaaS fallan justo ahi.

### 4. Hay aprendizaje acumulado

`CLAUDE.md` tiene una tabla de errores aprendidos muy valiosa. Eso baja riesgo si se sigue usando. Varias decisiones actuales vienen de bugs reales: `staff_id` en token, scheduler con locks, schema drift, fechas Bogota vs UTC, receipt sequence en metadata, etc.

### 5. El frontend tiene identidad

El cambio de naranja a Volt, el dark mode first, los acentos por modulo y los componentes como `KpiCard`, `GlassCard`, `PageHeader`, `EmptyState` van en una direccion clara. La app no parece una plantilla basica.

## Riesgos principales

### P0 - CI no puede ser confiable asi

En `.github/workflows/deploy.yml`, el backend corre:

```bash
cd backend && pytest --cov=app tests/ || true
```

Eso permite desplegar aunque fallen los tests. Para un SaaS con pagos, membresias y datos personales, esto es inaceptable.

Tambien `npm run lint` falla localmente, asi que hoy no hay lint gate real. La build de Next pasa, pero eso no reemplaza lint, tests ni QA.

Recomendacion:

- Quitar `|| true`.
- Crear env de test real en CI con Postgres/Redis.
- Separar jobs: `backend-unit`, `backend-integration`, `frontend-build`, `frontend-e2e`.
- Bloquear deploy si cualquiera falla.
- Publicar coverage, pero no como vanity metric: usarlo para detectar modulos sin proteccion.

### P0 - Infra produccion expone secretos como environment plain text

En Terraform ECS, `SECRET_KEY`, `NEXTAUTH_SECRET`, password DB y URLs con password se inyectan como `environment`. Eso suele quedar visible en task definitions/state/logs segun permisos.

Recomendacion:

- Mover secretos a AWS Secrets Manager o SSM Parameter Store.
- Usar `secrets` en ECS task definition, no `environment`.
- Cifrar Terraform state con KMS y restringir acceso.
- Rotacion documentada para `SECRET_KEY`, `NEXTAUTH_SECRET`, Wompi, WhatsApp y DB.

### P0 - Produccion necesita HTTPS/dominio/cookies correctas

Terraform usa:

```hcl
NEXTAUTH_URL = "http://${aws_lb.main.dns_name}"
NEXT_PUBLIC_API_URL = "http://${aws_lb.main.dns_name}"
```

ALB permite 80 y 443, pero no vi una configuracion completa de ACM, redirect 80->443, dominio, HSTS ni cookies secure/samesite revisadas.

Recomendacion:

- Dominio real `app.fitconnect...` y `api` si aplica.
- ACM certificate + listener 443.
- Redirect HTTP a HTTPS.
- HSTS.
- NextAuth con `NEXTAUTH_URL=https://...`.
- Revisar cookies `Secure`, `HttpOnly`, `SameSite=Lax/Strict`.

### P0 - Migraciones tenant estan en modo supervivencia

El proyecto documenta que tenants nuevos nacen con `TenantBase.metadata.create_all` y luego `alembic stamp head`. Esto resolvio drift, pero no es una estrategia sana a largo plazo.

Riesgo:

- Las migraciones dejan de ser la fuente de verdad.
- Una columna nueva puede existir en nuevos tenants pero no en antiguos.
- El deploy puede "pasar" y fallar por tenant especifico.
- Reproducir schema historico se vuelve dificil.

Recomendacion:

- Definir una estrategia formal:
  - `create_all + stamp` solo para bootstrap inicial controlado.
  - Migraciones futuras idempotentes y probadas contra tenant nuevo y tenant viejo.
  - Job de migracion fleet con reporte por tenant, retry y rollback/stop policy.
  - Prueba CI que crea un tenant desde cero y otro desde revision anterior, luego actualiza ambos a head.

### P0 - Invitacion de staff con password temporal fijo

`backend/app/api/v1/users.py` tiene:

```python
TEMP_PASSWORD = "TempPass123!"
```

Eso es peligroso en produccion. Cualquier staff invitado tendria una clave predecible si el flujo no fuerza cambio seguro.

Recomendacion:

- Generar token de invitacion de un solo uso con expiracion.
- Enviar link por email/WhatsApp.
- Forzar set password antes del primer login.
- Guardar hash del token, no token plano.
- Invalidar token al usarlo.

### P1 - Tokens en query string

El SSE de recepcion usa:

```ts
new EventSource(`${base}/api/v1/realtime/reception?token=${encodeURIComponent(token)}`)
```

La razon es tecnica: `EventSource` no permite headers. Pero los tokens en query pueden quedar en logs, history, proxies, analytics o capturas.

Recomendacion:

- Cambiar a cookie httpOnly para SSE autenticado, o
- Usar un token efimero especifico para SSE con TTL corto y scope `realtime`, o
- Cambiar a WebSocket con protocolo de auth controlado.

### P1 - Token de kiosko persistente en localStorage

El kiosko guarda el JWT en `localStorage`. Entiendo el tradeoff: tablet instalada en entrada. Pero es una superficie fisica y el token no expira.

Recomendacion:

- Mantener revocacion por `kiosk_devices.is_active`, pero agregar:
  - rotacion de token desde settings,
  - ultimo uso/IP/user-agent,
  - nombre de dispositivo visible,
  - scopes estrictos,
  - opcion "cerrar sesion del dispositivo",
  - TTL renovable o token versionado.

### P1 - Rate limit por IP es insuficiente

SlowAPI usa `get_remote_address`. Detras de ALB/proxy hay que asegurar `X-Forwarded-For` correcto, y para login se necesita limite por IP + email + tenant.

Recomendacion:

- Rate limit por combinacion `ip + email`.
- Diferenciar owner login y staff login.
- Lockout progresivo o captcha despues de N intentos.
- Registro de intentos fallidos.
- Alertas para credential stuffing.

### P1 - Falta observabilidad de produccion

Hay CloudWatch logs y `job_monitor`, pero falta lo que yo esperaria para operar clientes reales:

- Error tracking tipo Sentry.
- Request ID / correlation ID.
- Structured logging JSON.
- Metricas de negocio/tecnicas: latencia, 5xx, DB pool, jobs, webhook failures, outbox lag.
- Alertas.
- Dashboards.

Recomendacion:

- Sentry frontend/backend.
- OpenTelemetry o al menos logs estructurados.
- Alarmas CloudWatch para 5xx ALB, CPU/mem ECS, RDS connections, failed jobs.
- Healthcheck que no solo diga `ok`, sino dependencias criticas.

### P1 - PII y privacidad

El sistema almacena datos sensibles: cedula, telefono, salud/PAR-Q, fecha nacimiento, asistencia, pagos. Eso exige disciplina.

Recomendacion:

- Clasificacion de datos.
- Politica de retencion.
- Export/delete de datos por miembro.
- Auditoria de accesos y cambios sensibles.
- Enmascarar cedula/telefono en logs.
- Backups cifrados y prueba de restore.
- Documento de privacidad y terminos.
- Consentimiento PAR-Q y tratamiento de datos personales.

## Estado por area

### Backend

Estado: prometedor, pero necesita hardening.

Fortalezas:

- FastAPI + SQLAlchemy async bien usado en varias zonas.
- Modelos de dominio ricos.
- Webhook Wompi con firma e idempotencia.
- Scheduler con advisory locks para varias replicas.
- Tenant jobs con `NullPool` para no agotar conexiones.
- Auditoria existe y se usa en acciones importantes.

Debilidades:

- Permisos no son uniformes. Hay endpoints que solo dependen de tenant token y no siempre de `get_current_staff` o `require_role`.
- El contrato de migraciones tenant es fragil.
- Tests dependen mucho de estado DB local y env.
- Falta estrategia formal para errores, logs y trazabilidad.
- No vi una capa clara de service/repository consistente; algunas rutas cargan bastante logica.

Correcciones prioritarias:

1. Revisar permisos endpoint por endpoint.
2. Mover logica pesada de rutas a servicios donde tenga sentido.
3. Crear matriz de roles por modulo.
4. Fortalecer test suite con fixtures reproducibles.
5. Formalizar migraciones tenant.

### Frontend

Estado: compila y tiene sistema visual, pero necesita QA visual y limpieza.

Fortalezas:

- Next.js 16 build pasa.
- NextAuth usa cookies httpOnly para sesion.
- App Router organizado por auth/dashboard/kiosk.
- Componentes compartidos razonables.
- Dark mode y tokens CSS.
- Buen uso de Framer Motion en varias pantallas.

Debilidades:

- ESLint esta roto.
- Next 16 avisa de `middleware` deprecado.
- Hay uso de `any` en pantallas criticas como dashboard/kiosko.
- Algunos comentarios estan en codigo donde el usuario prefiere pocos comentarios.
- E2E frontend parece depender de usuario `owner@test.com` ya existente.
- Falta QA responsive sistematico.

Correcciones prioritarias:

1. Arreglar ESLint 9/config Next.
2. Migrar `middleware.ts` a `proxy` segun Next.js 16.
3. Reducir `any` en flujos core.
4. Hacer E2E que cree su propio tenant/usuario o use seed controlado.
5. Correr `/qa` y `/design-review` con gstack sobre app real.

### Infraestructura

Estado: hay base Terraform, pero no produccion lista.

Fortalezas:

- ECS Fargate con 2 replicas.
- RDS privado, Multi-AZ, deletion protection.
- Redis/ElastiCache.
- S3 para uploads.
- ALB separa `/api/*` y frontend.
- Container insights activo.

Debilidades:

- Secretos en task definition.
- `skip_final_snapshot = true` aun con deletion protection.
- Log retention 7 dias es corto para auditoria.
- Falta HTTPS completo/dominio.
- No vi WAF, backups probados, alarms completas ni autoscaling.
- GitHub Actions deploya con tests backend ignorables.

Correcciones prioritarias:

1. Secrets Manager.
2. TLS + dominio + redirect.
3. CloudWatch alarms.
4. WAF rate based rules.
5. Backups y restore drill.
6. Separar staging/prod.

### Producto

Estado: el core esta bien enfocado. Falta empaquetarlo y cerrarlo comercialmente.

Ya tiene:

- Miembros.
- Membresias/planes.
- Pagos/POS/caja.
- Check-ins.
- Kiosko.
- Clases.
- Maquinas.
- Reportes.
- Settings.
- Wompi/WhatsApp base.
- Auditoria.

Falta o reforzaria:

- Onboarding guiado de primer gimnasio con checklist accionable.
- Seed/demo real para probar sin datos.
- Gestion completa de staff/invitaciones segura.
- Roles/permisos visibles por plan.
- Facturacion electronica/DIAN como roadmap, no necesariamente ahora.
- Multi-sede real si se va a vender a cadenas.
- Importacion desde Excel.
- Exportaciones confiables por modulo.
- Backoffice interno de plataforma: tenants, estado, plan, suspension, soporte.
- Soporte/ayuda in-app.
- Centro de notificaciones accionable.
- Plantillas WhatsApp validadas por caso.
- Reportes de cohortes/retencion/asistencia.
- Politicas legales visibles: privacidad, terminos, tratamiento de datos.

## Seguridad profesional recomendada

### Autenticacion y sesiones

- Password policy minima: longitud, complejidad razonable, bloqueo por intentos, no reutilizacion de password temporal.
- Invitaciones por token de un solo uso.
- MFA opcional para owners.
- Rotacion de sesiones al cambiar password.
- Revocacion de tokens por `jti` para casos sensibles.
- Diferenciar scopes: staff, owner, kiosk, realtime, webhook.

### Autorizacion

- Matriz RBAC escrita y testeada.
- Tests negativos por rol para cada modulo.
- Endpoints de lectura sensible tambien deben exigir staff activo, no solo tenant token.
- Owner-only para configuracion fiscal, integraciones, usuarios, auditoria.
- Receptionist limitado a check-in, pagos operativos y lectura minima.

### Datos y privacidad

- Cifrado de secretos de integraciones ya existe, mantenerlo.
- Cifrado at-rest RDS/S3 con KMS.
- No loggear tokens, cedulas completas, secretos ni cuerpos de webhook completos.
- Enmascarar PII en auditoria/logs cuando no sea necesario.
- Retencion y eliminacion de datos.
- Export de datos por tenant.
- Backups por tenant y restauracion probada.

### Web/API

- HTTPS obligatorio.
- HSTS.
- CORS por dominio real, no wildcard.
- Security headers en frontend.
- CSRF revisado para acciones que dependan de cookie.
- Rate limits por login/register/webhook/kiosk.
- Body size limits.
- Validacion estricta de uploads.
- Antivirus o scanning para archivos si se suben imagenes/documentos.

### Pagos

- Wompi:
  - firma con `events_secret` por tenant,
  - idempotencia,
  - reconciliacion,
  - no exponer private keys,
  - logging seguro de eventos fallidos.
- Recibos:
  - secuencia por tenant,
  - no borrado de pagos con recibo,
  - flujo formal de anulacion/reembolso.
- Caja:
  - auditoria para apertura/cierre/diferencias,
  - permisos claros,
  - reportes de cierre exportables.

### Infra y operaciones

- Secrets Manager/SSM.
- WAF en ALB.
- Alarmas 5xx/latencia/RDS/conexiones/jobs.
- Sentry.
- CI/CD con gates reales.
- Staging igual a prod.
- IaC escaneada con Checkov/tfsec.
- Dependabot/Renovate.
- SBOM y escaneo de imagenes ECR.
- Runbooks: deploy, rollback, restore, incidente de seguridad, Wompi caido, WhatsApp caido.

## Landing actual

Mi opinion: la landing actual comunica mejor que una landing generica. Tiene buen foco en Colombia, kiosko, caja, Wompi y WhatsApp. El copy tiene verdad de producto.

Pero visualmente todavia se siente demasiado "AI SaaS landing":

- Hero centrado con glow/blur decorativo.
- Feature grid de 3 columnas con iconos.
- Mockup dibujado, no evidencia real del producto.
- Pricing muy temprano sin suficiente prueba/confianza.
- Falta una captura real o composicion realista de la app.
- Falta prueba social, casos de uso, objeciones comerciales y seguridad explicada con mas peso.

### Rediseño recomendado de landing

Objetivo: que un dueño de gimnasio colombiano entienda en 10 segundos: "esto reemplaza mi Excel, mi cuaderno, mi caja y mis recordatorios por WhatsApp".

Estructura sugerida:

1. Hero con producto real
   - H1 directo: "FitConnect" o "Software operativo para gimnasios en Colombia".
   - Subcopy: check-in con cedula, caja/POS, membresias, Wompi y WhatsApp.
   - CTA principal: "Probar gratis".
   - CTA secundaria: "Ver demo".
   - Visual: captura real del dashboard/kiosko/recepcion, no cards inventadas.

2. Franja de problema real
   - "Lo que hoy esta repartido entre Excel, WhatsApp, cuaderno y caja".
   - 4 dolores: morosos, caja descuadrada, entrada lenta, clases sobrevendidas.

3. Flujo operativo
   - Entrada: cedula/QR.
   - Recepcion: alerta en vivo.
   - Cobro: efectivo/transferencia/Wompi.
   - Renovacion: WhatsApp.
   - Reporte: caja e ingresos.

4. Modulos por trabajo, no por feature
   - Control de acceso.
   - Caja y pagos.
   - Miembros y membresias.
   - Clases.
   - Reportes.
   - Integraciones.

5. Seguridad y confianza
   - Base por gimnasio.
   - Roles de staff.
   - Auditoria.
   - Secretos cifrados.
   - Backups y privacidad cuando esten implementados.

6. Pricing
   - Mantener simple.
   - Evitar prometer "todos los modulos sin recortes" si aun hay modulos en hardening.
   - Incluir "por sede" claramente.

7. FAQ comercial
   - Migracion desde Excel.
   - Que pasa con internet caido.
   - Wompi/WhatsApp.
   - Datos y privacidad.
   - Hardware de kiosko.

8. CTA final con demo
   - "Agenda una demo" + "Probar gratis".

Recomendacion visual:

- Menos glow y menos cards decorativas.
- Mas screenshots reales.
- Usar Volt como acento, no como ambiente entero.
- Hero full-bleed con una escena de producto.
- Secciones con una sola funcion.
- Animacion sobria: entrada, scroll reveal, hover minimo.

## Uso recomendado de gstack

gstack ya esta instalado. Yo lo usaria como proceso obligatorio, pero con una regla: no usarlo como ceremonia; usarlo como gate real.

Flujo recomendado por tipo de trabajo:

- Idea de producto grande: `/office-hours` -> `/plan-ceo-review` -> `/plan-eng-review`.
- Feature nueva: `/autoplan` -> implementacion -> `/review` -> `/qa`.
- Cambio visual/landing: `/plan-design-review` antes, `/design-review` despues.
- Bug complejo: `/investigate`.
- Seguridad: `/cso` antes de produccion y despues de cambios auth/pagos.
- Release: `/ship` y luego `/land-and-deploy`.
- Post-deploy: `/canary`.
- Memoria del repo: `/learn` para registrar patrones reales.

Aplicacion concreta para FitConnect:

1. Ejecutar `/cso` sobre el repo antes de tocar mas features.
2. Ejecutar `/qa-only http://localhost:3000` con datos seed.
3. Ejecutar `/design-review http://localhost:3000` para landing y dashboard.
4. Ejecutar `/review` antes de cada commit importante.
5. Ejecutar `/ship` solo cuando CI este arreglado.

## Roadmap recomendado

### Fase 1 - Hardening antes de vender

Duracion sugerida: 2-3 semanas.

- Arreglar CI: sin `|| true`, env test, Postgres/Redis services.
- Arreglar ESLint.
- Migrar Next `middleware` a `proxy`.
- Rehacer invitaciones staff.
- Secrets Manager en Terraform.
- HTTPS/dominio.
- Matriz RBAC + tests negativos.
- Strategy de migraciones tenant.
- Sentry/logs/alerts.
- QA gstack de flujos core.

Criterio de salida:

- Build/lint/tests pasan en CI.
- Se puede crear tenant, crear miembro, cobrar, generar recibo, usar kiosko, confirmar Wompi y ver auditoria en staging.
- No hay secretos planos en task definitions.

### Fase 2 - Producto vendible

Duracion sugerida: 3-5 semanas.

- Landing nueva con producto real.
- Onboarding demo/seed.
- Importar miembros desde Excel.
- Flujos de staff seguros.
- Centro de ayuda minimo.
- Reportes exportables pulidos.
- Backoffice interno para administrar tenants.
- Planes/precios finales.
- Legal: privacidad, terminos, tratamiento de datos.

Criterio de salida:

- Un gimnasio puede empezar sin asistencia tecnica pesada.
- Soporte puede diagnosticar problemas.
- El owner entiende valor en menos de 10 minutos.

### Fase 3 - Escala y diferenciacion

Duracion sugerida: 6-10 semanas.

- Multi-sede.
- Facturacion electronica/DIAN si el mercado lo exige.
- Analitica de retencion/asistencia.
- Automatizaciones WhatsApp avanzadas.
- Integraciones hardware opcionales.
- Roles personalizados.
- SLA/backup restore por tenant.

## Recomendaciones puntuales

Prioridad maxima:

1. No desplegar produccion comercial hasta que CI sea gate real.
2. Sacar secretos de Terraform ECS environment.
3. Arreglar invitaciones staff.
4. Definir migraciones tenant profesionalmente.
5. Hacer auditoria `/cso`.
6. Hacer QA real con navegador en flujos core.

Prioridad alta:

1. Migrar `middleware` a `proxy`.
2. Arreglar lint.
3. Convertir SSE token query a token efimero o cookie.
4. Reforzar kiosk token lifecycle.
5. Agregar Sentry y structured logs.
6. Crear seed/demo reproducible.

Prioridad media:

1. Mejorar landing con screenshots reales.
2. Reducir `any` en frontend.
3. Limpiar comentarios innecesarios.
4. Fortalecer E2E frontend.
5. Documentar matriz de roles.
6. Agregar terminos/privacidad.

## Veredicto honesto

FitConnect esta en un punto muy interesante: tiene mas sustancia que muchos MVPs y ataca un mercado concreto con workflows reales. La base tecnica no es perfecta, pero si es recuperable y tiene buenas decisiones.

No intentaria agregar mas features grandes ahora. Seria un error. El siguiente salto de valor no viene de "otro modulo"; viene de confianza: seguridad, deploy, migraciones, QA, observabilidad y una landing que venda con evidencia real.

Mi recomendacion profesional: tratar las proximas semanas como una fase de "production readiness". Si se hace bien, FitConnect puede convertirse en una SaaS seria. Si se sigue agregando funcionalidad sin cerrar estos riesgos, el proyecto se va a sentir potente en demo pero fragil cuando entre el primer cliente real con datos, pagos y staff usando el sistema todos los dias.
