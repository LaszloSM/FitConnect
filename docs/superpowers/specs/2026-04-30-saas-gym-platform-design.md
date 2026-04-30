# SaaS Gym Platform — Diseño Completo MVP

**Fecha:** 30 de abril de 2026
**Fase:** MVP — Plataforma Web Admin (Plan Básico)
**Mercado objetivo:** Colombia (Riohacha, La Guajira)
**Escala objetivo:** 1,000–5,000 usuarios iniciales
**Stack:** FastAPI + Next.js 14 + AWS

---

## 1. VISIÓN DEL PRODUCTO

SaaS de gestión de gimnasios para el mercado colombiano. Permite a dueños y administradores de gym gestionar miembros, pagos, clases, máquinas y reportes desde una plataforma web profesional. Incluye un chatbot de IA en lenguaje natural para consultas operativas.

### Modelo de negocio

Suscripción modular con precio base fijo que escala según miembros activos del gym:

| Plan | Precio base/mes | Incluye |
|---|---|---|
| Básico | $160,000 COP | Panel web admin |
| Avanzado | $300,000 COP | Panel web + App móvil usuarios |
| Premium IA | $480,000 COP | Panel web + App + Agente IA nutrición/hipertrofia |

El precio escala con el número de miembros activos del gym en todos los planes. El gym puede contratar solo los módulos que necesita — no está forzado a cambiar de plan completo.

---

## 2. AUTENTICACIÓN Y ONBOARDING

### 2.1 Registro de gym (onboarding)
- Self-serve: el owner se registra directamente en la plataforma (nombre, email, contraseña, nombre del gym, ciudad)
- Al registrarse se crea automáticamente el `Tenant` con el owner como primer usuario
- Flujo de verificación de email (AWS SES) antes de acceder al dashboard
- Selección de plan SaaS y configuración de pago via Wompi al finalizar el registro

### 2.2 Autenticación
- **Proveedor:** NextAuth con Credentials Provider (email + contraseña)
- **Tokens:** JWT con claims: `user_id`, `tenant_id`, `role`
- El `tenant_id` se propaga en cada request al backend — el backend lo valida y lo usa para filtrar todos los datos
- **Password reset:** flujo via email con token de un solo uso (SES)
- **Sesiones:** 8 horas de expiración, refresh automático

### 2.3 Aislamiento multi-tenant
- Cada endpoint del backend verifica que `tenant_id` del token coincida con el recurso solicitado
- Middleware de FastAPI aplica el filtro de tenant automáticamente en todas las queries
- Imposible acceder a datos de otro gym desde cualquier endpoint autenticado

---

## 3. MECANISMO DE CHECK-IN (MVP)

### Check-in manual por recepcionista
- El recepcionista busca al miembro por nombre o cédula en el dashboard
- Hace clic en "Registrar entrada" — se crea el registro de check-in con timestamp
- La ocupación en tiempo real se calcula a partir de check-ins activos del día (entradas sin salida registrada)
- El recepcionista también puede registrar la salida manualmente

### Ocupación en tiempo real
- WebSocket actualiza el contador de ocupación en el dashboard cada vez que se registra una entrada o salida
- El cálculo es: `check-ins del día sin salida registrada / capacidad máxima de la sede`

### Check-in por QR (Fase 2 — app móvil)
- En el Plan Avanzado, el miembro genera QR desde la app y lo escanea en la entrada
- El sistema registra el check-in automáticamente sin intervención del recepcionista

---

## 4. ARQUITECTURA

### 2.1 Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind + shadcn/ui | SSR, dashboard profesional, base para React Native |
| Backend | FastAPI + Python 3.12 | Async nativo, ideal para IA/ML, tipado fuerte |
| Base de datos | PostgreSQL | Relacional, multi-tenant, robusto |
| Cache / RT | Redis | Cache y WebSockets para ocupación en tiempo real |
| Tareas async | Celery + SQS | Emails, notificaciones, sin bloquear la API |
| Storage | AWS S3 | Fotos de gym, documentos |
| Emails | AWS SES | Transaccionales, bajo costo |
| IA | LangChain + Claude API | Chatbot admin, intercambiable por proveedor |
| Pagos | Wompi | Pasarela colombiana, suscripciones recurrentes |
| App móvil (futuro) | React Native | Reutiliza lógica del frontend Next.js |

### 2.2 Infraestructura AWS

```
FRONTEND
  AWS Amplify (deploy desde git, CI/CD incluido)
  CloudFront + S3 (CDN, assets estáticos)

BACKEND
  ECS Fargate (containers sin administrar VMs, escala automático)
  ALB Application Load Balancer

DATOS
  RDS PostgreSQL t3.small (Multi-AZ, backups automáticos)
  ElastiCache Redis t3.micro (cache + WebSockets)

ASYNC
  SQS + Lambda (cola de tareas: emails, notificaciones)
  Celery workers en ECS

OTROS
  S3 (fotos, documentos)
  SES (emails transaccionales)
  Secrets Manager (credenciales, API keys)
```

**Costo estimado MVP:** ~$60–70 USD/mes para 1,000–5,000 usuarios.
**Escalabilidad:** cambio de tamaño de instancias sin modificar arquitectura ni código.

### 2.3 Modelo Multi-tenant

Cada gym es un `Tenant` completamente aislado. Sus datos nunca se mezclan con los de otros gyms. Cada tenant puede personalizar: sedes, planes de membresía, horarios de clases, inventario de máquinas, métodos de pago y configuración de notificaciones.

```
Tenant (gym)
├── id, nombre, logo, configuración
├── Sedes (1 o más ubicaciones)
├── Users (staff: owner, admin, receptionist)
├── Members (clientes del gym)
│   ├── Memberships (plan, fechas, estado)
│   └── CheckIns (historial de entradas)
├── Plans (planes que ofrece el gym)
├── Payments (cobros a miembros)
├── Classes (clases grupales + horarios)
├── Machines (inventario + mantenimiento)
└── Notifications (email + in-app)
```

---

## 3. SISTEMA DE ROLES (RBAC)

Tres roles jerárquicos por tenant. El Owner puede crear y asignar roles a su staff.

| Permiso | Owner | Admin | Receptionist |
|---|---|---|---|
| Ver reportes financieros | ✅ | ✅ | ❌ |
| Gestionar miembros | ✅ | ✅ | ✅ |
| Procesar pagos | ✅ | ✅ | ✅ |
| Gestionar clases | ✅ | ✅ | ❌ |
| Gestionar máquinas | ✅ | ✅ | ❌ |
| Gestionar roles/staff | ✅ | ❌ | ❌ |
| Ver dashboard | ✅ | ✅ | ✅ |
| Configurar sedes | ✅ | ❌ | ❌ |
| Configurar planes SaaS | ✅ | ❌ | ❌ |

---

## 4. MÓDULOS ADMIN WEB

### 4.1 Dashboard
- KPIs: ocupación actual, ingresos del día, miembros activos, pagos pendientes
- Gráfico de ingresos (7 días)
- Alertas: membresías por vencer, máquinas en mantenimiento, cupos llenos
- Ocupación por zona en tiempo real (WebSockets)
- **Chatbot IA** integrado como panel lateral

### 4.2 Miembros
- Listado con búsqueda y filtros (estado, plan, sede)
- CRUD completo: crear, editar, desactivar miembro
- Perfil de miembro: datos personales, plan activo, historial de pagos, historial de check-ins
- Renovación de membresía manual
- Exportar listado a Excel/PDF

### 4.3 Pagos
- Listado de pagos con filtros (estado, fecha, método)
- Pagos pendientes con acción rápida de cobro manual
- Historial completo por miembro
- **MVP:** registro manual de pagos (efectivo, transferencia) por el recepcionista
- **Wompi en MVP:** solo para la suscripción SaaS del gym (Flujo 2)
- **Wompi para miembros:** Fase 2 (requiere app móvil, Plan Avanzado)
- Notificación automática al miembro cuando se registra su pago

### 4.4 Clases
- Calendario semanal de clases
- CRUD de clases: nombre, instructor, horario, sede, cupo máximo
- Vista de ocupación por clase (cupos disponibles vs. ocupados)
- Sin inscripción online en MVP — la gestiona el recepcionista manualmente

### 4.5 Máquinas
- Inventario completo por sede
- Estados: Activa / En mantenimiento / Dañada
- CRUD: agregar, editar, dar de baja máquina
- Historial de mantenimientos por máquina
- Asignación de técnico responsable por mantenimiento
- Alertas automáticas cuando una máquina entra en mantenimiento

### 4.6 Reportes
- Ingresos: total del mes, por plan, por sede, comparativa mensual
- Asistencia: check-ins por día, horas pico, días pico de la semana
- Retención: tasa de renovación, membresías canceladas, tiempo promedio de permanencia
- Exportar todos los reportes a PDF y Excel

### 4.7 Configuración
- Perfil del gym: nombre, logo, dirección, teléfono, horarios
- Gestión de sedes: agregar, editar, desactivar sedes
- Planes de membresía: crear y editar planes (precio, duración, beneficios)
- Gestión de staff: invitar, asignar rol, desactivar
- Notificaciones: configurar qué alertas recibir y por qué canal
- Suscripción SaaS: ver plan activo, historial de pagos, cambiar plan

---

## 5. CHATBOT IA (MVP)

### Descripción
Panel lateral en el dashboard accesible para Owner y Admin. El administrador hace preguntas en lenguaje natural y el agente consulta los datos reales del tenant autenticado.

### Ejemplos de consultas
```
"¿Cuánto ingresé esta semana?"
→ "Esta semana ingresaste $1,840,000 COP en 47 pagos."

"¿Cuáles miembros vencen esta semana?"
→ Lista de nombres con fecha de vencimiento.

"¿Cuál es mi hora pico del lunes?"
→ "Entre 6am–8am con 45 check-ins promedio."

"¿Cuántos pagos tengo pendientes?"
→ "12 pagos pendientes por $480,000 COP total."
```

### Stack IA
```python
# Modelo intercambiable con 1 línea de configuración
llm = ChatAnthropic(model="claude-sonnet-4-6")  # MVP
# llm = ChatOpenAI(model="gpt-4o")              # alternativa
# llm = ChatGoogleGenerativeAI(model="gemini")  # alternativa

# Tools que el agente puede ejecutar
tools = [
    get_revenue(period),
    get_expiring_members(days),
    get_checkin_stats(date),
    get_pending_payments(),
    get_attendance_peaks(),
]
```

**Seguridad:** el agente solo accede a datos del tenant del usuario autenticado. Sin acceso cross-tenant.

### Roadmap IA
- **MVP:** Chatbot admin (lenguaje natural sobre datos del gym)
- **Fase 2:** IA predictiva de churn (identificar miembros en riesgo de cancelar)
- **Fase 3 (app móvil):** Agente de nutrición e hipertrofia entrenado con literatura científica

---

## 6. PAGOS

### Flujo 1 — Miembro paga al gym (app móvil, fase Avanzado)
```
Miembro selecciona plan → Wompi checkout
→ Webhook confirma pago → membership se activa
→ Notificación al miembro (email + in-app)
→ Registro visible en dashboard del gym
```

### Flujo 2 — Gym paga suscripción SaaS
```
Owner registra gym → selecciona módulos
→ Wompi suscripción recurrente mensual
→ Pago falla → reintentos automáticos (días 1, 3, 7)
→ Tras 7 días sin pago → acceso limitado (solo lectura)
→ Pago exitoso → acceso completo restaurado automáticamente
→ Notificación por email en cada evento (fallo, reintento, éxito)
```

**Modo solo lectura:** el gym puede ver datos históricos pero no crear/editar miembros, registrar pagos ni check-ins. Suficiente para no perder información durante el período de gracia.

### Pasarela
**Wompi** como pasarela principal para Colombia. MercadoPago como opción adicional en fase posterior.

---

## 7. NOTIFICACIONES

### MVP: Email + In-app
### Fase 2: WhatsApp Business API

**Al miembro del gym:**
- Membresía por vencer (7 días, 3 días, día de vencimiento)
- Pago confirmado / fallido
- Clase cancelada o modificada
- Bienvenida al registrarse

**Al admin/owner:**
- Miembros con pago pendiente (diario)
- Membresías vencidas hoy
- Máquina reportada en mal estado
- Pago de suscripción SaaS fallido
- Resumen diario de ingresos (8pm)

**Stack:**
- AWS SES: emails transaccionales
- Celery + SQS: cola async (no bloquea la API)
- Redis: scheduling de recordatorios recurrentes
- PostgreSQL tabla `notifications`: in-app leídas por el frontend

---

## 8. DISEÑO UI/UX ADMIN

El frontend se construye con `/ui-ux-pro-max` para garantizar calidad de diseño SaaS moderna. Stack visual:

- **Next.js 14** App Router
- **Tailwind CSS** utilidades
- **shadcn/ui** componentes base (accesibles, personalizables)
- **Recharts** gráficos del dashboard
- **Lucide React** iconografía

### Carpeta de diseño
Todo el diseño admin vive en:
```
src/
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── members/
│   │   ├── payments/
│   │   ├── classes/
│   │   ├── machines/
│   │   ├── reports/
│   │   └── settings/
├── components/
│   ├── ui/           (shadcn base)
│   ├── dashboard/    (KPIs, charts, alerts)
│   ├── members/
│   ├── payments/
│   ├── classes/
│   ├── machines/
│   ├── reports/
│   ├── settings/
│   └── chatbot/      (panel IA)
├── lib/
│   ├── api.ts        (cliente FastAPI)
│   ├── auth.ts       (NextAuth)
│   └── utils.ts
```

---

## 9. FASES DE CONSTRUCCIÓN

### Fase 1 — MVP (plataforma web admin) ← COMENZAMOS AQUÍ
- Auth + RBAC
- Dashboard con KPIs y chatbot IA básico
- Módulo Miembros completo
- Módulo Pagos (registro manual + Wompi)
- Módulo Clases (gestión sin inscripción online)
- Módulo Máquinas (inventario + mantenimiento)
- Módulo Reportes (nivel B)
- Configuración (sedes, roles, planes)
- Notificaciones (email + in-app)
- Deploy en AWS

### Fase 2 — App móvil (Plan Avanzado)
- React Native (iOS + Android)
- Explorar gyms, perfil del gym, ocupación en tiempo real
- Membresías y QR de acceso
- Pagos online desde app (Wompi)
- Rutinas básicas
- Feed social
- WhatsApp notifications

### Fase 3 — IA avanzada (Plan Premium IA)
- Agente nutrición/hipertrofia (literatura científica)
- IA predictiva de churn en dashboard admin
- Recomendaciones personalizadas de horarios

---

## 10. CRITERIOS DE ÉXITO MVP

- ✅ 1–3 gyms piloto en Riohacha operando sobre la plataforma
- ✅ Dueño gestiona miembros, pagos y reportes sin fricción
- ✅ Recepcionista registra check-ins y cobra membresías
- ✅ Chatbot responde preguntas operativas en lenguaje natural
- ✅ Notificaciones automáticas funcionando (email + in-app)
- ✅ Suscripción SaaS cobrada automáticamente via Wompi
- ✅ Sistema estable para 1,000–5,000 usuarios en AWS

---

**Versión:** 1.0
**Estado:** Aprobado para planificación de implementación
