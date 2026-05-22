# FitConnect — Plataforma SaaS de gestión para gimnasios

Plataforma full-stack multi-tenant para la gestión integral de gimnasios. Incluye dashboard con KPIs, gestión de miembros, pagos, clases, máquinas, check-ins y un módulo completo de configuración — todo con UI premium, dark mode y animaciones Framer Motion.

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16.2.4 (App Router) + React 19 + TypeScript |
| Estilos | Tailwind CSS v4 + tokens OKLCH + dark mode por clase |
| UI Components | Base UI (`@base-ui/react`) + Shadcn/ui |
| Animaciones | Framer Motion v12 |
| Backend | FastAPI (Python 3.12) + SQLAlchemy |
| Base de datos | PostgreSQL 16 (multi-tenant: master DB + tenant DB) |
| Caché | Redis 7 |
| Auth | NextAuth.js v5 (beta) + JWT |
| Infra local | Docker Compose |
| Infra nube | AWS ECS + RDS + ALB + ECR |

## Arquitectura multi-tenant

Cada gimnasio opera en su propio esquema de base de datos. Hay dos capas:

- **Master DB** — Tenants, owners, facturación, planes
- **Tenant DB** — Miembros, pagos, clases, máquinas, check-ins, configuración del gym

La autenticación emite un JWT con `tenant_id`. El backend resuelve la conexión a la base de datos del tenant en cada request.

## Funcionalidades

### Dashboard
- KPIs en tiempo real: miembros activos, ingresos del mes, check-ins hoy, clases activas
- Filtros de período (hoy / semana / mes) con pills
- Gráficos de barras con tema naranja/oscuro
- Banner de membresías por vencer

### Miembros
- Tabla con avatar por iniciales, badge de estado, filtros por status
- Alta, edición y baja desde modal
- Página de detalle con tabs: Info / Membresías / Pagos / Check-ins

### Pagos
- Registro de cobros con método de pago y estado (pagado / pendiente / vencido)
- Barra de totales: cobrado / por cobrar / total de registros
- Punto de color semántico por estado

### Check-ins y Clases
- Registro de entrada/salida con timestamp humanizado (hace 5 min, ayer...)
- Gestión de clases con capacidad, horario e inscripción de miembros

### Máquinas
- Inventario con estado (activa / mantenimiento / retirada)
- Historial de mantenimiento expandible por equipo

### Reportes
- Miembros por estado (gráfico de barras)
- Ingresos por método de pago
- Asistencia del día
- Membresías por vencer en 7 días

### Configuración (módulo completo)
| Sección | Descripción |
|---------|-------------|
| Perfil | Nombre, email, cambio de contraseña |
| Gimnasio | Nombre, teléfono, dirección, logo — solo editable por owner |
| Notificaciones | Toggles con auto-save: membresías, pagos, nuevos miembros |
| Plan | Vista del plan actual (basic / advanced / premium_ai) con features |
| Apariencia | Toggle Light / Dark / System con animación en tiempo real |

## Diseño

- **Identidad visual:** "Athletic Premium" — naranja `oklch(0.70 0.20 47)` como color principal
- **Dark mode** funcional via `next-themes` + CSS custom properties
- **Animaciones:** spring `{ stiffness: 300, damping: 30 }`, stagger de listas, fade-in de páginas
- **Skeletons** en todos los estados de carga
- **EmptyState** consistente en todas las secciones

## Inicio rápido (local)

### Requisitos
- Docker Desktop
- Node.js 20+
- Python 3.12+

### Levantar el stack completo

```bash
# 1. Clonar y configurar variables de entorno
cp .env.example .env

# 2. Levantar base de datos, Redis, backend y frontend
docker compose up
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **Documentación API:** http://localhost:8000/docs

### Desarrollo frontend (sin Docker)

```bash
cd frontend
npm install
npm run dev
```

### Desarrollo backend (sin Docker)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Variables de entorno

Copia `.env.example` a `.env` y completa:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | URL de la base de datos master |
| `SECRET_KEY` | Clave secreta JWT |
| `NEXTAUTH_SECRET` | Clave de NextAuth |
| `NEXTAUTH_URL` | URL del frontend (ej. `http://localhost:3000`) |

## Reglas del proyecto

- **Commits siempre en español** (ver `CLAUDE.md`)
- Frontend usa **Base UI** (`@base-ui/react`), NO Radix — patrón `render` prop, no `asChild`
- Leer `frontend/AGENTS.md` antes de tocar código Next.js (hay breaking changes)
- Framer Motion v12: importar `type Variants` explícitamente

## Despliegue

Ver `DEPLOY.md` para instrucciones de despliegue en AWS (ECS + RDS + ALB + ECR).
