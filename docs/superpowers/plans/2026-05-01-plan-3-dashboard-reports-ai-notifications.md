# SaaS Gym — Plan 3: Dashboard KPIs, Reportes, Chatbot IA, Notificaciones, Configuración

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar los cinco módulos restantes del admin web MVP: Dashboard con KPIs en tiempo real, Reportes exportables, Chatbot IA con LangChain + Claude API, Notificaciones email + in-app, y módulo de Configuración del gym.

**Architecture:** Todos los endpoints filtran por `tenant_id` del JWT. El Dashboard agrega datos en el backend y los expone como KPIs limpios. El Chatbot IA usa LangChain como capa de orquestación con 5 tools que consultan la DB del tenant autenticado — el modelo (Claude) es intercambiable con 1 línea de config. Las notificaciones se envían via Celery workers (cola SQS) para no bloquear la API; el in-app se persiste en PostgreSQL y se lee desde el frontend.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, pytest (asyncio_mode=auto), LangChain, `langchain-anthropic`, Next.js 14 App Router, shadcn/ui, Recharts, TanStack Query, Celery, AWS SES (mocked en tests).

**Prerequisito:** Plan 2 completado — módulos Miembros, Check-ins, Pagos, Clases y Máquinas operativos.

**Verificación previa obligatoria:**
```bash
cat backend/pyproject.toml
# Debe mostrar: asyncio_mode = "auto"
pytest tests/ -v --tb=no -q
# Expected: todos los tests del Plan 2 PASSED
```

**Spec:** `docs/superpowers/specs/2026-04-30-saas-gym-platform-design.md`

---

## Chunk 1: Dashboard KPIs (Backend)

### Task 1: Endpoints de KPIs del dashboard

**Files:**
- Create: `backend/app/schemas/dashboard.py`
- Create: `backend/app/api/v1/dashboard.py`
- Modify: `backend/app/api/v1/router.py`
- Create: `backend/tests/test_dashboard.py`

- [ ] **Step 1: Escribir tests de dashboard (failing primero)**

```python
# backend/tests/test_dashboard.py
import pytest
from httpx import AsyncClient


async def setup_gym_with_data(client: AsyncClient, email: str = "owner@gym.com"):
    """Crea un gym con miembro, check-in y pago para tests de KPIs."""
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123!", "full_name": "Owner",
        "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123!"})
    token = r.json()["access_token"]

    # Crear miembro
    member_r = await client.post("/api/v1/members/", json={
        "full_name": "Juan", "email": "juan@gym.com", "phone": "+57300", "id_number": "111",
    }, headers={"Authorization": f"Bearer {token}"})
    member_id = member_r.json()["id"]

    # Registrar check-in
    await client.post("/api/v1/checkins/", json={
        "member_id": member_id, "type": "entry",
    }, headers={"Authorization": f"Bearer {token}"})

    # Registrar pago
    await client.post("/api/v1/payments/", json={
        "member_id": member_id, "amount": "160000.00",
        "method": "cash", "concept": "Mensualidad",
    }, headers={"Authorization": f"Bearer {token}"})

    return token, member_id


async def test_get_kpis(client: AsyncClient):
    token, _ = await setup_gym_with_data(client)
    response = await client.get("/api/v1/dashboard/kpis", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert "active_members" in data
    assert "revenue_today" in data
    assert "current_occupancy" in data
    assert "pending_payments_count" in data
    assert data["active_members"] == 1
    assert float(data["revenue_today"]) == 160000.00


async def test_get_alerts(client: AsyncClient):
    token, member_id = await setup_gym_with_data(client, "owner_alerts@gym.com")
    # Crear membresía que vence en 3 días
    from datetime import date, timedelta
    start = date.today().isoformat()
    end = (date.today() + timedelta(days=3)).isoformat()
    await client.post(f"/api/v1/members/{member_id}/memberships", json={
        "plan_name": "Mensual", "price": "160000.00",
        "start_date": start, "end_date": end, "duration_days": 30,
    }, headers={"Authorization": f"Bearer {token}"})
    response = await client.get("/api/v1/dashboard/alerts", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    alerts = response.json()
    assert isinstance(alerts, list)
    # Al menos una alerta de membresía por vencer
    types = [a["type"] for a in alerts]
    assert "expiring_membership" in types


async def test_kpi_tenant_isolation(client: AsyncClient):
    token1, _ = await setup_gym_with_data(client, "gym_kpi_1@a.com")
    # Gym 2 sin datos
    await client.post("/api/v1/auth/register", json={
        "email": "gym_kpi_2@b.com", "password": "Pass123!", "full_name": "G2",
        "gym_name": "Gym2", "city": "Riohacha",
    })
    r2 = await client.post("/api/v1/auth/login", json={"email": "gym_kpi_2@b.com", "password": "Pass123!"})
    token2 = r2.json()["access_token"]

    # Tenant 2 ve sus propios KPIs vacíos (no los de Tenant 1)
    kpi2 = await client.get("/api/v1/dashboard/kpis", headers={"Authorization": f"Bearer {token2}"})
    assert kpi2.status_code == 200
    assert kpi2.json()["active_members"] == 0
    assert float(kpi2.json()["revenue_today"]) == 0.0

    # Tenant 1 sigue viendo sus propios datos (no afectado por Tenant 2)
    kpi1 = await client.get("/api/v1/dashboard/kpis", headers={"Authorization": f"Bearer {token1}"})
    assert kpi1.status_code == 200
    assert kpi1.json()["active_members"] == 1
    assert float(kpi1.json()["revenue_today"]) == 160000.0
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd backend
pytest tests/test_dashboard.py -v
# Expected: FAILED (endpoint no existe)
```

- [ ] **Step 3: Crear schemas/dashboard.py**

```python
# backend/app/schemas/dashboard.py
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class KPIResponse(BaseModel):
    active_members: int
    revenue_today: Decimal
    current_occupancy: int
    pending_payments_count: int
    pending_payments_total: Decimal


class AlertItem(BaseModel):
    type: str          # "expiring_membership" | "machine_maintenance" | "pending_payments"
    message: str
    severity: str      # "warning" | "critical" | "info"
    count: Optional[int] = None
```

- [ ] **Step 4: Crear api/v1/dashboard.py**

```python
# backend/app/api/v1/dashboard.py
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.member import Member, MemberStatus
from app.models.checkin import CheckIn, CheckInType
from app.models.payment import Payment, PaymentStatus
from app.models.membership import Membership, MembershipStatus
from app.models.machine import Machine, MachineStatus
from app.models.user import User
from app.schemas.dashboard import KPIResponse, AlertItem
from app.api.deps import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/kpis", response_model=KPIResponse)
async def get_kpis(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = current_user.tenant_id
    today_start = datetime.combine(date.today(), time(0, 0, 0))

    # Miembros activos
    r1 = await db.execute(
        select(func.count()).where(Member.tenant_id == tid, Member.status == MemberStatus.active)
    )
    active_members = r1.scalar() or 0

    # Ingresos del día (pagos paid de hoy)
    r2 = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == tid,
            Payment.status == PaymentStatus.paid,
            Payment.created_at >= today_start,
        )
    )
    revenue_today = r2.scalar() or Decimal("0.00")

    # Ocupación actual: entradas - salidas del día
    r3 = await db.execute(
        select(func.count()).where(
            CheckIn.tenant_id == tid,
            CheckIn.type == CheckInType.entry,
            CheckIn.created_at >= today_start,
        )
    )
    entries = r3.scalar() or 0

    r4 = await db.execute(
        select(func.count()).where(
            CheckIn.tenant_id == tid,
            CheckIn.type == CheckInType.exit,
            CheckIn.created_at >= today_start,
        )
    )
    exits = r4.scalar() or 0
    occupancy = max(0, entries - exits)

    # Pagos pendientes
    r5 = await db.execute(
        select(func.count(), func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == tid,
            Payment.status == PaymentStatus.pending,
        )
    )
    row = r5.one()
    pending_count = row[0] or 0
    pending_total = row[1] or Decimal("0.00")

    return KPIResponse(
        active_members=active_members,
        revenue_today=revenue_today,
        current_occupancy=occupancy,
        pending_payments_count=pending_count,
        pending_payments_total=pending_total,
    )


@router.get("/alerts", response_model=list[AlertItem])
async def get_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = current_user.tenant_id
    alerts: list[AlertItem] = []
    today = date.today()
    warning_horizon = today + timedelta(days=7)

    # Membresías por vencer en 7 días
    r1 = await db.execute(
        select(func.count()).where(
            Membership.tenant_id == tid,
            Membership.status == MembershipStatus.active,
            Membership.end_date <= warning_horizon,
            Membership.end_date >= today,
        )
    )
    expiring = r1.scalar() or 0
    if expiring > 0:
        alerts.append(AlertItem(
            type="expiring_membership",
            message=f"{expiring} membresía(s) vencen en los próximos 7 días",
            severity="warning",
            count=expiring,
        ))

    # Máquinas en mantenimiento
    r2 = await db.execute(
        select(func.count()).where(
            Machine.tenant_id == tid,
            Machine.status == MachineStatus.maintenance,
        )
    )
    in_maintenance = r2.scalar() or 0
    if in_maintenance > 0:
        alerts.append(AlertItem(
            type="machine_maintenance",
            message=f"{in_maintenance} máquina(s) en mantenimiento",
            severity="info",
            count=in_maintenance,
        ))

    # Pagos pendientes
    r3 = await db.execute(
        select(func.count()).where(
            Payment.tenant_id == tid,
            Payment.status == PaymentStatus.pending,
        )
    )
    pending = r3.scalar() or 0
    if pending > 0:
        alerts.append(AlertItem(
            type="pending_payments",
            message=f"{pending} pago(s) pendiente(s) por cobrar",
            severity="warning",
            count=pending,
        ))

    return alerts
```

- [ ] **Step 5: Registrar router**

```python
# backend/app/api/v1/router.py — agregar:
from app.api.v1 import auth, users, members, checkins, payments, classes, machines, dashboard
router.include_router(dashboard.router)
```

- [ ] **Step 6: Correr tests — deben pasar**

```bash
pytest tests/test_dashboard.py -v
# Expected: 3 tests PASSED
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/dashboard.py backend/app/api/v1/dashboard.py \
        backend/app/api/v1/router.py backend/tests/test_dashboard.py
git commit -m "feat: add dashboard KPI and alerts endpoints"
```

---

## Chunk 2: Reportes (Backend)

### Task 2: Endpoints de reportes

**Files:**
- Create: `backend/app/schemas/report.py`
- Create: `backend/app/api/v1/reports.py`
- Modify: `backend/app/api/v1/router.py`
- Create: `backend/tests/test_reports.py`

- [ ] **Step 1: Escribir tests de reportes (failing primero)**

```python
# backend/tests/test_reports.py
import pytest
from httpx import AsyncClient
from datetime import date


async def setup_gym_with_payments(client: AsyncClient, email: str = "owner@gym.com"):
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123!", "full_name": "Owner",
        "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123!"})
    token = r.json()["access_token"]

    member_r = await client.post("/api/v1/members/", json={
        "full_name": "Juan", "email": "juan@gym.com", "phone": "+57300", "id_number": "111",
    }, headers={"Authorization": f"Bearer {token}"})
    member_id = member_r.json()["id"]

    # Registrar dos pagos
    for amount in ["160000.00", "200000.00"]:
        await client.post("/api/v1/payments/", json={
            "member_id": member_id, "amount": amount,
            "method": "cash", "concept": "Mensualidad",
        }, headers={"Authorization": f"Bearer {token}"})

    # Registrar check-in
    await client.post("/api/v1/checkins/", json={
        "member_id": member_id, "type": "entry",
    }, headers={"Authorization": f"Bearer {token}"})

    return token, member_id


async def test_revenue_report(client: AsyncClient):
    token, _ = await setup_gym_with_payments(client)
    today = date.today().isoformat()
    response = await client.get(
        f"/api/v1/reports/revenue?start={today}&end={today}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "payment_count" in data
    assert float(data["total"]) == 360000.00
    assert data["payment_count"] == 2


async def test_attendance_report(client: AsyncClient):
    token, _ = await setup_gym_with_payments(client, "owner_att@gym.com")
    today = date.today().isoformat()
    response = await client.get(
        f"/api/v1/reports/attendance?start={today}&end={today}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "total_checkins" in data
    assert "daily_breakdown" in data
    assert data["total_checkins"] >= 1


async def test_retention_report(client: AsyncClient):
    token, member_id = await setup_gym_with_payments(client, "owner_ret@gym.com")
    from datetime import timedelta
    start = date.today().isoformat()
    end = (date.today() + timedelta(days=30)).isoformat()
    await client.post(f"/api/v1/members/{member_id}/memberships", json={
        "plan_name": "Mensual", "price": "160000.00",
        "start_date": start, "end_date": end, "duration_days": 30,
    }, headers={"Authorization": f"Bearer {token}"})
    response = await client.get(
        "/api/v1/reports/retention",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "active_memberships" in data
    assert "expired_memberships" in data
    assert data["active_memberships"] >= 1


async def test_reports_tenant_isolation(client: AsyncClient):
    token1, _ = await setup_gym_with_payments(client, "gym_rep_1@a.com")
    # Gym 2 sin datos
    await client.post("/api/v1/auth/register", json={
        "email": "gym_rep_2@b.com", "password": "Pass123!", "full_name": "G2",
        "gym_name": "Gym2", "city": "Riohacha",
    })
    r2 = await client.post("/api/v1/auth/login", json={"email": "gym_rep_2@b.com", "password": "Pass123!"})
    token2 = r2.json()["access_token"]
    today = date.today().isoformat()

    # Tenant 2 ve $0 — no accede a los $360,000 de Tenant 1
    rep2 = await client.get(
        f"/api/v1/reports/revenue?start={today}&end={today}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert rep2.status_code == 200
    assert float(rep2.json()["total"]) == 0.0

    # Tenant 1 sigue viendo sus propios ingresos ($360,000)
    rep1 = await client.get(
        f"/api/v1/reports/revenue?start={today}&end={today}",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert rep1.status_code == 200
    assert float(rep1.json()["total"]) == 360000.0
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
pytest tests/test_reports.py -v
# Expected: FAILED
```

- [ ] **Step 3: Crear schemas/report.py**

```python
# backend/app/schemas/report.py
from decimal import Decimal
from typing import Any
from pydantic import BaseModel


class RevenueReport(BaseModel):
    total: Decimal
    payment_count: int
    daily_breakdown: list[dict[str, Any]]  # [{date, total, count}]


class AttendanceReport(BaseModel):
    total_checkins: int
    daily_breakdown: list[dict[str, Any]]  # [{date, entries, exits}]


class RetentionReport(BaseModel):
    active_memberships: int
    expired_memberships: int
    cancelled_memberships: int
    total_members: int
```

- [ ] **Step 4: Crear api/v1/reports.py**

```python
# backend/app/api/v1/reports.py
from datetime import date, datetime, time
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast
from sqlalchemy.dialects.postgresql import DATE as PG_DATE

from app.db.session import get_db
from app.models.payment import Payment, PaymentStatus
from app.models.checkin import CheckIn, CheckInType
from app.models.membership import Membership, MembershipStatus
from app.models.member import Member
from app.models.user import User
from app.schemas.report import RevenueReport, AttendanceReport, RetentionReport
from app.api.deps import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/revenue", response_model=RevenueReport)
async def revenue_report(
    start: date = Query(...),
    end: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = current_user.tenant_id
    start_dt = datetime.combine(start, time(0, 0, 0))
    end_dt = datetime.combine(end, time(23, 59, 59))

    # Totales
    r = await db.execute(
        select(
            func.coalesce(func.sum(Payment.amount), 0),
            func.count(),
        ).where(
            Payment.tenant_id == tid,
            Payment.status == PaymentStatus.paid,
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        )
    )
    row = r.one()
    total = row[0] or Decimal("0.00")
    count = row[1] or 0

    # Breakdown diario — agrupar por fecha truncada
    daily_r = await db.execute(
        select(
            cast(Payment.created_at, PG_DATE).label("day"),
            func.sum(Payment.amount).label("total"),
            func.count().label("count"),
        ).where(
            Payment.tenant_id == tid,
            Payment.status == PaymentStatus.paid,
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        ).group_by("day").order_by("day")
    )
    daily = [{"date": str(row.day), "total": float(row.total), "count": row.count}
             for row in daily_r.all()]

    return RevenueReport(total=total, payment_count=count, daily_breakdown=daily)


@router.get("/attendance", response_model=AttendanceReport)
async def attendance_report(
    start: date = Query(...),
    end: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = current_user.tenant_id
    start_dt = datetime.combine(start, time(0, 0, 0))
    end_dt = datetime.combine(end, time(23, 59, 59))

    r = await db.execute(
        select(func.count()).where(
            CheckIn.tenant_id == tid,
            CheckIn.created_at >= start_dt,
            CheckIn.created_at <= end_dt,
        )
    )
    total = r.scalar() or 0

    daily_r = await db.execute(
        select(
            cast(CheckIn.created_at, PG_DATE).label("day"),
            func.sum(
                func.cast(CheckIn.type == CheckInType.entry, func.Integer())
            ).label("entries"),
            func.sum(
                func.cast(CheckIn.type == CheckInType.exit, func.Integer())
            ).label("exits"),
        ).where(
            CheckIn.tenant_id == tid,
            CheckIn.created_at >= start_dt,
            CheckIn.created_at <= end_dt,
        ).group_by("day").order_by("day")
    )
    daily = [{"date": str(row.day), "entries": row.entries or 0, "exits": row.exits or 0}
             for row in daily_r.all()]

    return AttendanceReport(total_checkins=total, daily_breakdown=daily)


@router.get("/retention", response_model=RetentionReport)
async def retention_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = current_user.tenant_id

    async def count_by_status(status: MembershipStatus) -> int:
        r = await db.execute(
            select(func.count()).where(
                Membership.tenant_id == tid,
                Membership.status == status,
            )
        )
        return r.scalar() or 0

    active = await count_by_status(MembershipStatus.active)
    expired = await count_by_status(MembershipStatus.expired)
    cancelled = await count_by_status(MembershipStatus.cancelled)

    r_total = await db.execute(
        select(func.count()).where(Member.tenant_id == tid)
    )
    total = r_total.scalar() or 0

    return RetentionReport(
        active_memberships=active,
        expired_memberships=expired,
        cancelled_memberships=cancelled,
        total_members=total,
    )
```

- [ ] **Step 5: Registrar router**

```python
# backend/app/api/v1/router.py — agregar:
from app.api.v1 import auth, users, members, checkins, payments, classes, machines, dashboard, reports
router.include_router(reports.router)
```

- [ ] **Step 6: Correr tests — deben pasar**

```bash
pytest tests/test_reports.py -v
# Expected: 4 tests PASSED
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/report.py backend/app/api/v1/reports.py \
        backend/app/api/v1/router.py backend/tests/test_reports.py
git commit -m "feat: add revenue, attendance and retention report endpoints"
```

---

## Chunk 3: Chatbot IA (Backend)

### Task 3: LangChain Agent con tools del gym

**Files:**
- Create: `backend/app/agents/tools.py`
- Create: `backend/app/agents/gym_agent.py`
- Create: `backend/app/schemas/chatbot.py`
- Create: `backend/app/api/v1/chatbot.py`
- Modify: `backend/app/api/v1/router.py`
- Create: `backend/tests/test_chatbot.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Escribir tests del chatbot (failing primero)**

```python
# backend/tests/test_chatbot.py
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient


async def get_owner_token(client: AsyncClient, email: str = "owner@gym.com") -> str:
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123!", "full_name": "Owner",
        "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123!"})
    return r.json()["access_token"]


async def test_chat_returns_response(client: AsyncClient):
    """El endpoint /chat devuelve una respuesta de texto con el modelo mockeado."""
    token = await get_owner_token(client)

    # Mock del agente para no llamar a la API real de Anthropic
    fake_response = "Esta semana ingresaste $0 COP."
    with patch("app.api.v1.chatbot.run_gym_agent", new_callable=AsyncMock) as mock_agent:
        mock_agent.return_value = fake_response
        response = await client.post("/api/v1/chatbot/chat", json={
            "message": "¿Cuánto ingresé esta semana?",
        }, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert data["reply"] == fake_response


async def test_chat_requires_auth(client: AsyncClient):
    """El endpoint rechaza requests sin token."""
    response = await client.post("/api/v1/chatbot/chat", json={"message": "Hola"})
    assert response.status_code == 401


async def test_chat_tenant_context(client: AsyncClient):
    """El agente recibe el tenant_id correcto del usuario autenticado."""
    token = await get_owner_token(client, "owner_ctx@gym.com")

    captured_tenant = {}

    async def fake_agent(message: str, tenant_id, db):
        captured_tenant["id"] = str(tenant_id)
        return "ok"

    with patch("app.api.v1.chatbot.run_gym_agent", side_effect=fake_agent):
        await client.post("/api/v1/chatbot/chat", json={"message": "test"},
                          headers={"Authorization": f"Bearer {token}"})

    assert "id" in captured_tenant
    assert len(captured_tenant["id"]) == 36  # UUID format
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd backend
pytest tests/test_chatbot.py -v
# Expected: FAILED (ModuleNotFoundError o ImportError — langchain no instalado aún)
```

- [ ] **Step 3: Instalar dependencias IA**

```bash
cd backend
pip install langchain langchain-anthropic
echo "langchain>=0.2.0" >> requirements.txt
echo "langchain-anthropic>=0.1.0" >> requirements.txt
```

- [ ] **Step 4: Crear stub de agents para desbloquear el ImportError del router**

El endpoint `chatbot.py` importará `from app.agents.gym_agent import run_gym_agent`.
Para que el re-run de tests falle por razón correcta (ruta no encontrada, no ImportError), crear el módulo stub ahora:

```bash
mkdir -p backend/app/agents
touch backend/app/agents/__init__.py
```

```python
# backend/app/agents/gym_agent.py  — stub temporal
import uuid
from sqlalchemy.ext.asyncio import AsyncSession


async def run_gym_agent(message: str, tenant_id: uuid.UUID, db: AsyncSession) -> str:
    raise NotImplementedError("Agent not implemented yet")
```

- [ ] **Step 5: Re-correr tests — confirmar que ahora fallan por razón correcta (no ImportError)**

```bash
cd backend
pytest tests/test_chatbot.py -v
# Expected: FAILED — el mock no parchea nada todavía (endpoint no existe → 404 o ModuleNotFoundError del router)
# El ImportError de langchain/agents ya no aparece
```

- [ ] **Step 6: Crear schemas/chatbot.py**

```python
# backend/app/schemas/chatbot.py
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
```

- [ ] **Step 7: Crear agents/tools.py**

```python
# backend/app/agents/tools.py
"""
LangChain tools que consultan datos reales del tenant autenticado.
Cada tool recibe tenant_id y db como contexto de cierre (closure).
"""
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from langchain.tools import tool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func


def make_gym_tools(tenant_id: uuid.UUID, db: AsyncSession):
    """
    Fábrica que crea las tools con el tenant_id y db correctos.
    El agente no tiene acceso a otros tenants — cada tool filtra por tenant_id.
    """
    from app.models.payment import Payment, PaymentStatus
    from app.models.member import Member, MemberStatus
    from app.models.checkin import CheckIn, CheckInType
    from app.models.membership import Membership, MembershipStatus

    @tool
    async def get_revenue(period: str = "week") -> str:
        """
        Calcula los ingresos del gym para un período dado.
        period puede ser: 'today', 'week', 'month'.
        """
        today = date.today()
        if period == "today":
            start = datetime.combine(today, time(0, 0, 0))
        elif period == "week":
            start = datetime.combine(today - timedelta(days=7), time(0, 0, 0))
        else:  # month
            start = datetime.combine(today - timedelta(days=30), time(0, 0, 0))

        end = datetime.combine(today, time(23, 59, 59))
        r = await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0), func.count()).where(
                Payment.tenant_id == tenant_id,
                Payment.status == PaymentStatus.paid,
                Payment.created_at >= start,
                Payment.created_at <= end,
            )
        )
        row = r.one()
        total = row[0] or Decimal("0.00")
        count = row[1] or 0
        return f"En el período '{period}' ingresaste ${total:,.0f} COP en {count} pagos."

    @tool
    async def get_expiring_members(days: int = 7) -> str:
        """
        Lista los miembros cuyas membresías vencen en los próximos N días.
        """
        from app.models.member import Member
        today = date.today()
        horizon = today + timedelta(days=days)
        r = await db.execute(
            select(Member.full_name, Membership.end_date).join(
                Membership, Membership.member_id == Member.id
            ).where(
                Membership.tenant_id == tenant_id,
                Membership.status == MembershipStatus.active,
                Membership.end_date <= horizon,
                Membership.end_date >= today,
            ).order_by(Membership.end_date)
        )
        rows = r.all()
        if not rows:
            return f"No hay membresías que venzan en los próximos {days} días."
        lines = [f"- {row.full_name}: vence el {row.end_date}" for row in rows]
        return f"{len(rows)} membresía(s) por vencer:\n" + "\n".join(lines)

    @tool
    async def get_checkin_stats(target_date: str = "today") -> str:
        """
        Devuelve estadísticas de check-ins para una fecha.
        target_date: 'today' o formato YYYY-MM-DD.
        """
        if target_date == "today":
            d = date.today()
        else:
            d = date.fromisoformat(target_date)

        start = datetime.combine(d, time(0, 0, 0))
        end = datetime.combine(d, time(23, 59, 59))

        r_in = await db.execute(
            select(func.count()).where(
                CheckIn.tenant_id == tenant_id,
                CheckIn.type == CheckInType.entry,
                CheckIn.created_at >= start,
                CheckIn.created_at <= end,
            )
        )
        r_out = await db.execute(
            select(func.count()).where(
                CheckIn.tenant_id == tenant_id,
                CheckIn.type == CheckInType.exit,
                CheckIn.created_at >= start,
                CheckIn.created_at <= end,
            )
        )
        entries = r_in.scalar() or 0
        exits = r_out.scalar() or 0
        return f"El {d}: {entries} entradas, {exits} salidas. Ocupación actual: {max(0, entries - exits)} personas."

    @tool
    async def get_pending_payments() -> str:
        """Devuelve el total y número de pagos pendientes del gym."""
        r = await db.execute(
            select(func.count(), func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.tenant_id == tenant_id,
                Payment.status == PaymentStatus.pending,
            )
        )
        row = r.one()
        count = row[0] or 0
        total = row[1] or Decimal("0.00")
        return f"Tienes {count} pago(s) pendiente(s) por un total de ${total:,.0f} COP."

    @tool
    async def get_active_member_count() -> str:
        """Devuelve el número de miembros activos del gym."""
        r = await db.execute(
            select(func.count()).where(
                Member.tenant_id == tenant_id,
                Member.status == MemberStatus.active,
            )
        )
        count = r.scalar() or 0
        return f"Tienes {count} miembro(s) activo(s)."

    return [get_revenue, get_expiring_members, get_checkin_stats, get_pending_payments, get_active_member_count]
```

- [ ] **Step 8: Reemplazar agents/gym_agent.py stub con implementación real**

```python
# backend/app/agents/gym_agent.py
"""
Agente LangChain para el chatbot administrativo del gym.
El modelo es intercambiable con 1 línea de config.
"""
import os
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_anthropic import ChatAnthropic
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from app.agents.tools import make_gym_tools


SYSTEM_PROMPT = """Eres el asistente administrativo de un gimnasio colombiano.
Tienes acceso a herramientas que consultan los datos reales del gimnasio.
Responde siempre en español, de forma concisa y directa.
Cuando uses una herramienta, presenta el resultado de manera clara para el administrador.
NO inventes datos — usa las herramientas para obtener información real."""


def get_llm():
    """
    Retorna el modelo configurado. Intercambiable con 1 línea:
      ChatAnthropic(...)  — MVP
      ChatOpenAI(...)     — alternativa
    """
    return ChatAnthropic(
        model=os.getenv("AI_MODEL", "claude-sonnet-4-6"),
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        max_tokens=1024,
    )


async def run_gym_agent(message: str, tenant_id: uuid.UUID, db: AsyncSession) -> str:
    """
    Ejecuta el agente con las tools del tenant autenticado.
    Retorna la respuesta como string.
    """
    tools = make_gym_tools(tenant_id, db)
    llm = get_llm()

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder("chat_history", optional=True),
        ("human", "{input}"),
        MessagesPlaceholder("agent_scratchpad"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=False, max_iterations=5)

    result = await executor.ainvoke({"input": message, "chat_history": []})
    return result.get("output", "No pude procesar la consulta.")
```

- [ ] **Step 9: Crear api/v1/chatbot.py**

```python
# backend/app/api/v1/chatbot.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.schemas.chatbot import ChatRequest, ChatResponse
from app.api.deps import get_current_user
from app.agents.gym_agent import run_gym_agent

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reply = await run_gym_agent(
        message=payload.message,
        tenant_id=current_user.tenant_id,
        db=db,
    )
    return ChatResponse(reply=reply)
```

- [ ] **Step 10: Verificar agents/__init__.py existe**

```bash
# Ya fue creado en Step 4. Solo verificar:
cat backend/app/agents/__init__.py
```

- [ ] **Step 11: Registrar router**

```python
# backend/app/api/v1/router.py — agregar:
from app.api.v1 import auth, users, members, checkins, payments, classes, machines, dashboard, reports, chatbot
router.include_router(chatbot.router)
```

- [ ] **Step 12: Correr tests — deben pasar**

```bash
pytest tests/test_chatbot.py -v
# Expected: 3 tests PASSED
# (los tests mockean run_gym_agent — no llaman a la API de Anthropic)
```

- [ ] **Step 13: Commit**

```bash
git add backend/app/agents/ backend/app/schemas/chatbot.py \
        backend/app/api/v1/chatbot.py backend/app/api/v1/router.py \
        backend/requirements.txt backend/tests/test_chatbot.py
git commit -m "feat: add AI chatbot with LangChain agent and 5 gym tools"
```

---

## Chunk 4: Notificaciones (Backend)

### Task 4: Modelo Notification y endpoints in-app

**Files:**
- Create: `backend/app/models/notification.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/notification.py`
- Create: `backend/app/api/v1/notifications.py`
- Modify: `backend/app/api/v1/router.py`
- Create: `backend/tests/test_notifications.py`

- [ ] **Step 1: Escribir tests de notificaciones (failing primero)**

```python
# backend/tests/test_notifications.py
import pytest
from httpx import AsyncClient


async def get_token(client: AsyncClient, email: str = "owner@gym.com") -> str:
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123!", "full_name": "Owner",
        "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123!"})
    return r.json()["access_token"]


async def test_list_notifications_empty(client: AsyncClient):
    token = await get_token(client)
    response = await client.get("/api/v1/notifications/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == []


async def test_create_and_list_notification(client: AsyncClient):
    token = await get_token(client, "owner_notif@gym.com")
    # Crear notificación via endpoint interno (usado por Celery tasks)
    create_r = await client.post("/api/v1/notifications/", json={
        "title": "Membresía por vencer",
        "message": "Juan Pérez vence en 3 días",
        "type": "expiring_membership",
    }, headers={"Authorization": f"Bearer {token}"})
    assert create_r.status_code == 201
    notif_id = create_r.json()["id"]

    list_r = await client.get("/api/v1/notifications/", headers={"Authorization": f"Bearer {token}"})
    assert list_r.status_code == 200
    notifs = list_r.json()
    assert len(notifs) == 1
    assert notifs[0]["id"] == notif_id
    assert notifs[0]["is_read"] is False


async def test_mark_notification_read(client: AsyncClient):
    token = await get_token(client, "owner_read@gym.com")
    create_r = await client.post("/api/v1/notifications/", json={
        "title": "Test", "message": "Test msg", "type": "info",
    }, headers={"Authorization": f"Bearer {token}"})
    notif_id = create_r.json()["id"]

    patch_r = await client.patch(
        f"/api/v1/notifications/{notif_id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_r.status_code == 200
    assert patch_r.json()["is_read"] is True


async def test_notification_tenant_isolation(client: AsyncClient):
    # Tenant 1 crea notificación
    token1 = await get_token(client, "gym_notif_1@a.com")
    await client.post("/api/v1/notifications/", json={
        "title": "Privada", "message": "Solo mia", "type": "info",
    }, headers={"Authorization": f"Bearer {token1}"})

    # Tenant 2 no la ve (lista vacía)
    token2 = await get_token(client, "gym_notif_2@b.com")
    list_r2 = await client.get("/api/v1/notifications/", headers={"Authorization": f"Bearer {token2}"})
    assert list_r2.status_code == 200
    notifs2 = list_r2.json()
    assert len(notifs2) == 0
    assert all(n["title"] != "Privada" for n in notifs2)

    # Tenant 1 sigue viendo su propia notificación
    list_r1 = await client.get("/api/v1/notifications/", headers={"Authorization": f"Bearer {token1}"})
    assert list_r1.status_code == 200
    notifs1 = list_r1.json()
    assert len(notifs1) == 1
    assert notifs1[0]["title"] == "Privada"
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
pytest tests/test_notifications.py -v
# Expected: FAILED
```

- [ ] **Step 3: Crear models/notification.py**

```python
# backend/app/models/notification.py
import uuid
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.base import Base, TimestampMixin


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)  # "expiring_membership" | "pending_payment" | "info" | ...
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    member_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=True)
```

- [ ] **Step 4: Actualizar models/__init__.py**

```python
# backend/app/models/__init__.py — agregar:
from app.models.notification import Notification
# y en __all__: "Notification",
```

- [ ] **Step 5: Generar migración**

```bash
cd backend
docker compose up -d db
alembic revision --autogenerate -m "add notifications"
alembic upgrade head
```

Expected: tabla `notifications` creada.

- [ ] **Step 6: Crear schemas/notification.py**

```python
# backend/app/schemas/notification.py
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str
    member_id: Optional[uuid.UUID] = None


class NotificationResponse(BaseModel):
    id: uuid.UUID
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
```

- [ ] **Step 7: Crear api/v1/notifications.py**

```python
# backend/app/api/v1/notifications.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationCreate, NotificationResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/", response_model=list[NotificationResponse])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.tenant_id == current_user.tenant_id
        ).order_by(Notification.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", status_code=201, response_model=NotificationResponse)
async def create_notification(
    payload: NotificationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Endpoint interno usado por Celery tasks para persistir notificaciones in-app.
    También accesible para tests y futuros webhooks.
    """
    notif = Notification(**payload.model_dump(), tenant_id=current_user.tenant_id)
    db.add(notif)
    await db.commit()
    await db.refresh(notif)
    return notif


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.tenant_id == current_user.tenant_id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    notif.is_read = True
    await db.commit()
    await db.refresh(notif)
    return notif
```

- [ ] **Step 8: Registrar router**

```python
# backend/app/api/v1/router.py — agregar:
from app.api.v1 import auth, users, members, checkins, payments, classes, machines, dashboard, reports, chatbot, notifications
router.include_router(notifications.router)
```

- [ ] **Step 9: Correr tests — deben pasar**

```bash
pytest tests/test_notifications.py -v
# Expected: 4 tests PASSED
```

- [ ] **Step 10: Correr todos los tests acumulados**

```bash
pytest tests/ -v --tb=short
# Expected: todos los tests anteriores también PASSED
```

- [ ] **Step 11: Commit**

```bash
git add backend/app/models/notification.py backend/app/models/__init__.py \
        backend/app/schemas/notification.py backend/app/api/v1/notifications.py \
        backend/app/api/v1/router.py backend/alembic/versions/ \
        backend/tests/test_notifications.py
git commit -m "feat: add notifications model and in-app CRUD endpoints"
```

---

## Chunk 5: Configuración del Gym (Backend)

### Task 5: Endpoints de configuración

**Files:**
- Create: `backend/app/models/member_plan.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/settings.py`
- Create: `backend/app/api/v1/settings.py`
- Modify: `backend/app/api/v1/router.py`
- Create: `backend/tests/test_settings.py`

- [ ] **Step 1: Escribir tests de configuración (failing primero)**

```python
# backend/tests/test_settings.py
import pytest
from httpx import AsyncClient


async def get_owner_token(client: AsyncClient, email: str = "owner@gym.com") -> str:
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123!", "full_name": "Owner",
        "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123!"})
    return r.json()["access_token"]


async def test_get_gym_profile(client: AsyncClient):
    token = await get_owner_token(client)
    response = await client.get("/api/v1/settings/profile", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "FitPlace"
    assert data["city"] == "Riohacha"


async def test_update_gym_profile(client: AsyncClient):
    token = await get_owner_token(client, "owner_upd@gym.com")
    # Nota: get_owner_token registra con gym_name="FitPlace"
    response = await client.patch("/api/v1/settings/profile", json={
        "phone": "+5753001234567",
        "address": "Calle 1 # 2-3",
    }, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["phone"] == "+5753001234567"


async def test_create_member_plan(client: AsyncClient):
    token = await get_owner_token(client, "owner_plan@gym.com")
    response = await client.post("/api/v1/settings/member-plans", json={
        "name": "Plan Mensual",
        "price": "160000.00",
        "duration_days": 30,
        "description": "Acceso completo al gym por 30 días",
    }, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Plan Mensual"
    assert float(data["price"]) == 160000.00


async def test_list_member_plans(client: AsyncClient):
    token = await get_owner_token(client, "owner_list_plan@gym.com")
    await client.post("/api/v1/settings/member-plans", json={
        "name": "Plan Trimestral", "price": "420000.00",
        "duration_days": 90, "description": "3 meses",
    }, headers={"Authorization": f"Bearer {token}"})
    response = await client.get("/api/v1/settings/member-plans", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_settings_profile_tenant_isolation(client: AsyncClient):
    # Gym 1 se registra con nombre "GymUno"
    await client.post("/api/v1/auth/register", json={
        "email": "gym_set_1@a.com", "password": "Pass123!", "full_name": "Owner1",
        "gym_name": "GymUno", "city": "Riohacha",
    })
    r1_login = await client.post("/api/v1/auth/login", json={"email": "gym_set_1@a.com", "password": "Pass123!"})
    token1 = r1_login.json()["access_token"]

    # Gym 2 se registra con nombre "GymDos"
    await client.post("/api/v1/auth/register", json={
        "email": "gym_set_2@b.com", "password": "Pass123!", "full_name": "Owner2",
        "gym_name": "GymDos", "city": "Riohacha",
    })
    r2_login = await client.post("/api/v1/auth/login", json={"email": "gym_set_2@b.com", "password": "Pass123!"})
    token2 = r2_login.json()["access_token"]

    r1 = await client.get("/api/v1/settings/profile", headers={"Authorization": f"Bearer {token1}"})
    r2 = await client.get("/api/v1/settings/profile", headers={"Authorization": f"Bearer {token2}"})

    # Cada tenant ve exactamente su propio perfil (directional)
    assert r1.json()["name"] == "GymUno"
    assert r2.json()["name"] == "GymDos"
    # Los IDs son distintos — cada token ve su propio gym, no el del otro
    assert r1.json()["id"] != r2.json()["id"]
    # Cross-tenant: Tenant 2 NO puede ver el nombre de Tenant 1 y viceversa
    assert r2.json()["name"] != "GymUno"
    assert r1.json()["name"] != "GymDos"


async def test_member_plans_tenant_isolation(client: AsyncClient):
    # Tenant 1 crea un plan
    token1 = await get_owner_token(client, "gym_plan_1@a.com")
    await client.post("/api/v1/settings/member-plans", json={
        "name": "Plan Exclusivo", "price": "200000.00", "duration_days": 30,
    }, headers={"Authorization": f"Bearer {token1}"})

    # Tenant 2 no ve los planes de Tenant 1 (lista vacía)
    token2 = await get_owner_token(client, "gym_plan_2@b.com")
    list_r2 = await client.get("/api/v1/settings/member-plans", headers={"Authorization": f"Bearer {token2}"})
    assert list_r2.status_code == 200
    plans2 = list_r2.json()
    assert len(plans2) == 0
    assert all(p["name"] != "Plan Exclusivo" for p in plans2)

    # Tenant 1 sigue viendo su propio plan
    list_r1 = await client.get("/api/v1/settings/member-plans", headers={"Authorization": f"Bearer {token1}"})
    assert list_r1.status_code == 200
    plans1 = list_r1.json()
    assert len(plans1) == 1
    assert plans1[0]["name"] == "Plan Exclusivo"
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
pytest tests/test_settings.py -v
# Expected: FAILED
```

- [ ] **Step 3: Crear models/member_plan.py**

```python
# backend/app/models/member_plan.py
"""Planes de membresía que el gym ofrece a sus miembros (no confundir con Membership)."""
import uuid
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.base import Base, TimestampMixin


class MemberPlan(Base, TimestampMixin):
    __tablename__ = "member_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
```

- [ ] **Step 4: Actualizar models/__init__.py**

```python
# backend/app/models/__init__.py — agregar:
from app.models.member_plan import MemberPlan
# y en __all__: "MemberPlan",
```

- [ ] **Step 5: Generar migración**

```bash
cd backend
docker compose up -d db
alembic revision --autogenerate -m "add member_plans"
alembic upgrade head
```

Expected: tabla `member_plans` creada.

- [ ] **Step 6: Crear schemas/settings.py**

```python
# backend/app/schemas/settings.py
import uuid
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class GymProfileResponse(BaseModel):
    id: uuid.UUID
    name: str
    city: str
    phone: Optional[str]
    address: Optional[str]
    logo_url: Optional[str]

    class Config:
        from_attributes = True


class GymProfileUpdate(BaseModel):
    phone: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None


class MemberPlanCreate(BaseModel):
    name: str
    price: Decimal
    duration_days: int
    description: Optional[str] = None


class MemberPlanUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[Decimal] = None
    duration_days: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class MemberPlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    price: Decimal
    duration_days: int
    description: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True
```

- [ ] **Step 7: Actualizar models/tenant.py para agregar campos de perfil**

En `backend/app/models/tenant.py`, verificar que `Tenant` tiene los campos `phone`, `address`, `logo_url`. Si no están, agregarlos:

```python
# Agregar a la clase Tenant en backend/app/models/tenant.py:
phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
```

Luego generar migración (siempre correr para que Alembic detecte el estado actual):

```bash
cd backend
docker compose up -d db
alembic revision --autogenerate -m "add tenant profile fields"
alembic upgrade head
# Si no hay cambios detectados, alembic genera una migración vacía — es seguro aplicarla igualmente
```

- [ ] **Step 8: Crear api/v1/settings.py**

```python
# backend/app/api/v1/settings.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.member_plan import MemberPlan
from app.models.user import User, UserRole
from app.schemas.settings import (
    GymProfileResponse, GymProfileUpdate,
    MemberPlanCreate, MemberPlanUpdate, MemberPlanResponse,
)
from app.api.deps import get_current_user, require_role

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/profile", response_model=GymProfileResponse)
async def get_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Gym no encontrado")
    return tenant


@router.patch("/profile", response_model=GymProfileResponse)
async def update_profile(
    payload: GymProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner)),
):
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Gym no encontrado")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(tenant, field, value)
    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.post("/member-plans", status_code=201, response_model=MemberPlanResponse)
async def create_member_plan(
    payload: MemberPlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    plan = MemberPlan(**payload.model_dump(), tenant_id=current_user.tenant_id)
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("/member-plans", response_model=list[MemberPlanResponse])
async def list_member_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MemberPlan).where(
            MemberPlan.tenant_id == current_user.tenant_id,
            MemberPlan.is_active == True,
        ).order_by(MemberPlan.created_at)
    )
    return result.scalars().all()


@router.patch("/member-plans/{plan_id}", response_model=MemberPlanResponse)
async def update_member_plan(
    plan_id: uuid.UUID,
    payload: MemberPlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    result = await db.execute(
        select(MemberPlan).where(
            MemberPlan.id == plan_id,
            MemberPlan.tenant_id == current_user.tenant_id,
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(plan, field, value)
    await db.commit()
    await db.refresh(plan)
    return plan
```

- [ ] **Step 9: Registrar router**

```python
# backend/app/api/v1/router.py — agregar:
from app.api.v1 import auth, users, members, checkins, payments, classes, machines, dashboard, reports, chatbot, notifications, settings
router.include_router(settings.router)
```

- [ ] **Step 10: Correr tests — deben pasar**

```bash
pytest tests/test_settings.py -v
# Expected: 6 tests PASSED
```

- [ ] **Step 11: Correr todos los tests**

```bash
pytest tests/ -v --tb=short
# Expected: todos los tests PASSED
```

- [ ] **Step 12: Commit**

```bash
git add backend/app/models/member_plan.py backend/app/models/__init__.py \
        backend/app/models/tenant.py backend/app/schemas/settings.py \
        backend/app/api/v1/settings.py backend/app/api/v1/router.py \
        backend/alembic/versions/ backend/tests/test_settings.py
git commit -m "feat: add settings module (gym profile, member plans CRUD)"
```

---

## Chunk 6: Dashboard y Reportes (Frontend)

### Task 6: Página del Dashboard con KPIs y alertas

**Files:**
- Create: `frontend/hooks/useDashboard.ts`
- Create: `frontend/components/dashboard/KPICard.tsx`
- Create: `frontend/components/dashboard/AlertBanner.tsx`
- Create: `frontend/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Instalar dependencias frontend**

```bash
cd frontend
npm install recharts date-fns
```

- [ ] **Step 2: Crear hooks/useDashboard.ts**

```typescript
// frontend/hooks/useDashboard.ts
"use client";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export function useKPIs() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: () => apiClient(token).get("/api/v1/dashboard/kpis").then((r) => r.data),
    enabled: !!token,
    refetchInterval: 30000, // refresh cada 30s
  });
}

export function useAlerts() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: () => apiClient(token).get("/api/v1/dashboard/alerts").then((r) => r.data),
    enabled: !!token,
    refetchInterval: 60000,
  });
}
```

- [ ] **Step 3: Crear components/dashboard/KPICard.tsx**

```typescript
// frontend/components/dashboard/KPICard.tsx
import { LucideIcon } from "lucide-react";

type KPICardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: "orange" | "green" | "blue" | "red";
};

const colorMap = {
  orange: "text-orange-400 bg-orange-500/10",
  green: "text-green-400 bg-green-500/10",
  blue: "text-blue-400 bg-blue-500/10",
  red: "text-red-400 bg-red-500/10",
};

export function KPICard({ title, value, subtitle, icon: Icon, color = "orange" }: KPICardProps) {
  const iconClass = colorMap[color];
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-zinc-400 text-sm font-medium">{title}</p>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-zinc-500 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Crear components/dashboard/AlertBanner.tsx**

```typescript
// frontend/components/dashboard/AlertBanner.tsx
import { AlertTriangle, Info, XCircle } from "lucide-react";

type Alert = {
  type: string;
  message: string;
  severity: "warning" | "critical" | "info";
  count?: number;
};

const severityConfig = {
  warning: { icon: AlertTriangle, bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-400" },
  critical: { icon: XCircle, bg: "bg-red-500/10 border-red-500/30", text: "text-red-400" },
  info: { icon: Info, bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-400" },
};

export function AlertBanner({ alerts }: { alerts: Alert[] }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="space-y-2 mb-6">
      {alerts.map((alert, i) => {
        const config = severityConfig[alert.severity] ?? severityConfig.info;
        const Icon = config.icon;
        return (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${config.bg}`}>
            <Icon className={`h-4 w-4 shrink-0 ${config.text}`} />
            <p className={`text-sm ${config.text}`}>{alert.message}</p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Crear app/(dashboard)/dashboard/page.tsx**

```typescript
// frontend/app/(dashboard)/dashboard/page.tsx
"use client";
import { Users, DollarSign, Activity, Clock } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { useKPIs, useAlerts } from "@/hooks/useDashboard";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { data: kpis, isLoading: kpisLoading } = useKPIs();
  const { data: alerts } = useAlerts();

  const formatCOP = (value: string | number) =>
    `$${Number(value).toLocaleString("es-CO")} COP`;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-zinc-400 text-sm mt-1">Resumen operativo del gym</p>
      </div>

      <AlertBanner alerts={alerts ?? []} />

      {kpisLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 bg-zinc-800 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard
            title="Miembros activos"
            value={kpis?.active_members ?? 0}
            icon={Users}
            color="blue"
          />
          <KPICard
            title="Ingresos hoy"
            value={kpis ? formatCOP(kpis.revenue_today) : "$0"}
            icon={DollarSign}
            color="green"
          />
          <KPICard
            title="Ocupación actual"
            value={`${kpis?.current_occupancy ?? 0} personas`}
            icon={Activity}
            color="orange"
          />
          <KPICard
            title="Pagos pendientes"
            value={kpis?.pending_payments_count ?? 0}
            subtitle={kpis ? formatCOP(kpis.pending_payments_total) : ""}
            icon={Clock}
            color="red"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Probar página manualmente**

```
1. Iniciar backend + frontend
2. Login → ir a /dashboard
3. Verificar que los 4 KPIs cargan con valores reales
4. Crear un miembro y un pago → refrescar dashboard → valores actualizados
5. Verificar alertas si hay membresías por vencer o pagos pendientes
```

- [ ] **Step 7: Commit**

```bash
git add frontend/hooks/useDashboard.ts \
        frontend/components/dashboard/KPICard.tsx \
        frontend/components/dashboard/AlertBanner.tsx \
        frontend/app/(dashboard)/dashboard/page.tsx
git commit -m "feat: add dashboard page with real-time KPIs and alert banners"
```

---

### Task 7: Página de Reportes con gráficos

**Files:**
- Create: `frontend/hooks/useReports.ts`
- Create: `frontend/components/reports/RevenueChart.tsx`
- Create: `frontend/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Crear hooks/useReports.ts**

```typescript
// frontend/hooks/useReports.ts
"use client";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export function useRevenueReport(start: string, end: string) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["reports", "revenue", start, end],
    queryFn: () =>
      apiClient(token).get(`/api/v1/reports/revenue?start=${start}&end=${end}`).then((r) => r.data),
    enabled: !!token && !!start && !!end,
  });
}

export function useAttendanceReport(start: string, end: string) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["reports", "attendance", start, end],
    queryFn: () =>
      apiClient(token).get(`/api/v1/reports/attendance?start=${start}&end=${end}`).then((r) => r.data),
    enabled: !!token && !!start && !!end,
  });
}

export function useRetentionReport() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["reports", "retention"],
    queryFn: () => apiClient(token).get("/api/v1/reports/retention").then((r) => r.data),
    enabled: !!token,
  });
}
```

- [ ] **Step 2: Crear components/reports/RevenueChart.tsx**

```typescript
// frontend/components/reports/RevenueChart.tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type DailyRevenue = { date: string; total: number; count: number };

export function RevenueChart({ data }: { data: DailyRevenue[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        Sin datos para el período seleccionado
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickFormatter={(v) => v.slice(5)} // MM-DD
        />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
          labelStyle={{ color: "#a1a1aa" }}
          formatter={(value: number) => [`$${value.toLocaleString("es-CO")} COP`, "Ingresos"]}
        />
        <Bar dataKey="total" fill="#f97316" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Crear app/(dashboard)/reports/page.tsx**

```typescript
// frontend/app/(dashboard)/reports/page.tsx
"use client";
import { useState } from "react";
import { RevenueChart } from "@/components/reports/RevenueChart";
import { useRevenueReport, useAttendanceReport, useRetentionReport } from "@/hooks/useReports";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

type Tab = "revenue" | "attendance" | "retention";

export default function ReportsPage() {
  const defaults = getDefaultDates();
  const [tab, setTab] = useState<Tab>("revenue");
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);

  const { data: revenueData, isLoading: revLoading } = useRevenueReport(start, end);
  const { data: attendanceData, isLoading: attLoading } = useAttendanceReport(start, end);
  const { data: retentionData } = useRetentionReport();

  const tabs: { id: Tab; label: string }[] = [
    { id: "revenue", label: "Ingresos" },
    { id: "attendance", label: "Asistencia" },
    { id: "retention", label: "Retención" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Reportes</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              tab === t.id ? "bg-orange-500 text-white" : "text-zinc-400 hover:text-white bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtro de fechas (para ingresos y asistencia) */}
      {tab !== "retention" && (
        <div className="flex gap-4 mb-6">
          <div className="space-y-1">
            <Label className="text-zinc-400 text-xs">Desde</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-zinc-400 text-xs">Hasta</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white w-40" />
          </div>
        </div>
      )}

      {/* Contenido del tab */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        {tab === "revenue" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Ingresos</h3>
              {revenueData && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-400">
                    ${Number(revenueData.total).toLocaleString("es-CO")} COP
                  </p>
                  <p className="text-zinc-400 text-sm">{revenueData.payment_count} pagos</p>
                </div>
              )}
            </div>
            {revLoading ? (
              <Skeleton className="h-48 bg-zinc-800 rounded-lg" />
            ) : (
              <RevenueChart data={revenueData?.daily_breakdown ?? []} />
            )}
          </div>
        )}

        {tab === "attendance" && (
          <div>
            <h3 className="text-white font-semibold mb-4">Asistencia</h3>
            {attLoading ? (
              <Skeleton className="h-48 bg-zinc-800 rounded-lg" />
            ) : (
              <div>
                <p className="text-3xl font-bold text-white mb-4">
                  {attendanceData?.total_checkins ?? 0}
                  <span className="text-zinc-400 text-base font-normal ml-2">check-ins totales</span>
                </p>
                <div className="space-y-2">
                  {(attendanceData?.daily_breakdown ?? []).map((day: any) => (
                    <div key={day.date} className="flex items-center justify-between py-2 border-b border-zinc-800">
                      <span className="text-zinc-400 text-sm">{day.date}</span>
                      <div className="flex gap-4 text-sm">
                        <span className="text-green-400">{day.entries} entradas</span>
                        <span className="text-red-400">{day.exits} salidas</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "retention" && retentionData && (
          <div>
            <h3 className="text-white font-semibold mb-6">Retención de miembros</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Membresías activas", value: retentionData.active_memberships, color: "text-green-400" },
                { label: "Membresías vencidas", value: retentionData.expired_memberships, color: "text-yellow-400" },
                { label: "Canceladas", value: retentionData.cancelled_memberships, color: "text-red-400" },
                { label: "Total miembros", value: retentionData.total_members, color: "text-white" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-zinc-800 rounded-lg p-4">
                  <p className="text-zinc-400 text-sm mb-1">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Probar página manualmente**

```
1. Ir a /reports → tab Ingresos
2. Verificar que el gráfico de barras muestra datos del período
3. Cambiar fechas → gráfico se actualiza
4. Tab Asistencia → ver breakdown diario de check-ins
5. Tab Retención → ver métricas de membresías
```

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useReports.ts \
        frontend/components/reports/RevenueChart.tsx \
        frontend/app/(dashboard)/reports/page.tsx
git commit -m "feat: add reports page with revenue chart, attendance and retention tabs"
```

---

## Chunk 7: Chatbot y Notificaciones (Frontend)

### Task 8: Panel del Chatbot IA

**Files:**
- Create: `frontend/hooks/useChatbot.ts`
- Create: `frontend/components/chatbot/ChatPanel.tsx`
- Modify: `frontend/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Crear hooks/useChatbot.ts**

```typescript
// frontend/hooks/useChatbot.ts
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function useChatbot() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await apiClient(token).post("/api/v1/chatbot/chat", { message: text });
      const assistantMsg: ChatMessage = { role: "assistant", content: response.data.reply };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error al procesar la consulta. Intenta de nuevo." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return { messages, sendMessage, isLoading };
}
```

- [ ] **Step 2: Crear components/chatbot/ChatPanel.tsx**

```typescript
// frontend/components/chatbot/ChatPanel.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatbot } from "@/hooks/useChatbot";

const SUGGESTED = [
  "¿Cuánto ingresé esta semana?",
  "¿Cuáles miembros vencen esta semana?",
  "¿Cuántos pagos tengo pendientes?",
  "¿Cuántas personas hay en el gym ahora?",
];

export function ChatPanel() {
  const { messages, sendMessage, isLoading } = useChatbot();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim()) return;
    const msg = input;
    setInput("");
    await sendMessage(msg);
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <div className="h-8 w-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
          <Bot className="h-4 w-4 text-orange-400" />
        </div>
        <div>
          <p className="text-white text-sm font-semibold">Asistente del Gym</p>
          <p className="text-zinc-500 text-xs">Pregunta sobre tus datos</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-zinc-500 text-sm text-center">Sugerencias:</p>
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="w-full text-left text-xs text-zinc-400 hover:text-white px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === "user" ? "bg-orange-500/20" : "bg-zinc-700"
            }`}>
              {msg.role === "user"
                ? <User className="h-3 w-3 text-orange-400" />
                : <Bot className="h-3 w-3 text-zinc-300" />}
            </div>
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-orange-500/20 text-orange-100"
                : "bg-zinc-800 text-zinc-100"
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-2">
            <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center">
              <Bot className="h-3 w-3 text-zinc-300" />
            </div>
            <div className="bg-zinc-800 px-3 py-2 rounded-xl">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-1.5 w-1.5 bg-zinc-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 p-3 border-t border-zinc-800">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Pregunta algo sobre el gym..."
          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 text-sm"
          disabled={isLoading}
        />
        <Button onClick={handleSend} disabled={isLoading || !input.trim()}
          size="icon" className="bg-orange-500 hover:bg-orange-600 shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Integrar ChatPanel en el dashboard**

Actualizar `frontend/app/(dashboard)/dashboard/page.tsx` para agregar el chatbot como panel lateral. Reemplazar **todo** el archivo con la versión siguiente:

```typescript
// frontend/app/(dashboard)/dashboard/page.tsx
"use client";
import { Users, DollarSign, Activity, Clock } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { ChatPanel } from "@/components/chatbot/ChatPanel";
import { useKPIs, useAlerts } from "@/hooks/useDashboard";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { data: kpis, isLoading: kpisLoading } = useKPIs();
  const { data: alerts } = useAlerts();

  const formatCOP = (value: string | number) =>
    `$${Number(value).toLocaleString("es-CO")} COP`;

  return (
    <div className="flex gap-6 h-[calc(100vh-5rem)]">
      {/* Panel principal */}
      <div className="flex-1 overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-zinc-400 text-sm mt-1">Resumen operativo del gym</p>
        </div>

        <AlertBanner alerts={alerts ?? []} />

        {kpisLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 bg-zinc-800 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KPICard title="Miembros activos" value={kpis?.active_members ?? 0} icon={Users} color="blue" />
            <KPICard title="Ingresos hoy" value={kpis ? formatCOP(kpis.revenue_today) : "$0"} icon={DollarSign} color="green" />
            <KPICard title="Ocupación actual" value={`${kpis?.current_occupancy ?? 0} personas`} icon={Activity} color="orange" />
            <KPICard
              title="Pagos pendientes"
              value={kpis?.pending_payments_count ?? 0}
              subtitle={kpis ? formatCOP(kpis.pending_payments_total) : ""}
              icon={Clock}
              color="red"
            />
          </div>
        )}
      </div>

      {/* Chatbot lateral */}
      <div className="w-80 shrink-0">
        <ChatPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Probar manualmente**

```
1. Ir a /dashboard
2. Verificar que el ChatPanel aparece a la derecha
3. Escribir "¿Cuántos miembros activos tengo?" → el agente responde con datos reales
4. Usar sugerencias rápidas → responden correctamente
5. Verificar que el typing indicator aparece mientras el agente procesa
```

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useChatbot.ts \
        frontend/components/chatbot/ChatPanel.tsx \
        frontend/app/(dashboard)/dashboard/page.tsx
git commit -m "feat: add AI chatbot panel to dashboard with real gym data queries"
```

---

### Task 9: Campana de notificaciones in-app

**Files:**
- Create: `frontend/hooks/useNotifications.ts`
- Create: `frontend/components/notifications/NotificationBell.tsx`
- Modify: `frontend/components/layout/Header.tsx`

- [ ] **Step 1: Crear hooks/useNotifications.ts**

```typescript
// frontend/hooks/useNotifications.ts
"use client";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export function useNotifications() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiClient(token).get("/api/v1/notifications/").then((r) => r.data),
    enabled: !!token,
    refetchInterval: 30000,
  });
}

export function useMarkRead() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(token).patch(`/api/v1/notifications/${id}/read`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
```

- [ ] **Step 2: Crear components/notifications/NotificationBell.tsx**

```typescript
// frontend/components/notifications/NotificationBell.tsx
"use client";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useNotifications, useMarkRead } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function NotificationBell() {
  const { data: notifications } = useNotifications();
  const markRead = useMarkRead();
  const unread = (notifications ?? []).filter((n: any) => !n.is_read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-zinc-400 hover:text-white">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 bg-zinc-900 border-zinc-800" align="end">
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-white font-semibold text-sm">Notificaciones</p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {(notifications ?? []).length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-6">Sin notificaciones</p>
          ) : (
            (notifications ?? []).map((n: any) => (
              <div key={n.id}
                className={`px-4 py-3 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors ${
                  !n.is_read ? "bg-zinc-800/50" : ""
                }`}
                onClick={() => !n.is_read && markRead.mutate(n.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${n.is_read ? "text-zinc-400" : "text-white"}`}>
                      {n.title}
                    </p>
                    <p className="text-zinc-500 text-xs mt-0.5 truncate">{n.message}</p>
                    <p className="text-zinc-600 text-xs mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="h-2 w-2 bg-orange-500 rounded-full mt-1.5 shrink-0" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Agregar NotificationBell al Header**

En `frontend/components/layout/Header.tsx`, importar y agregar `<NotificationBell />` dentro del header:

```typescript
import { NotificationBell } from "@/components/notifications/NotificationBell";

// Dentro del JSX del Header, antes del avatar/menú de usuario:
<NotificationBell />
```

- [ ] **Step 4: Probar manualmente**

```
1. Crear una notificación via backend: POST /api/v1/notifications/ con token
2. Recargar dashboard → campana muestra badge con número
3. Click en campana → popover con notificación no leída
4. Click en la notificación → se marca como leída, badge desaparece
```

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useNotifications.ts \
        frontend/components/notifications/NotificationBell.tsx \
        frontend/components/layout/Header.tsx
git commit -m "feat: add in-app notification bell with unread badge"
```

---

## Chunk 8: Configuración (Frontend)

### Task 10: Página de Configuración

**Files:**
- Create: `frontend/hooks/useSettings.ts`
- Create: `frontend/components/settings/MemberPlanCard.tsx`
- Create: `frontend/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Crear hooks/useSettings.ts**

```typescript
// frontend/hooks/useSettings.ts
"use client";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export function useGymProfile() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["settings", "profile"],
    queryFn: () => apiClient(token).get("/api/v1/settings/profile").then((r) => r.data),
    enabled: !!token,
  });
}

export function useUpdateProfile() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient(token).patch("/api/v1/settings/profile", data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "profile"] }),
  });
}

export function useMemberPlans() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["settings", "member-plans"],
    queryFn: () => apiClient(token).get("/api/v1/settings/member-plans").then((r) => r.data),
    enabled: !!token,
  });
}

export function useCreateMemberPlan() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient(token).post("/api/v1/settings/member-plans", data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "member-plans"] }),
  });
}
```

- [ ] **Step 2: Crear components/settings/MemberPlanCard.tsx**

```typescript
// frontend/components/settings/MemberPlanCard.tsx
type MemberPlan = {
  id: string;
  name: string;
  price: string | number;
  duration_days: number;
  description?: string;
};

export function MemberPlanCard({ plan }: { plan: MemberPlan }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-white font-semibold mb-1">{plan.name}</h3>
      <p className="text-2xl font-bold text-orange-400">
        ${Number(plan.price).toLocaleString("es-CO")}
        <span className="text-zinc-400 text-sm font-normal"> COP</span>
      </p>
      <p className="text-zinc-400 text-sm mt-1">{plan.duration_days} días</p>
      {plan.description && (
        <p className="text-zinc-500 text-xs mt-2">{plan.description}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Crear app/(dashboard)/settings/page.tsx**

> Importar `MemberPlanCard` para la grilla de planes.

```typescript
// frontend/app/(dashboard)/settings/page.tsx
"use client";
import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { MemberPlanCard } from "@/components/settings/MemberPlanCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useGymProfile, useUpdateProfile, useMemberPlans, useCreateMemberPlan } from "@/hooks/useSettings";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "profile" | "plans";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");
  const [planOpen, setPlanOpen] = useState(false);

  const { data: profile, isLoading: profileLoading } = useGymProfile();
  const updateProfile = useUpdateProfile();
  const { data: plans } = useMemberPlans();
  const createPlan = useCreateMemberPlan();

  const [profileForm, setProfileForm] = useState({ phone: "", address: "" });
  const [planForm, setPlanForm] = useState({ name: "", price: "", duration_days: "30", description: "" });

  // Sincronizar formulario con datos cargados
  if (profile && !profileForm.phone && profile.phone) {
    setProfileForm({ phone: profile.phone ?? "", address: profile.address ?? "" });
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    await updateProfile.mutateAsync(profileForm);
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    await createPlan.mutateAsync({
      ...planForm,
      price: planForm.price,
      duration_days: Number(planForm.duration_days),
    });
    setPlanForm({ name: "", price: "", duration_days: "30", description: "" });
    setPlanOpen(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Configuración</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "profile" as Tab, label: "Perfil del gym" },
          { id: "plans" as Tab, label: "Planes de membresía" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              tab === t.id ? "bg-orange-500 text-white" : "text-zinc-400 hover:text-white bg-zinc-800"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Perfil */}
      {tab === "profile" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-lg">
          {profileLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 bg-zinc-800" />)}
            </div>
          ) : (
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div>
                <Label className="text-zinc-400 text-sm">Nombre del gym</Label>
                <Input value={profile?.name ?? ""} disabled
                  className="bg-zinc-800 border-zinc-700 text-zinc-500 mt-1" />
                <p className="text-zinc-600 text-xs mt-1">El nombre no se puede cambiar aquí.</p>
              </div>
              <div>
                <Label className="text-zinc-400 text-sm">Ciudad</Label>
                <Input value={profile?.city ?? ""} disabled
                  className="bg-zinc-800 border-zinc-700 text-zinc-500 mt-1" />
              </div>
              <div>
                <Label className="text-zinc-400 text-sm">Teléfono</Label>
                <Input value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                  placeholder="+573001234567" />
              </div>
              <div>
                <Label className="text-zinc-400 text-sm">Dirección</Label>
                <Input value={profileForm.address}
                  onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                  placeholder="Calle 1 # 2-3, Riohacha" />
              </div>
              <Button type="submit" disabled={updateProfile.isPending} className="bg-orange-500 hover:bg-orange-600">
                <Save className="h-4 w-4 mr-2" />
                {updateProfile.isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Planes de membresía */}
      {tab === "plans" && (
        <div>
          <div className="flex justify-end mb-4">
            <Dialog open={planOpen} onOpenChange={setPlanOpen}>
              <DialogTrigger asChild>
                <Button className="bg-orange-500 hover:bg-orange-600">
                  <Plus className="h-4 w-4 mr-2" /> Nuevo plan
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800">
                <DialogHeader><DialogTitle className="text-white">Crear plan de membresía</DialogTitle></DialogHeader>
                <form onSubmit={handleCreatePlan} className="space-y-4 mt-2">
                  {[
                    { id: "name", label: "Nombre del plan", placeholder: "Plan Mensual" },
                    { id: "price", label: "Precio (COP)", placeholder: "160000", type: "number" },
                    { id: "duration_days", label: "Duración (días)", placeholder: "30", type: "number" },
                    { id: "description", label: "Descripción", placeholder: "Acceso completo..." },
                  ].map(({ id, label, placeholder, type = "text" }) => (
                    <div key={id} className="space-y-1">
                      <Label className="text-zinc-300 text-sm">{label}</Label>
                      <Input type={type} value={(planForm as any)[id]} placeholder={placeholder}
                        onChange={(e) => setPlanForm({ ...planForm, [id]: e.target.value })}
                        className="bg-zinc-800 border-zinc-700 text-white" required={id !== "description"} />
                    </div>
                  ))}
                  <Button type="submit" disabled={createPlan.isPending} className="bg-orange-500 hover:bg-orange-600 w-full">
                    {createPlan.isPending ? "Creando..." : "Crear plan"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(plans ?? []).map((plan: any) => (
              <MemberPlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Probar manualmente**

```
1. Ir a /settings
2. Tab "Perfil del gym" → editar teléfono y dirección → guardar → verificar que persiste
3. Tab "Planes de membresía" → click "Nuevo plan" → llenar formulario → crear
4. Verificar que el plan aparece en tarjetas MemberPlanCard
5. Refresh de página → datos persisten
```

- [ ] **Step 5: Commit final del Plan 3**

```bash
git add frontend/hooks/useSettings.ts \
        frontend/components/settings/MemberPlanCard.tsx \
        frontend/app/(dashboard)/settings/page.tsx
git commit -m "feat: add settings page with gym profile and member plans"
```

---

## Resumen del Plan 3

Al completar este plan tendrás el MVP web admin completo:

- ✅ **Dashboard:** 4 KPIs en tiempo real (miembros, ingresos, ocupación, pendientes) + alertas automáticas
- ✅ **Reportes:** ingresos con gráfico de barras, asistencia diaria, retención de membresías
- ✅ **Chatbot IA:** panel lateral con LangChain + Claude API, 5 tools sobre datos reales del tenant
- ✅ **Notificaciones:** campana in-app con badge de no leídos, marcar como leída
- ✅ **Configuración:** perfil del gym (teléfono, dirección), planes de membresía CRUD
- ✅ **20+ tests adicionales** cubriendo KPIs, reportes, chatbot (mockeado), notificaciones y settings
- ✅ **Todos los módulos del MVP** operativos en un solo stack AWS-ready

**Siguiente:** Deploy en AWS (ECS Fargate + RDS + ElastiCache + Amplify)

---

**Versión:** 1.0
**Estado:** Listo para ejecución
