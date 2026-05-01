# SaaS Gym — Plan 2: Módulos Core (Miembros, Pagos, Clases, Máquinas, Check-ins)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar los cinco módulos operativos del admin web: Miembros, Check-ins, Pagos, Clases y Máquinas — con backend FastAPI completo, tests, y páginas Next.js funcionales conectadas a la API real.

**Architecture:** Cada módulo sigue el mismo patrón: modelo SQLAlchemy → schema Pydantic → tests (red) → endpoint FastAPI (green) → página Next.js. El aislamiento multi-tenant se aplica automáticamente via `current_user.tenant_id` en cada query. Los modelos nuevos se agregan a `app/models/__init__.py` y se genera una migración Alembic por módulo.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, pytest (asyncio_mode=auto), Next.js 14 App Router, shadcn/ui, TanStack Query, Zod.

**Prerequisito:** Plan 1 completado — backend corriendo, auth funcionando, modelos Tenant/User/Location en DB.

**Verificación previa obligatoria:** Confirmar que `backend/pyproject.toml` existe con `asyncio_mode = "auto"` antes de correr cualquier test:
```bash
cat backend/pyproject.toml
# Debe mostrar: asyncio_mode = "auto"
```

**Spec:** `docs/superpowers/specs/2026-04-30-saas-gym-platform-design.md`

---

## Chunk 1: Módulo Miembros (Backend)

### Task 1: Modelo Member y Membership

**Files:**
- Create: `backend/app/models/member.py`
- Create: `backend/app/models/membership.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/models/tenant.py` (agregar relationship members)
- Create: `backend/tests/test_members.py`

- [ ] **Step 1: Escribir tests de miembros (failing primero)**

```python
# backend/tests/test_members.py
import pytest
from httpx import AsyncClient


async def get_owner_token(client: AsyncClient) -> str:
    await client.post("/api/v1/auth/register", json={
        "email": "owner@gym.com", "password": "Pass123!",
        "full_name": "Owner", "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={
        "email": "owner@gym.com", "password": "Pass123!",
    })
    return r.json()["access_token"]


async def test_create_member(client: AsyncClient):
    token = await get_owner_token(client)
    response = await client.post("/api/v1/members/", json={
        "full_name": "Juan Pérez",
        "email": "juan@gmail.com",
        "phone": "+573001234567",
        "id_number": "1234567",
    }, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    data = response.json()
    assert data["full_name"] == "Juan Pérez"
    assert data["status"] == "active"


async def test_list_members_scoped_to_tenant(client: AsyncClient):
    # Tenant 1
    await client.post("/api/v1/auth/register", json={
        "email": "gym1@a.com", "password": "Pass123!", "full_name": "G1", "gym_name": "Gym1", "city": "Riohacha",
    })
    r1 = await client.post("/api/v1/auth/login", json={"email": "gym1@a.com", "password": "Pass123!"})
    t1 = r1.json()["access_token"]
    await client.post("/api/v1/members/", json={
        "full_name": "Juan", "email": "juan@gym.com", "phone": "+57300", "id_number": "111",
    }, headers={"Authorization": f"Bearer {t1}"})

    # Tenant 2
    await client.post("/api/v1/auth/register", json={
        "email": "gym2@b.com", "password": "Pass123!", "full_name": "G2", "gym_name": "Gym2", "city": "Riohacha",
    })
    r2 = await client.post("/api/v1/auth/login", json={"email": "gym2@b.com", "password": "Pass123!"})
    t2 = r2.json()["access_token"]
    await client.post("/api/v1/members/", json={
        "full_name": "Otro", "email": "otro@gym.com", "phone": "+57300", "id_number": "999",
    }, headers={"Authorization": f"Bearer {t2}"})

    # Tenant 1 solo ve su propio miembro
    response = await client.get("/api/v1/members/", headers={"Authorization": f"Bearer {t1}"})
    assert response.status_code == 200
    members = response.json()
    assert len(members) == 1
    assert members[0]["full_name"] == "Juan"


async def test_get_member_by_id(client: AsyncClient):
    token = await get_owner_token(client)
    created = await client.post("/api/v1/members/", json={
        "full_name": "María", "email": "maria@gym.com", "phone": "+57300", "id_number": "222",
    }, headers={"Authorization": f"Bearer {token}"})
    member_id = created.json()["id"]
    response = await client.get(f"/api/v1/members/{member_id}", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "maria@gym.com"


async def test_update_member(client: AsyncClient):
    token = await get_owner_token(client)
    created = await client.post("/api/v1/members/", json={
        "full_name": "Carlos", "email": "carlos@gym.com", "phone": "+57300", "id_number": "333",
    }, headers={"Authorization": f"Bearer {token}"})
    member_id = created.json()["id"]
    response = await client.patch(f"/api/v1/members/{member_id}", json={"phone": "+57999"},
        headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["phone"] == "+57999"


async def test_deactivate_member(client: AsyncClient):
    token = await get_owner_token(client)
    created = await client.post("/api/v1/members/", json={
        "full_name": "Ana", "email": "ana@gym.com", "phone": "+57300", "id_number": "444",
    }, headers={"Authorization": f"Bearer {token}"})
    member_id = created.json()["id"]
    response = await client.delete(f"/api/v1/members/{member_id}",
        headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    get_r = await client.get(f"/api/v1/members/{member_id}",
        headers={"Authorization": f"Bearer {token}"})
    assert get_r.json()["status"] == "inactive"


async def test_cannot_access_other_tenant_member(client: AsyncClient):
    # Owner 1
    await client.post("/api/v1/auth/register", json={
        "email": "gym1@a.com", "password": "Pass123!", "full_name": "G1",
        "gym_name": "Gym1", "city": "Riohacha",
    })
    r1 = await client.post("/api/v1/auth/login", json={"email": "gym1@a.com", "password": "Pass123!"})
    t1 = r1.json()["access_token"]

    created = await client.post("/api/v1/members/", json={
        "full_name": "Privado", "email": "priv@a.com", "phone": "+57300", "id_number": "555",
    }, headers={"Authorization": f"Bearer {t1}"})
    member_id = created.json()["id"]

    # Owner 2
    await client.post("/api/v1/auth/register", json={
        "email": "gym2@b.com", "password": "Pass123!", "full_name": "G2",
        "gym_name": "Gym2", "city": "Riohacha",
    })
    r2 = await client.post("/api/v1/auth/login", json={"email": "gym2@b.com", "password": "Pass123!"})
    t2 = r2.json()["access_token"]

    response = await client.get(f"/api/v1/members/{member_id}", headers={"Authorization": f"Bearer {t2}"})
    assert response.status_code == 404
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd backend
pytest tests/test_members.py -v
# Expected: FAILED (endpoint no existe)
```

- [ ] **Step 3: Crear models/member.py**

```python
# backend/app/models/member.py
import uuid
import enum
from sqlalchemy import String, ForeignKey, Enum as SAEnum, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from app.db.base import Base, TimestampMixin
from typing import Optional
from datetime import date


class MemberStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class Member(Base, TimestampMixin):
    __tablename__ = "members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    id_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[MemberStatus] = mapped_column(SAEnum(MemberStatus), default=MemberStatus.active, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    tenant = relationship("Tenant", back_populates="members")
    memberships = relationship("Membership", back_populates="member")
    checkins = relationship("CheckIn", back_populates="member")
```

- [ ] **Step 4: Crear models/membership.py**

```python
# backend/app/models/membership.py
import uuid
import enum
from datetime import date
from sqlalchemy import String, ForeignKey, Enum as SAEnum, Date, Numeric, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from app.db.base import Base, TimestampMixin
from typing import Optional
from decimal import Decimal


class MembershipStatus(str, enum.Enum):
    active = "active"
    expired = "expired"
    cancelled = "cancelled"


class Membership(Base, TimestampMixin):
    __tablename__ = "memberships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False, index=True)
    plan_name: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[MembershipStatus] = mapped_column(SAEnum(MembershipStatus), default=MembershipStatus.active, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    member = relationship("Member", back_populates="memberships")
    payments = relationship("Payment", back_populates="membership")
```

- [ ] **Step 5: Actualizar models/__init__.py**

```python
# backend/app/models/__init__.py
from app.models.tenant import Tenant, SubscriptionPlan, TenantStatus
from app.models.user import User, UserRole
from app.models.location import Location
from app.models.member import Member, MemberStatus
from app.models.membership import Membership, MembershipStatus

__all__ = [
    "Tenant", "SubscriptionPlan", "TenantStatus",
    "User", "UserRole",
    "Location",
    "Member", "MemberStatus",
    "Membership", "MembershipStatus",
]
```

- [ ] **Step 6: Agregar relationship members a Tenant**

En `backend/app/models/tenant.py`, reemplazar el comentario de la línea `# members y checkins se agregan en Plan 2`:

```python
    users = relationship("User", back_populates="tenant")
    locations = relationship("Location", back_populates="tenant")
    members = relationship("Member", back_populates="tenant")
```

- [ ] **Step 7: Generar migración**

```bash
cd backend
# Prerequisito: docker compose up -d db
alembic revision --autogenerate -m "add members memberships"
alembic upgrade head
```

Expected: tablas `members` y `memberships` creadas.

- [ ] **Step 8: Confirmar que los tests aún fallan (los endpoints no existen todavía)**

```bash
pytest tests/test_members.py -v
# Expected: FAILED — "404 Not Found" o "endpoint no existe"
# Los modelos existen pero los endpoints se crean en Task 2
```

---

### Task 2: Schemas y endpoints de miembros

**Files:**
- Create: `backend/app/schemas/member.py`
- Create: `backend/app/api/v1/members.py`
- Modify: `backend/app/api/v1/router.py`

- [ ] **Step 1: Crear schemas/member.py**

```python
# backend/app/schemas/member.py
import uuid
from datetime import date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models.member import MemberStatus
from app.models.membership import MembershipStatus


class MemberCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    id_number: Optional[str] = None
    birth_date: Optional[date] = None
    notes: Optional[str] = None


class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    id_number: Optional[str] = None
    birth_date: Optional[date] = None
    notes: Optional[str] = None


class MemberResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    phone: Optional[str]
    id_number: Optional[str]
    status: MemberStatus

    class Config:
        from_attributes = True


class MembershipCreate(BaseModel):
    plan_name: str
    price: Decimal
    start_date: date
    end_date: date
    duration_days: int
    notes: Optional[str] = None


class MembershipResponse(BaseModel):
    id: uuid.UUID
    plan_name: str
    price: Decimal
    start_date: date
    end_date: date
    status: MembershipStatus

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Crear api/v1/members.py**

```python
# backend/app/api/v1/members.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.member import Member, MemberStatus
from app.models.membership import Membership
from app.models.user import User, UserRole
from app.schemas.member import MemberCreate, MemberUpdate, MemberResponse, MembershipCreate, MembershipResponse
from app.api.deps import get_current_user, require_role

router = APIRouter(prefix="/members", tags=["members"])


@router.post("/", status_code=201, response_model=MemberResponse)
async def create_member(
    payload: MemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin, UserRole.receptionist)),
):
    member = Member(**payload.model_dump(), tenant_id=current_user.tenant_id)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.get("/", response_model=list[MemberResponse])
async def list_members(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Member).where(Member.tenant_id == current_user.tenant_id)
    )
    return result.scalars().all()


@router.get("/{member_id}", response_model=MemberResponse)
async def get_member(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Member).where(Member.id == member_id, Member.tenant_id == current_user.tenant_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    return member


@router.patch("/{member_id}", response_model=MemberResponse)
async def update_member(
    member_id: uuid.UUID,
    payload: MemberUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin, UserRole.receptionist)),
):
    result = await db.execute(
        select(Member).where(Member.id == member_id, Member.tenant_id == current_user.tenant_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(member, field, value)
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{member_id}")
async def deactivate_member(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    result = await db.execute(
        select(Member).where(Member.id == member_id, Member.tenant_id == current_user.tenant_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    member.status = MemberStatus.inactive
    await db.commit()
    return {"ok": True}


@router.post("/{member_id}/memberships", status_code=201, response_model=MembershipResponse)
async def create_membership(
    member_id: uuid.UUID,
    payload: MembershipCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin, UserRole.receptionist)),
):
    result = await db.execute(
        select(Member).where(Member.id == member_id, Member.tenant_id == current_user.tenant_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    membership = Membership(**payload.model_dump(), member_id=member_id, tenant_id=current_user.tenant_id)
    db.add(membership)
    await db.commit()
    await db.refresh(membership)
    return membership


@router.get("/{member_id}/memberships", response_model=list[MembershipResponse])
async def list_memberships(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Membership).where(
            Membership.member_id == member_id,
            Membership.tenant_id == current_user.tenant_id,
        )
    )
    return result.scalars().all()
```

- [ ] **Step 3: Registrar router**

```python
# backend/app/api/v1/router.py
from app.api.v1 import auth, users, members
router.include_router(members.router)
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
pytest tests/test_members.py -v
# Expected: 6 tests PASSED
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/member.py backend/app/models/membership.py \
        backend/app/models/__init__.py backend/app/schemas/member.py \
        backend/app/api/v1/members.py backend/app/api/v1/router.py \
        backend/alembic/versions/ backend/tests/test_members.py
git commit -m "feat: add members and memberships module with full CRUD"
```

---

## Chunk 2: Módulo Check-ins (Backend)

### Task 3: Modelo CheckIn y endpoint de registro

**Files:**
- Create: `backend/app/models/checkin.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/models/location.py` (agregar relationship checkins)
- Create: `backend/app/schemas/checkin.py`
- Create: `backend/app/api/v1/checkins.py`
- Create: `backend/tests/test_checkins.py`

- [ ] **Step 1: Escribir tests de check-ins (failing primero)**

```python
# backend/tests/test_checkins.py
import pytest
from httpx import AsyncClient


async def setup_gym(client: AsyncClient, email: str = "owner@gym.com"):
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123!",
        "full_name": "Owner", "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123!"})
    token = r.json()["access_token"]

    member_r = await client.post("/api/v1/members/", json={
        "full_name": "Juan", "email": "juan@gym.com", "phone": "+57300", "id_number": "111",
    }, headers={"Authorization": f"Bearer {token}"})
    member_id = member_r.json()["id"]
    return token, member_id


async def test_register_checkin(client: AsyncClient):
    token, member_id = await setup_gym(client)
    response = await client.post("/api/v1/checkins/", json={
        "member_id": member_id,
        "type": "entry",
    }, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    data = response.json()
    assert data["type"] == "entry"
    assert data["member_id"] == member_id


async def test_register_exit(client: AsyncClient):
    token, member_id = await setup_gym(client, "owner2@gym.com")
    await client.post("/api/v1/checkins/", json={"member_id": member_id, "type": "entry"},
        headers={"Authorization": f"Bearer {token}"})
    response = await client.post("/api/v1/checkins/", json={"member_id": member_id, "type": "exit"},
        headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    assert response.json()["type"] == "exit"


async def test_list_checkins_today(client: AsyncClient):
    token, member_id = await setup_gym(client, "owner3@gym.com")
    await client.post("/api/v1/checkins/", json={"member_id": member_id, "type": "entry"},
        headers={"Authorization": f"Bearer {token}"})
    response = await client.get("/api/v1/checkins/today", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_occupancy_count(client: AsyncClient):
    token, member_id = await setup_gym(client, "owner4@gym.com")
    await client.post("/api/v1/checkins/", json={"member_id": member_id, "type": "entry"},
        headers={"Authorization": f"Bearer {token}"})
    response = await client.get("/api/v1/checkins/occupancy", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["current_count"] == 1


async def test_get_checkin_by_id(client: AsyncClient):
    token, member_id = await setup_gym(client, "owner5@gym.com")
    created = await client.post("/api/v1/checkins/", json={"member_id": member_id, "type": "entry"},
        headers={"Authorization": f"Bearer {token}"})
    checkin_id = created.json()["id"]
    response = await client.get(f"/api/v1/checkins/{checkin_id}", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["id"] == checkin_id


async def test_checkin_tenant_isolation(client: AsyncClient):
    # Tenant 1 registra un check-in
    token1, member_id1 = await setup_gym(client, "gym_ci_1@a.com")
    created = await client.post("/api/v1/checkins/", json={"member_id": member_id1, "type": "entry"},
        headers={"Authorization": f"Bearer {token1}"})
    checkin_id = created.json()["id"]

    # Tenant 2 no puede ver ese check-in por ID
    await client.post("/api/v1/auth/register", json={
        "email": "gym_ci_2@b.com", "password": "Pass123!", "full_name": "G2",
        "gym_name": "Gym2", "city": "Riohacha",
    })
    r2 = await client.post("/api/v1/auth/login", json={"email": "gym_ci_2@b.com", "password": "Pass123!"})
    token2 = r2.json()["access_token"]

    response = await client.get(f"/api/v1/checkins/{checkin_id}", headers={"Authorization": f"Bearer {token2}"})
    assert response.status_code == 404
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
pytest tests/test_checkins.py -v
# Expected: FAILED
```

- [ ] **Step 3: Crear models/checkin.py**

```python
# backend/app/models/checkin.py
import uuid
import enum
from sqlalchemy import String, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from typing import Optional
from app.db.base import Base, TimestampMixin


class CheckInType(str, enum.Enum):
    entry = "entry"
    exit = "exit"


class CheckIn(Base, TimestampMixin):
    __tablename__ = "checkins"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False, index=True)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    type: Mapped[CheckInType] = mapped_column(SAEnum(CheckInType), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    member = relationship("Member", back_populates="checkins")
    location = relationship("Location", back_populates="checkins")
```

- [ ] **Step 4: Actualizar models/__init__.py**

```python
# backend/app/models/__init__.py — agregar
from app.models.checkin import CheckIn, CheckInType
# y en __all__:
"CheckIn", "CheckInType",
```

- [ ] **Step 5: Agregar relationship checkins a Location**

En `backend/app/models/location.py`, reemplazar el comentario:

```python
    tenant = relationship("Tenant", back_populates="locations")
    checkins = relationship("CheckIn", back_populates="location")
```

- [ ] **Step 6: Generar migración**

```bash
# Prerequisito: docker compose up -d db
alembic revision --autogenerate -m "add checkins"
alembic upgrade head
```

- [ ] **Step 7: Crear schemas/checkin.py**

```python
# backend/app/schemas/checkin.py
import uuid
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from app.models.checkin import CheckInType


class CheckInCreate(BaseModel):
    member_id: uuid.UUID
    type: CheckInType
    location_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class CheckInResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    type: CheckInType
    created_at: datetime

    class Config:
        from_attributes = True


class OccupancyResponse(BaseModel):
    current_count: int
    total_entries_today: int
```

- [ ] **Step 8: Crear api/v1/checkins.py**

```python
# backend/app/api/v1/checkins.py
import uuid
from datetime import date, datetime, time
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.checkin import CheckIn, CheckInType
from app.models.user import User, UserRole
from app.schemas.checkin import CheckInCreate, CheckInResponse, OccupancyResponse
from app.api.deps import get_current_user, require_role

router = APIRouter(prefix="/checkins", tags=["checkins"])


@router.post("/", status_code=201, response_model=CheckInResponse)
async def register_checkin(
    payload: CheckInCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin, UserRole.receptionist)),
):
    checkin = CheckIn(**payload.model_dump(), tenant_id=current_user.tenant_id)
    db.add(checkin)
    await db.commit()
    await db.refresh(checkin)
    return checkin


@router.get("/today", response_model=list[CheckInResponse])
async def list_checkins_today(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # TimestampMixin usa TIMESTAMP WITHOUT TIME ZONE — comparar con datetime naive
    today_start = datetime.combine(date.today(), time(0, 0, 0))
    result = await db.execute(
        select(CheckIn).where(
            CheckIn.tenant_id == current_user.tenant_id,
            CheckIn.created_at >= today_start,
        ).order_by(CheckIn.created_at.desc())
    )
    return result.scalars().all()


@router.get("/occupancy", response_model=OccupancyResponse)
async def get_occupancy(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today_start = datetime.combine(date.today(), time(0, 0, 0))

    entries_result = await db.execute(
        select(func.count()).where(
            CheckIn.tenant_id == current_user.tenant_id,
            CheckIn.type == CheckInType.entry,
            CheckIn.created_at >= today_start,
        )
    )
    total_entries = entries_result.scalar() or 0

    exits_result = await db.execute(
        select(func.count()).where(
            CheckIn.tenant_id == current_user.tenant_id,
            CheckIn.type == CheckInType.exit,
            CheckIn.created_at >= today_start,
        )
    )
    total_exits = exits_result.scalar() or 0

    return OccupancyResponse(
        current_count=max(0, total_entries - total_exits),
        total_entries_today=total_entries,
    )


@router.get("/{checkin_id}", response_model=CheckInResponse)
async def get_checkin(
    checkin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi import HTTPException
    result = await db.execute(
        select(CheckIn).where(CheckIn.id == checkin_id, CheckIn.tenant_id == current_user.tenant_id)
    )
    checkin = result.scalar_one_or_none()
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in no encontrado")
    return checkin
```

- [ ] **Step 9: Registrar router**

```python
# backend/app/api/v1/router.py
from app.api.v1 import auth, users, members, checkins
router.include_router(checkins.router)
```

- [ ] **Step 10: Correr tests — deben pasar**

```bash
pytest tests/test_checkins.py -v
# Expected: 6 tests PASSED
```

- [ ] **Step 11: Commit**

```bash
git add backend/app/models/checkin.py backend/app/models/__init__.py \
        backend/app/models/location.py backend/app/schemas/checkin.py \
        backend/app/api/v1/checkins.py backend/app/api/v1/router.py \
        backend/alembic/versions/ backend/tests/test_checkins.py
git commit -m "feat: add check-ins module with occupancy counter"
```

---

## Chunk 3: Módulo Pagos (Backend)

### Task 4: Modelo Payment y endpoints

**Files:**
- Create: `backend/app/models/payment.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/payment.py`
- Create: `backend/app/api/v1/payments.py`
- Create: `backend/tests/test_payments.py`

- [ ] **Step 1: Escribir tests de pagos (failing primero)**

```python
# backend/tests/test_payments.py
import pytest
from httpx import AsyncClient


async def setup(client: AsyncClient, email: str = "owner@gym.com"):
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123!", "full_name": "Owner",
        "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123!"})
    token = r.json()["access_token"]
    member_r = await client.post("/api/v1/members/", json={
        "full_name": "Juan", "email": "juan@gym.com", "phone": "+57300", "id_number": "111",
    }, headers={"Authorization": f"Bearer {token}"})
    return token, member_r.json()["id"]


async def test_register_manual_payment(client: AsyncClient):
    token, member_id = await setup(client)
    response = await client.post("/api/v1/payments/", json={
        "member_id": member_id,
        "amount": "160000.00",
        "method": "cash",
        "concept": "Mensualidad mayo 2026",
    }, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "paid"
    assert data["method"] == "cash"


async def test_register_pending_payment_no_method(client: AsyncClient):
    token, member_id = await setup(client, "owner_p2@gym.com")
    response = await client.post("/api/v1/payments/", json={
        "member_id": member_id,
        "amount": "160000.00",
        "concept": "Mensualidad pendiente",
    }, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "pending"
    assert data["method"] is None


async def test_list_payments_for_tenant(client: AsyncClient):
    token, member_id = await setup(client, "owner2@gym.com")
    await client.post("/api/v1/payments/", json={
        "member_id": member_id, "amount": "160000.00",
        "method": "transfer", "concept": "Mensualidad",
    }, headers={"Authorization": f"Bearer {token}"})
    response = await client.get("/api/v1/payments/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_list_payments_for_member(client: AsyncClient):
    token, member_id = await setup(client, "owner3@gym.com")
    await client.post("/api/v1/payments/", json={
        "member_id": member_id, "amount": "160000.00",
        "method": "cash", "concept": "Mensualidad",
    }, headers={"Authorization": f"Bearer {token}"})
    response = await client.get(f"/api/v1/payments/?member_id={member_id}",
        headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_pending_payments_summary(client: AsyncClient):
    token, member_id = await setup(client, "owner4@gym.com")
    await client.post("/api/v1/payments/", json={
        "member_id": member_id, "amount": "160000.00",
        "concept": "Mensualidad pendiente",  # sin method → status=pending
    }, headers={"Authorization": f"Bearer {token}"})
    response = await client.get("/api/v1/payments/pending", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) >= 1


async def test_mark_payment_paid_sets_method(client: AsyncClient):
    token, member_id = await setup(client, "owner5@gym.com")
    r = await client.post("/api/v1/payments/", json={
        "member_id": member_id, "amount": "160000.00", "concept": "Mensualidad",
    }, headers={"Authorization": f"Bearer {token}"})
    payment_id = r.json()["id"]
    response = await client.patch(f"/api/v1/payments/{payment_id}/mark-paid",
        json={"method": "transfer"}, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "paid"
    assert data["method"] == "transfer"


async def test_cannot_access_other_tenant_payment(client: AsyncClient):
    # Tenant 1 registra un pago
    token1, member_id1 = await setup(client, "gym_pay_1@a.com")
    r = await client.post("/api/v1/payments/", json={
        "member_id": member_id1, "amount": "160000.00", "concept": "Mensualidad",
    }, headers={"Authorization": f"Bearer {token1}"})
    payment_id = r.json()["id"]

    # Tenant 2 no puede acceder al pago de Tenant 1
    await client.post("/api/v1/auth/register", json={
        "email": "gym_pay_2@b.com", "password": "Pass123!", "full_name": "G2",
        "gym_name": "Gym2", "city": "Riohacha",
    })
    r2 = await client.post("/api/v1/auth/login", json={"email": "gym_pay_2@b.com", "password": "Pass123!"})
    token2 = r2.json()["access_token"]

    # mark-paid con token de Tenant 2 → 404
    response = await client.patch(f"/api/v1/payments/{payment_id}/mark-paid",
        json={"method": "cash"}, headers={"Authorization": f"Bearer {token2}"})
    assert response.status_code == 404

    # list tampoco muestra pagos de otro tenant
    list_r = await client.get("/api/v1/payments/", headers={"Authorization": f"Bearer {token2}"})
    assert list_r.status_code == 200
    assert len(list_r.json()) == 0
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
pytest tests/test_payments.py -v
# Expected: FAILED
```

- [ ] **Step 3: Crear models/payment.py**

```python
# backend/app/models/payment.py
import uuid
import enum
from decimal import Decimal
from sqlalchemy import String, ForeignKey, Enum as SAEnum, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from typing import Optional
from app.db.base import Base, TimestampMixin


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    transfer = "transfer"
    card = "card"
    wompi = "wompi"


class PaymentStatus(str, enum.Enum):
    paid = "paid"
    pending = "pending"
    failed = "failed"
    refunded = "refunded"


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False, index=True)
    membership_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("memberships.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[Optional[PaymentMethod]] = mapped_column(SAEnum(PaymentMethod), nullable=True)
    status: Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus), default=PaymentStatus.pending, nullable=False)
    concept: Mapped[str] = mapped_column(String(500), nullable=False)
    external_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    membership = relationship("Membership", back_populates="payments")
```

- [ ] **Step 4: Actualizar models/__init__.py**

```python
# backend/app/models/__init__.py — agregar
from app.models.payment import Payment, PaymentMethod, PaymentStatus
# y en __all__:
"Payment", "PaymentMethod", "PaymentStatus",
```

- [ ] **Step 5: Generar migración**

```bash
# Prerequisito: docker compose up -d db
alembic revision --autogenerate -m "add payments"
alembic upgrade head
```

- [ ] **Step 6: Crear schemas/payment.py**

```python
# backend/app/schemas/payment.py
import uuid
from decimal import Decimal
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.payment import PaymentMethod, PaymentStatus


class PaymentCreate(BaseModel):
    member_id: uuid.UUID
    amount: Decimal
    concept: str
    method: Optional[PaymentMethod] = None  # None = pago pendiente sin método definido
    membership_id: Optional[uuid.UUID] = None


class MarkPaidRequest(BaseModel):
    method: PaymentMethod  # el método real al confirmar el pago


class PaymentResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    amount: Decimal
    method: Optional[PaymentMethod]
    status: PaymentStatus
    concept: str
    created_at: datetime

    class Config:
        from_attributes = True
```

- [ ] **Step 7: Crear api/v1/payments.py**

```python
# backend/app/api/v1/payments.py
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.user import User, UserRole
from app.schemas.payment import PaymentCreate, PaymentResponse, MarkPaidRequest
from app.api.deps import get_current_user, require_role

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/", status_code=201, response_model=PaymentResponse)
async def register_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin, UserRole.receptionist)),
):
    # Si no se especifica método, el pago queda en estado pendiente
    status = PaymentStatus.pending if payload.method is None else PaymentStatus.paid
    payment = Payment(
        **payload.model_dump(),
        tenant_id=current_user.tenant_id,
        status=status,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment


@router.get("/", response_model=list[PaymentResponse])
async def list_payments(
    member_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Payment).where(Payment.tenant_id == current_user.tenant_id)
    if member_id:
        query = query.where(Payment.member_id == member_id)
    result = await db.execute(query.order_by(Payment.created_at.desc()))
    return result.scalars().all()


@router.get("/pending", response_model=list[PaymentResponse])
async def list_pending_payments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment).where(
            Payment.tenant_id == current_user.tenant_id,
            Payment.status == PaymentStatus.pending,
        ).order_by(Payment.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/{payment_id}/mark-paid", response_model=PaymentResponse)
async def mark_payment_paid(
    payment_id: uuid.UUID,
    payload: MarkPaidRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin, UserRole.receptionist)),
):
    from fastapi import HTTPException
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id, Payment.tenant_id == current_user.tenant_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    payment.status = PaymentStatus.paid
    payment.method = payload.method  # registra el método real al confirmar
    await db.commit()
    await db.refresh(payment)
    return payment
```

- [ ] **Step 8: Registrar router**

```python
# backend/app/api/v1/router.py
from app.api.v1 import auth, users, members, checkins, payments
router.include_router(payments.router)
```

- [ ] **Step 9: Correr tests — deben pasar**

```bash
pytest tests/test_payments.py -v
# Expected: 7 tests PASSED
```

- [ ] **Step 10: Correr todos los tests acumulados**

```bash
pytest tests/ -v
# Expected: todos los tests anteriores también PASSED
```

- [ ] **Step 11: Commit**

```bash
git add backend/app/models/payment.py backend/app/models/__init__.py \
        backend/app/schemas/payment.py backend/app/api/v1/payments.py \
        backend/app/api/v1/router.py backend/alembic/versions/ \
        backend/tests/test_payments.py
git commit -m "feat: add payments module with manual registration and pending flow"
```

---

## Chunk 4: Módulos Clases y Máquinas (Backend)

### Task 5: Módulo Clases

**Files:**
- Create: `backend/app/models/gym_class.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/gym_class.py`
- Create: `backend/app/api/v1/classes.py`
- Create: `backend/tests/test_classes.py`

- [ ] **Step 1: Escribir tests de clases (failing primero)**

```python
# backend/tests/test_classes.py
import pytest
from httpx import AsyncClient


async def get_token(client: AsyncClient, email: str = "owner@gym.com") -> str:
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123!", "full_name": "Owner",
        "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123!"})
    return r.json()["access_token"]


async def test_create_class(client: AsyncClient):
    token = await get_token(client)
    response = await client.post("/api/v1/classes/", json={
        "name": "Spinning",
        "instructor": "Pedro García",
        "schedule": "Lunes 6:00am",
        "max_capacity": 20,
        "duration_minutes": 60,
    }, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    assert response.json()["name"] == "Spinning"


async def test_list_classes(client: AsyncClient):
    token = await get_token(client, "owner2@gym.com")
    await client.post("/api/v1/classes/", json={
        "name": "Yoga", "instructor": "Ana", "schedule": "Martes 8am",
        "max_capacity": 15, "duration_minutes": 45,
    }, headers={"Authorization": f"Bearer {token}"})
    response = await client.get("/api/v1/classes/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_update_class(client: AsyncClient):
    token = await get_token(client, "owner3@gym.com")
    created = await client.post("/api/v1/classes/", json={
        "name": "Zumba", "instructor": "Maria", "schedule": "Miércoles 7pm",
        "max_capacity": 25, "duration_minutes": 50,
    }, headers={"Authorization": f"Bearer {token}"})
    class_id = created.json()["id"]
    response = await client.patch(f"/api/v1/classes/{class_id}",
        json={"max_capacity": 30}, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["max_capacity"] == 30


async def test_get_class_by_id(client: AsyncClient):
    token = await get_token(client, "owner4@gym.com")
    created = await client.post("/api/v1/classes/", json={
        "name": "CrossFit", "instructor": "Luis", "schedule": "Jueves 7am",
        "max_capacity": 12, "duration_minutes": 45,
    }, headers={"Authorization": f"Bearer {token}"})
    class_id = created.json()["id"]
    response = await client.get(f"/api/v1/classes/{class_id}", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["name"] == "CrossFit"


async def test_classes_tenant_isolation(client: AsyncClient):
    # Tenant 1 crea una clase
    token1 = await get_token(client, "gym_cls_1@a.com")
    created = await client.post("/api/v1/classes/", json={
        "name": "Pilates", "instructor": "Sofia", "schedule": "Viernes 9am",
        "max_capacity": 10, "duration_minutes": 50,
    }, headers={"Authorization": f"Bearer {token1}"})
    class_id = created.json()["id"]

    # Tenant 2 no puede ver esa clase
    token2 = await get_token(client, "gym_cls_2@b.com")
    response = await client.get(f"/api/v1/classes/{class_id}", headers={"Authorization": f"Bearer {token2}"})
    assert response.status_code == 404

    # list de Tenant 2 está vacío
    list_r = await client.get("/api/v1/classes/", headers={"Authorization": f"Bearer {token2}"})
    assert len(list_r.json()) == 0
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
pytest tests/test_classes.py -v
# Expected: FAILED
```

- [ ] **Step 3: Crear models/gym_class.py**

```python
# backend/app/models/gym_class.py
import uuid
from sqlalchemy import String, Integer, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.base import Base, TimestampMixin


class GymClass(Base, TimestampMixin):
    __tablename__ = "gym_classes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    instructor: Mapped[str] = mapped_column(String(255), nullable=False)
    schedule: Mapped[str] = mapped_column(String(255), nullable=False)
    max_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
```

- [ ] **Step 4: Actualizar models/__init__.py**

```python
from app.models.gym_class import GymClass
# en __all__: "GymClass",
```

- [ ] **Step 5: Generar migración**

```bash
# Prerequisito: docker compose up -d db
alembic revision --autogenerate -m "add gym_classes"
alembic upgrade head
```

- [ ] **Step 6: Crear schemas/gym_class.py**

```python
# backend/app/schemas/gym_class.py
import uuid
from typing import Optional
from pydantic import BaseModel


class GymClassCreate(BaseModel):
    name: str
    instructor: str
    schedule: str
    max_capacity: int
    duration_minutes: int
    location_id: Optional[uuid.UUID] = None
    description: Optional[str] = None


class GymClassUpdate(BaseModel):
    name: Optional[str] = None
    instructor: Optional[str] = None
    schedule: Optional[str] = None
    max_capacity: Optional[int] = None
    duration_minutes: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class GymClassResponse(BaseModel):
    id: uuid.UUID
    name: str
    instructor: str
    schedule: str
    max_capacity: int
    duration_minutes: int
    is_active: bool

    class Config:
        from_attributes = True
```

- [ ] **Step 7: Crear api/v1/classes.py**

```python
# backend/app/api/v1/classes.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.gym_class import GymClass
from app.models.user import User, UserRole
from app.schemas.gym_class import GymClassCreate, GymClassUpdate, GymClassResponse
from app.api.deps import get_current_user, require_role

router = APIRouter(prefix="/classes", tags=["classes"])


@router.post("/", status_code=201, response_model=GymClassResponse)
async def create_class(
    payload: GymClassCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    gym_class = GymClass(**payload.model_dump(), tenant_id=current_user.tenant_id)
    db.add(gym_class)
    await db.commit()
    await db.refresh(gym_class)
    return gym_class


@router.get("/", response_model=list[GymClassResponse])
async def list_classes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(GymClass).where(GymClass.tenant_id == current_user.tenant_id, GymClass.is_active == True)
    )
    return result.scalars().all()


@router.get("/{class_id}", response_model=GymClassResponse)
async def get_class(
    class_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(GymClass).where(GymClass.id == class_id, GymClass.tenant_id == current_user.tenant_id)
    )
    gym_class = result.scalar_one_or_none()
    if not gym_class:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    return gym_class


@router.patch("/{class_id}", response_model=GymClassResponse)
async def update_class(
    class_id: uuid.UUID,
    payload: GymClassUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    result = await db.execute(
        select(GymClass).where(GymClass.id == class_id, GymClass.tenant_id == current_user.tenant_id)
    )
    gym_class = result.scalar_one_or_none()
    if not gym_class:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(gym_class, field, value)
    await db.commit()
    await db.refresh(gym_class)
    return gym_class


@router.delete("/{class_id}")
async def deactivate_class(
    class_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    result = await db.execute(
        select(GymClass).where(GymClass.id == class_id, GymClass.tenant_id == current_user.tenant_id)
    )
    gym_class = result.scalar_one_or_none()
    if not gym_class:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    gym_class.is_active = False
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 8: Registrar router**

```python
# backend/app/api/v1/router.py
from app.api.v1 import auth, users, members, checkins, payments, classes
router.include_router(classes.router)
```

- [ ] **Step 9: Correr tests — deben pasar**

```bash
pytest tests/test_classes.py -v
# Expected: 5 tests PASSED
```

- [ ] **Step 10: Commit**

```bash
git add backend/app/models/gym_class.py backend/app/models/__init__.py \
        backend/app/schemas/gym_class.py backend/app/api/v1/classes.py \
        backend/app/api/v1/router.py backend/alembic/versions/ \
        backend/tests/test_classes.py
git commit -m "feat: add classes module (schedule, instructor, capacity)"
```

---

### Task 6: Módulo Máquinas

**Files:**
- Create: `backend/app/models/machine.py`
- Create: `backend/app/models/maintenance.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/machine.py`
- Create: `backend/app/api/v1/machines.py`
- Create: `backend/tests/test_machines.py`

- [ ] **Step 1: Escribir tests de máquinas (failing primero)**

```python
# backend/tests/test_machines.py
import pytest
from httpx import AsyncClient


async def get_token(client: AsyncClient, email: str = "owner@gym.com") -> str:
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123!", "full_name": "Owner",
        "gym_name": "FitPlace", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123!"})
    return r.json()["access_token"]


async def test_create_machine(client: AsyncClient):
    token = await get_token(client)
    response = await client.post("/api/v1/machines/", json={
        "name": "Caminadora 1",
        "brand": "Life Fitness",
        "serial_number": "LF-001",
    }, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    assert response.json()["status"] == "active"


async def test_list_machines(client: AsyncClient):
    token = await get_token(client, "owner2@gym.com")
    await client.post("/api/v1/machines/", json={
        "name": "Bicicleta 1", "brand": "Technogym", "serial_number": "TG-001",
    }, headers={"Authorization": f"Bearer {token}"})
    response = await client.get("/api/v1/machines/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_update_machine_status(client: AsyncClient):
    token = await get_token(client, "owner3@gym.com")
    created = await client.post("/api/v1/machines/", json={
        "name": "Elíptica 1", "brand": "Matrix", "serial_number": "MX-001",
    }, headers={"Authorization": f"Bearer {token}"})
    machine_id = created.json()["id"]
    response = await client.patch(f"/api/v1/machines/{machine_id}",
        json={"status": "maintenance"}, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["status"] == "maintenance"


async def test_add_maintenance_record(client: AsyncClient):
    token = await get_token(client, "owner4@gym.com")
    created = await client.post("/api/v1/machines/", json={
        "name": "Rack 1", "brand": "Hammer", "serial_number": "HM-001",
    }, headers={"Authorization": f"Bearer {token}"})
    machine_id = created.json()["id"]
    response = await client.post(f"/api/v1/machines/{machine_id}/maintenance", json={
        "description": "Cambio de aceite",
        "technician": "Roberto López",
        "cost": "50000.00",
    }, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    assert response.json()["technician"] == "Roberto López"


async def test_list_maintenance_history(client: AsyncClient):
    token = await get_token(client, "owner5@gym.com")
    created = await client.post("/api/v1/machines/", json={
        "name": "Prensa 1", "brand": "Panatta", "serial_number": "PA-001",
    }, headers={"Authorization": f"Bearer {token}"})
    machine_id = created.json()["id"]
    await client.post(f"/api/v1/machines/{machine_id}/maintenance", json={
        "description": "Revisión general", "technician": "Carlos", "cost": "30000.00",
    }, headers={"Authorization": f"Bearer {token}"})
    response = await client.get(f"/api/v1/machines/{machine_id}/maintenance",
        headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_get_machine_by_id(client: AsyncClient):
    token = await get_token(client, "owner6@gym.com")
    created = await client.post("/api/v1/machines/", json={
        "name": "Remo 1", "brand": "Concept2", "serial_number": "C2-001",
    }, headers={"Authorization": f"Bearer {token}"})
    machine_id = created.json()["id"]
    response = await client.get(f"/api/v1/machines/{machine_id}", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["name"] == "Remo 1"


async def test_machines_tenant_isolation(client: AsyncClient):
    # Tenant 1 crea una máquina
    token1 = await get_token(client, "gym_mac_1@a.com")
    created = await client.post("/api/v1/machines/", json={
        "name": "Squat Rack", "brand": "Hammer", "serial_number": "HM-999",
    }, headers={"Authorization": f"Bearer {token1}"})
    machine_id = created.json()["id"]

    # Tenant 2 no puede ver la máquina de Tenant 1
    token2 = await get_token(client, "gym_mac_2@b.com")
    response = await client.get(f"/api/v1/machines/{machine_id}", headers={"Authorization": f"Bearer {token2}"})
    assert response.status_code == 404

    list_r = await client.get("/api/v1/machines/", headers={"Authorization": f"Bearer {token2}"})
    assert len(list_r.json()) == 0
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
pytest tests/test_machines.py -v
# Expected: FAILED
```

- [ ] **Step 3: Crear models/machine.py**

```python
# backend/app/models/machine.py
import uuid
import enum
from sqlalchemy import String, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from typing import Optional
from app.db.base import Base, TimestampMixin


class MachineStatus(str, enum.Enum):
    active = "active"
    maintenance = "maintenance"
    damaged = "damaged"
    retired = "retired"


class Machine(Base, TimestampMixin):
    __tablename__ = "machines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[MachineStatus] = mapped_column(SAEnum(MachineStatus), default=MachineStatus.active, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    maintenance_records = relationship("MaintenanceRecord", back_populates="machine")
```

- [ ] **Step 4: Crear models/maintenance.py**

```python
# backend/app/models/maintenance.py
import uuid
from decimal import Decimal
from datetime import date
from sqlalchemy import String, ForeignKey, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from typing import Optional
from app.db.base import Base, TimestampMixin


class MaintenanceRecord(Base, TimestampMixin):
    __tablename__ = "maintenance_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    machine_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("machines.id"), nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(1000), nullable=False)
    technician: Mapped[str] = mapped_column(String(255), nullable=False)
    cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    resolved_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    machine = relationship("Machine", back_populates="maintenance_records")
```

- [ ] **Step 5: Actualizar models/__init__.py**

```python
from app.models.machine import Machine, MachineStatus
from app.models.maintenance import MaintenanceRecord
# en __all__: "Machine", "MachineStatus", "MaintenanceRecord",
```

- [ ] **Step 6: Generar migración**

```bash
# Prerequisito: docker compose up -d db
alembic revision --autogenerate -m "add machines maintenance_records"
alembic upgrade head
```

- [ ] **Step 7: Crear schemas/machine.py**

```python
# backend/app/schemas/machine.py
import uuid
from decimal import Decimal
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.machine import MachineStatus


class MachineCreate(BaseModel):
    name: str
    brand: Optional[str] = None
    serial_number: Optional[str] = None
    location_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class MachineUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    serial_number: Optional[str] = None
    status: Optional[MachineStatus] = None
    notes: Optional[str] = None


class MachineResponse(BaseModel):
    id: uuid.UUID
    name: str
    brand: Optional[str]
    serial_number: Optional[str]
    status: MachineStatus

    class Config:
        from_attributes = True


class MaintenanceCreate(BaseModel):
    description: str
    technician: str
    cost: Optional[Decimal] = None


class MaintenanceResponse(BaseModel):
    id: uuid.UUID
    description: str
    technician: str
    cost: Optional[Decimal]
    created_at: datetime

    class Config:
        from_attributes = True
```

- [ ] **Step 8: Crear api/v1/machines.py**

```python
# backend/app/api/v1/machines.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.machine import Machine
from app.models.maintenance import MaintenanceRecord
from app.models.user import User, UserRole
from app.schemas.machine import MachineCreate, MachineUpdate, MachineResponse, MaintenanceCreate, MaintenanceResponse
from app.api.deps import get_current_user, require_role

router = APIRouter(prefix="/machines", tags=["machines"])


@router.post("/", status_code=201, response_model=MachineResponse)
async def create_machine(
    payload: MachineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    machine = Machine(**payload.model_dump(), tenant_id=current_user.tenant_id)
    db.add(machine)
    await db.commit()
    await db.refresh(machine)
    return machine


@router.get("/", response_model=list[MachineResponse])
async def list_machines(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Machine).where(Machine.tenant_id == current_user.tenant_id)
    )
    return result.scalars().all()


@router.get("/{machine_id}", response_model=MachineResponse)
async def get_machine(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Machine).where(Machine.id == machine_id, Machine.tenant_id == current_user.tenant_id)
    )
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
    return machine


@router.patch("/{machine_id}", response_model=MachineResponse)
async def update_machine(
    machine_id: uuid.UUID,
    payload: MachineUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    result = await db.execute(
        select(Machine).where(Machine.id == machine_id, Machine.tenant_id == current_user.tenant_id)
    )
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(machine, field, value)
    await db.commit()
    await db.refresh(machine)
    return machine


@router.post("/{machine_id}/maintenance", status_code=201, response_model=MaintenanceResponse)
async def add_maintenance(
    machine_id: uuid.UUID,
    payload: MaintenanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.owner, UserRole.admin)),
):
    result = await db.execute(
        select(Machine).where(Machine.id == machine_id, Machine.tenant_id == current_user.tenant_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
    record = MaintenanceRecord(**payload.model_dump(), machine_id=machine_id, tenant_id=current_user.tenant_id)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/{machine_id}/maintenance", response_model=list[MaintenanceResponse])
async def list_maintenance(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MaintenanceRecord).where(
            MaintenanceRecord.machine_id == machine_id,
            MaintenanceRecord.tenant_id == current_user.tenant_id,
        ).order_by(MaintenanceRecord.created_at.desc())
    )
    return result.scalars().all()
```

- [ ] **Step 9: Registrar router**

```python
# backend/app/api/v1/router.py
from app.api.v1 import auth, users, members, checkins, payments, classes, machines
router.include_router(machines.router)
```

- [ ] **Step 10: Correr todos los tests**

```bash
pytest tests/ -v
# Expected: todos los tests PASSED (incluyendo 7 de test_machines.py)
```

- [ ] **Step 11: Commit**

```bash
git add backend/app/models/machine.py backend/app/models/maintenance.py \
        backend/app/models/__init__.py backend/app/schemas/machine.py \
        backend/app/api/v1/machines.py backend/app/api/v1/router.py \
        backend/alembic/versions/ backend/tests/test_machines.py
git commit -m "feat: add machines module with maintenance history"
```

---

## Chunk 5: Frontend — Páginas de Miembros y Pagos

### Task 7: Página de Miembros

**Files:**
- Create: `frontend/app/(dashboard)/members/page.tsx`
- Create: `frontend/app/(dashboard)/members/[id]/page.tsx`
- Create: `frontend/components/members/MemberTable.tsx`
- Create: `frontend/components/members/MemberForm.tsx`
- Create: `frontend/hooks/useMembers.ts`

- [ ] **Step 0: Instalar dependencias frontend**

```bash
cd frontend
npm install @tanstack/react-query axios zod
```

> Nota: los formularios usan `useState` directamente — `react-hook-form` se agrega en una fase posterior cuando la complejidad de validaciones lo justifique.

- [ ] **Step 1: Crear hooks/useMembers.ts**

```typescript
// frontend/hooks/useMembers.ts
"use client";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export function useMembers() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const client = apiClient(token);

  return useQuery({
    queryKey: ["members"],
    queryFn: () => client.get("/api/v1/members/").then((r) => r.data),
    enabled: !!token,
  });
}

export function useCreateMember() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiClient(token).post("/api/v1/members/", data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useUpdateMember() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      apiClient(token).patch(`/api/v1/members/${id}`, data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
}
```

- [ ] **Step 2: Crear components/members/MemberTable.tsx**

```typescript
// frontend/components/members/MemberTable.tsx
"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

type Member = {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  status: "active" | "inactive";
};

export function MemberTable({ members }: { members: Member[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800">
          <TableHead className="text-zinc-400">Nombre</TableHead>
          <TableHead className="text-zinc-400">Email</TableHead>
          <TableHead className="text-zinc-400">Teléfono</TableHead>
          <TableHead className="text-zinc-400">Estado</TableHead>
          <TableHead className="text-zinc-400">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.id} className="border-zinc-800">
            <TableCell className="text-white font-medium">{m.full_name}</TableCell>
            <TableCell className="text-zinc-400">{m.email}</TableCell>
            <TableCell className="text-zinc-400">{m.phone ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={m.status === "active" ? "default" : "secondary"}
                className={m.status === "active" ? "bg-green-500/20 text-green-400" : "bg-zinc-700 text-zinc-400"}>
                {m.status === "active" ? "Activo" : "Inactivo"}
              </Badge>
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" asChild className="text-zinc-400 hover:text-white">
                <Link href={`/members/${m.id}`}>Ver</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Crear components/members/MemberForm.tsx**

```typescript
// frontend/components/members/MemberForm.tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateMember } from "@/hooks/useMembers";

export function MemberForm({ onSuccess }: { onSuccess?: () => void }) {
  const createMember = useCreateMember();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", id_number: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createMember.mutateAsync(form);
    setForm({ full_name: "", email: "", phone: "", id_number: "" });
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {[
        { id: "full_name", label: "Nombre completo" },
        { id: "email", label: "Email" },
        { id: "phone", label: "Teléfono" },
        { id: "id_number", label: "Cédula" },
      ].map(({ id, label }) => (
        <div key={id} className="space-y-1">
          <Label htmlFor={id} className="text-zinc-300 text-sm">{label}</Label>
          <Input id={id} value={(form as any)[id]}
            onChange={(e) => setForm({ ...form, [id]: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white" />
        </div>
      ))}
      <Button type="submit" disabled={createMember.isPending} className="bg-orange-500 hover:bg-orange-600">
        {createMember.isPending ? "Guardando..." : "Agregar miembro"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Crear app/(dashboard)/members/page.tsx**

```typescript
// frontend/app/(dashboard)/members/page.tsx
"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MemberTable } from "@/components/members/MemberTable";
import { MemberForm } from "@/components/members/MemberForm";
import { useMembers } from "@/hooks/useMembers";
import { Skeleton } from "@/components/ui/skeleton";

export default function MembersPage() {
  const { data: members, isLoading } = useMembers();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Miembros</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4 mr-2" /> Agregar miembro
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-white">Nuevo miembro</DialogTitle>
            </DialogHeader>
            <MemberForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full bg-zinc-800" />)}
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800">
          <MemberTable members={members ?? []} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Crear app/(dashboard)/members/[id]/page.tsx**

```typescript
// frontend/app/(dashboard)/members/[id]/page.tsx
"use client";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function MemberDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  const { data: member, isLoading } = useQuery({
    queryKey: ["member", params.id],
    queryFn: () => apiClient(token).get(`/api/v1/members/${params.id}`).then((r) => r.data),
    enabled: !!token,
  });

  const { data: memberships } = useQuery({
    queryKey: ["memberships", params.id],
    queryFn: () => apiClient(token).get(`/api/v1/members/${params.id}/memberships`).then((r) => r.data),
    enabled: !!token,
  });

  if (isLoading) return <div className="text-zinc-400">Cargando...</div>;

  return (
    <div>
      <Link href="/members" className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 text-sm">
        <ArrowLeft className="h-4 w-4" /> Volver a miembros
      </Link>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{member?.full_name}</h2>
            <p className="text-zinc-400 mt-1">{member?.email}</p>
            <p className="text-zinc-400">{member?.phone}</p>
            <p className="text-zinc-400">Cédula: {member?.id_number}</p>
          </div>
          <Badge className={member?.status === "active" ? "bg-green-500/20 text-green-400" : "bg-zinc-700 text-zinc-400"}>
            {member?.status === "active" ? "Activo" : "Inactivo"}
          </Badge>
        </div>
      </div>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <h3 className="text-white font-semibold mb-4">Membresías</h3>
        {memberships?.length === 0 ? (
          <p className="text-zinc-400 text-sm">Sin membresías registradas.</p>
        ) : (
          <div className="space-y-3">
            {memberships?.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
                <div>
                  <p className="text-white font-medium">{m.plan_name}</p>
                  <p className="text-zinc-400 text-sm">{m.start_date} → {m.end_date}</p>
                </div>
                <Badge className={m.status === "active" ? "bg-green-500/20 text-green-400" : "bg-zinc-700 text-zinc-400"}>
                  {m.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Configurar TanStack Query provider en layout**

```typescript
// frontend/app/(dashboard)/layout.tsx — actualizar para incluir QueryClientProvider
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useState } from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-zinc-950">
          <Sidebar />
          <Header />
          <main className="ml-64 pt-16 p-6">{children}</main>
        </div>
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 7: Probar página manualmente**

```
1. Iniciar backend + frontend (docker compose up o separados)
2. Login → ir a /members
3. Click "Agregar miembro" → llenar formulario → guardar
4. Verificar que aparece en la tabla
5. Click "Ver" → página de detalle del miembro
```

- [ ] **Step 8: Commit**

```bash
git add frontend/app/(dashboard)/members/ frontend/components/members/ \
        frontend/hooks/useMembers.ts frontend/app/(dashboard)/layout.tsx
git commit -m "feat: add members frontend page with list, create, and detail view"
```

---

### Task 8: Página de Pagos

**Files:**
- Create: `frontend/app/(dashboard)/payments/page.tsx`
- Create: `frontend/components/payments/PaymentTable.tsx`
- Create: `frontend/components/payments/PaymentForm.tsx`
- Create: `frontend/hooks/usePayments.ts`

- [ ] **Step 1: Verificar que date-fns está instalado**

```bash
cd frontend
npm install date-fns
```

- [ ] **Step 2: Crear hooks/usePayments.ts**

```typescript
// frontend/hooks/usePayments.ts
"use client";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export function usePayments() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["payments"],
    queryFn: () => apiClient(token).get("/api/v1/payments/").then((r) => r.data),
    enabled: !!token,
  });
}

export function usePendingPayments() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["payments", "pending"],
    queryFn: () => apiClient(token).get("/api/v1/payments/pending").then((r) => r.data),
    enabled: !!token,
  });
}

export function useMarkPaid() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, method }: { paymentId: string; method: string }) =>
      apiClient(token).patch(`/api/v1/payments/${paymentId}/mark-paid`, { method }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payments"] }),
  });
}

export function useCreatePayment() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient(token).post("/api/v1/payments/", data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payments"] }),
  });
}
```

- [ ] **Step 2: Crear components/payments/PaymentForm.tsx**

```typescript
// frontend/components/payments/PaymentForm.tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreatePayment } from "@/hooks/usePayments";
import { useMembers } from "@/hooks/useMembers";

export function PaymentForm({ onSuccess }: { onSuccess?: () => void }) {
  const createPayment = useCreatePayment();
  const { data: members } = useMembers();
  const [form, setForm] = useState({ member_id: "", amount: "", concept: "", method: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createPayment.mutateAsync({
      member_id: form.member_id,
      amount: form.amount,
      concept: form.concept,
      ...(form.method ? { method: form.method } : {}),
    });
    setForm({ member_id: "", amount: "", concept: "", method: "" });
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label className="text-zinc-300 text-sm">Miembro</Label>
        <Select value={form.member_id} onValueChange={(val) => setForm({ ...form, member_id: val })}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-300">
            <SelectValue placeholder="Seleccionar miembro" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {(members ?? []).map((m: any) => (
              <SelectItem key={m.id} value={m.id} className="text-zinc-300">{m.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-zinc-300 text-sm">Concepto</Label>
        <Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })}
          className="bg-zinc-800 border-zinc-700 text-white" placeholder="Mensualidad mayo..." required />
      </div>
      <div className="space-y-1">
        <Label className="text-zinc-300 text-sm">Monto (COP)</Label>
        <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
          className="bg-zinc-800 border-zinc-700 text-white" required />
      </div>
      <div className="space-y-1">
        <Label className="text-zinc-300 text-sm">Método</Label>
        <Select value={form.method} onValueChange={(val) => setForm({ ...form, method: val })}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-300">
            <SelectValue placeholder="Sin método (queda pendiente)" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="" className="text-zinc-400">Sin método (pendiente)</SelectItem>
            <SelectItem value="cash" className="text-zinc-300">Efectivo</SelectItem>
            <SelectItem value="transfer" className="text-zinc-300">Transferencia</SelectItem>
            <SelectItem value="card" className="text-zinc-300">Tarjeta</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={createPayment.isPending} className="bg-orange-500 hover:bg-orange-600 w-full">
        {createPayment.isPending ? "Guardando..." : "Registrar pago"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Crear components/payments/PaymentTable.tsx**

```typescript
// frontend/components/payments/PaymentTable.tsx
"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMarkPaid } from "@/hooks/usePayments";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

type Payment = {
  id: string;
  concept: string;
  amount: string;
  method: string;
  status: "paid" | "pending" | "failed";
  created_at: string;
};

export function PaymentTable({ payments }: { payments: Payment[] }) {
  const markPaid = useMarkPaid();
  const methodLabel: Record<string, string> = {
    cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", wompi: "Wompi", pending: "Pendiente",
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800">
          <TableHead className="text-zinc-400">Concepto</TableHead>
          <TableHead className="text-zinc-400">Monto</TableHead>
          <TableHead className="text-zinc-400">Método</TableHead>
          <TableHead className="text-zinc-400">Estado</TableHead>
          <TableHead className="text-zinc-400">Fecha</TableHead>
          <TableHead className="text-zinc-400">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id} className="border-zinc-800">
            <TableCell className="text-white">{p.concept}</TableCell>
            <TableCell className="text-white font-medium">
              ${Number(p.amount).toLocaleString("es-CO")}
            </TableCell>
            <TableCell className="text-zinc-400">{methodLabel[p.method] ?? p.method}</TableCell>
            <TableCell>
              <Badge className={
                p.status === "paid" ? "bg-green-500/20 text-green-400" :
                p.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                "bg-red-500/20 text-red-400"
              }>
                {p.status === "paid" ? "Pagado" : p.status === "pending" ? "Pendiente" : "Fallido"}
              </Badge>
            </TableCell>
            <TableCell className="text-zinc-400 text-sm">
              {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: es })}
            </TableCell>
            <TableCell>
              {p.status === "pending" && (
                <Button size="sm" variant="outline" className="border-green-600 text-green-400 hover:bg-green-600/20"
                  onClick={() => markPaid.mutate({ paymentId: p.id, method: "cash" })}
                  disabled={markPaid.isPending}>
                  Marcar pagado (efectivo)
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Crear app/(dashboard)/payments/page.tsx**

```typescript
// frontend/app/(dashboard)/payments/page.tsx
"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { PaymentTable } from "@/components/payments/PaymentTable";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { usePayments } from "@/hooks/usePayments";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function PaymentsPage() {
  const { data: payments, isLoading } = usePayments();
  const [filter, setFilter] = useState<"all" | "pending">("all");
  const [open, setOpen] = useState(false);

  const filtered = filter === "pending"
    ? (payments ?? []).filter((p: any) => p.status === "pending")
    : (payments ?? []);

  const pendingCount = (payments ?? []).filter((p: any) => p.status === "pending").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Pagos</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <button onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${filter === "all" ? "bg-orange-500 text-white" : "text-zinc-400 hover:text-white"}`}>
              Todos
            </button>
            <button onClick={() => setFilter("pending")}
              className={`px-3 py-1 rounded-lg text-sm transition-colors flex items-center gap-2 ${filter === "pending" ? "bg-orange-500 text-white" : "text-zinc-400 hover:text-white"}`}>
              Pendientes
              {pendingCount > 0 && (
                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0">{pendingCount}</Badge>
              )}
            </button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-orange-500 hover:bg-orange-600">
                <Plus className="h-4 w-4 mr-2" /> Registrar pago
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800">
              <DialogHeader>
                <DialogTitle className="text-white">Registrar pago</DialogTitle>
              </DialogHeader>
              <PaymentForm onSuccess={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full bg-zinc-800" />)}
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800">
          <PaymentTable payments={filtered} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Probar página manualmente**

```
1. Ir a /payments
2. Verificar tabla de pagos carga
3. Filtrar por pendientes
4. Click "Marcar pagado" en un pago pendiente
5. Verificar que cambia a estado "Pagado" sin recargar la página
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/(dashboard)/payments/ frontend/components/payments/ \
        frontend/hooks/usePayments.ts
git commit -m "feat: add payments frontend page with pending filter and mark-paid action"
```

---

## Chunk 6: Frontend — Páginas de Clases y Máquinas

### Task 9: Página de Clases

**Files:**
- Create: `frontend/app/(dashboard)/classes/page.tsx`
- Create: `frontend/hooks/useClasses.ts`

- [ ] **Step 1: Crear hooks/useClasses.ts**

```typescript
// frontend/hooks/useClasses.ts
"use client";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export function useClasses() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["classes"],
    queryFn: () => apiClient(token).get("/api/v1/classes/").then((r) => r.data),
    enabled: !!token,
  });
}

export function useCreateClass() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient(token).post("/api/v1/classes/", data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classes"] }),
  });
}

export function useDeactivateClass() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(token).delete(`/api/v1/classes/${id}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classes"] }),
  });
}
```

- [ ] **Step 2: Crear app/(dashboard)/classes/page.tsx**

```typescript
// frontend/app/(dashboard)/classes/page.tsx
"use client";
import { useState } from "react";
import { Plus, Clock, Users, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useClasses, useCreateClass, useDeactivateClass } from "@/hooks/useClasses";
import { Skeleton } from "@/components/ui/skeleton";

function ClassForm({ onSuccess }: { onSuccess?: () => void }) {
  const createClass = useCreateClass();
  const [form, setForm] = useState({
    name: "", instructor: "", schedule: "", max_capacity: "20", duration_minutes: "60",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createClass.mutateAsync({ ...form, max_capacity: Number(form.max_capacity), duration_minutes: Number(form.duration_minutes) });
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {[
        { id: "name", label: "Nombre de la clase" },
        { id: "instructor", label: "Instructor" },
        { id: "schedule", label: "Horario (ej: Lunes 6:00am)" },
        { id: "max_capacity", label: "Capacidad máxima", type: "number" },
        { id: "duration_minutes", label: "Duración (minutos)", type: "number" },
      ].map(({ id, label, type = "text" }) => (
        <div key={id} className="space-y-1">
          <Label htmlFor={id} className="text-zinc-300 text-sm">{label}</Label>
          <Input id={id} type={type} value={(form as any)[id]}
            onChange={(e) => setForm({ ...form, [id]: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white" required />
        </div>
      ))}
      <Button type="submit" disabled={createClass.isPending} className="bg-orange-500 hover:bg-orange-600">
        {createClass.isPending ? "Guardando..." : "Crear clase"}
      </Button>
    </form>
  );
}

export default function ClassesPage() {
  const { data: classes, isLoading } = useClasses();
  const deactivate = useDeactivateClass();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Clases</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4 mr-2" /> Nueva clase
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader><DialogTitle className="text-white">Nueva clase</DialogTitle></DialogHeader>
            <ClassForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 bg-zinc-800 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(classes ?? []).map((c: any) => (
            <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-white font-semibold">{c.name}</h3>
                <Button variant="ghost" size="icon" className="text-zinc-600 hover:text-red-400 h-6 w-6"
                  onClick={() => deactivate.mutate(c.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-zinc-400 text-sm mb-3">{c.instructor}</p>
              <div className="flex items-center gap-3 text-zinc-400 text-sm">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{c.duration_minutes} min</span>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.max_capacity} cupos</span>
              </div>
              <Badge className="mt-3 bg-blue-500/20 text-blue-400 text-xs">{c.schedule}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Probar manualmente**

```
1. Ir a /classes
2. Click "Nueva clase" → llenar formulario → guardar
3. Verificar que la clase aparece como tarjeta
4. Click ícono de eliminar → clase desaparece
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/(dashboard)/classes/ frontend/hooks/useClasses.ts
git commit -m "feat: add classes frontend page with card grid view"
```

---

### Task 10: Página de Máquinas

**Files:**
- Create: `frontend/app/(dashboard)/machines/page.tsx`
- Create: `frontend/hooks/useMachines.ts`

- [ ] **Step 1: Crear hooks/useMachines.ts**

```typescript
// frontend/hooks/useMachines.ts
"use client";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export function useMachines() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["machines"],
    queryFn: () => apiClient(token).get("/api/v1/machines/").then((r) => r.data),
    enabled: !!token,
  });
}

export function useCreateMachine() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient(token).post("/api/v1/machines/", data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machines"] }),
  });
}

export function useUpdateMachineStatus() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient(token).patch(`/api/v1/machines/${id}`, { status }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machines"] }),
  });
}

export function useAddMaintenance() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ machineId, data }: { machineId: string; data: Record<string, unknown> }) =>
      apiClient(token).post(`/api/v1/machines/${machineId}/maintenance`, data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machines"] }),
  });
}
```

- [ ] **Step 2: Crear app/(dashboard)/machines/page.tsx**

```typescript
// frontend/app/(dashboard)/machines/page.tsx
"use client";
import { useState } from "react";
import { Plus, Wrench, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMachines, useCreateMachine, useUpdateMachineStatus } from "@/hooks/useMachines";
import { Skeleton } from "@/components/ui/skeleton";

const statusConfig = {
  active: { label: "Activa", color: "bg-green-500/20 text-green-400", icon: CheckCircle },
  maintenance: { label: "Mantenimiento", color: "bg-yellow-500/20 text-yellow-400", icon: Wrench },
  damaged: { label: "Dañada", color: "bg-red-500/20 text-red-400", icon: AlertTriangle },
  retired: { label: "Retirada", color: "bg-zinc-700 text-zinc-400", icon: AlertTriangle },
};

export default function MachinesPage() {
  const { data: machines, isLoading } = useMachines();
  const createMachine = useCreateMachine();
  const updateStatus = useUpdateMachineStatus();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", brand: "", serial_number: "" });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createMachine.mutateAsync(form);
    setForm({ name: "", brand: "", serial_number: "" });
    setOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Máquinas</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4 mr-2" /> Agregar máquina
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader><DialogTitle className="text-white">Nueva máquina</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {[
                { id: "name", label: "Nombre" },
                { id: "brand", label: "Marca" },
                { id: "serial_number", label: "Número de serie" },
              ].map(({ id, label }) => (
                <div key={id} className="space-y-1">
                  <Label htmlFor={id} className="text-zinc-300 text-sm">{label}</Label>
                  <Input id={id} value={(form as any)[id]}
                    onChange={(e) => setForm({ ...form, [id]: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-white" />
                </div>
              ))}
              <Button type="submit" disabled={createMachine.isPending} className="bg-orange-500 hover:bg-orange-600">
                {createMachine.isPending ? "Guardando..." : "Agregar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full bg-zinc-800 rounded-lg" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {(machines ?? []).map((m: any) => {
            const config = statusConfig[m.status as keyof typeof statusConfig] ?? statusConfig.active;
            const Icon = config.icon;
            return (
              <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-zinc-500" />
                  <div>
                    <p className="text-white font-medium">{m.name}</p>
                    <p className="text-zinc-400 text-sm">{m.brand} · {m.serial_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={config.color}>{config.label}</Badge>
                  <Select value={m.status} onValueChange={(val) => updateStatus.mutate({ id: m.id, status: val })}>
                    <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-zinc-300 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {Object.entries(statusConfig).map(([val, { label }]) => (
                        <SelectItem key={val} value={val} className="text-zinc-300">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Reemplazar MachinesPage completa con versión que incluye panel de mantenimiento**

Reemplazar **todo** el contenido de `frontend/app/(dashboard)/machines/page.tsx` con la versión completa a continuación (incluye los estados de mantenimiento y el panel expandible integrado en el map):

```typescript
// frontend/app/(dashboard)/machines/page.tsx
"use client";
import { useState } from "react";
import { Plus, Wrench, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useMachines, useCreateMachine, useUpdateMachineStatus, useAddMaintenance } from "@/hooks/useMachines";
import { apiClient } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const statusConfig = {
  active: { label: "Activa", color: "bg-green-500/20 text-green-400", icon: CheckCircle },
  maintenance: { label: "Mantenimiento", color: "bg-yellow-500/20 text-yellow-400", icon: Wrench },
  damaged: { label: "Dañada", color: "bg-red-500/20 text-red-400", icon: AlertTriangle },
  retired: { label: "Retirada", color: "bg-zinc-700 text-zinc-400", icon: AlertTriangle },
};

export default function MachinesPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const { data: machines, isLoading } = useMachines();
  const createMachine = useCreateMachine();
  const updateStatus = useUpdateMachineStatus();
  const addMaintenance = useAddMaintenance();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", brand: "", serial_number: "" });
  const [expandedMachineId, setExpandedMachineId] = useState<string | null>(null);
  const [maintenanceForm, setMaintenanceForm] = useState({ description: "", technician: "", cost: "" });

  const { data: maintenanceHistory } = useQuery({
    queryKey: ["maintenance", expandedMachineId],
    queryFn: () =>
      apiClient(token).get(`/api/v1/machines/${expandedMachineId}/maintenance`).then((r) => r.data),
    enabled: !!expandedMachineId && !!token,
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createMachine.mutateAsync(form);
    setForm({ name: "", brand: "", serial_number: "" });
    setOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Máquinas</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4 mr-2" /> Agregar máquina
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader><DialogTitle className="text-white">Nueva máquina</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {[
                { id: "name", label: "Nombre" },
                { id: "brand", label: "Marca" },
                { id: "serial_number", label: "Número de serie" },
              ].map(({ id, label }) => (
                <div key={id} className="space-y-1">
                  <Label htmlFor={id} className="text-zinc-300 text-sm">{label}</Label>
                  <Input id={id} value={(form as any)[id]}
                    onChange={(e) => setForm({ ...form, [id]: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-white" />
                </div>
              ))}
              <Button type="submit" disabled={createMachine.isPending} className="bg-orange-500 hover:bg-orange-600">
                {createMachine.isPending ? "Guardando..." : "Agregar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full bg-zinc-800 rounded-lg" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {(machines ?? []).map((m: any) => {
            const config = statusConfig[m.status as keyof typeof statusConfig] ?? statusConfig.active;
            const Icon = config.icon;
            return (
              <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-zinc-500" />
                    <div>
                      <p className="text-white font-medium">{m.name}</p>
                      <p className="text-zinc-400 text-sm">{m.brand} · {m.serial_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={config.color}>{config.label}</Badge>
                    <Select value={m.status} onValueChange={(val) => updateStatus.mutate({ id: m.id, status: val })}>
                      <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-zinc-300 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        {Object.entries(statusConfig).map(([val, { label }]) => (
                          <SelectItem key={val} value={val} className="text-zinc-300">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white text-xs"
                      onClick={() => setExpandedMachineId(expandedMachineId === m.id ? null : m.id)}>
                      <Wrench className="h-3 w-3 mr-1" />
                      {expandedMachineId === m.id ? "Cerrar" : "Mantenimiento"}
                    </Button>
                  </div>
                </div>
                {expandedMachineId === m.id && (
                  <div className="border-t border-zinc-800 p-4 bg-zinc-950 space-y-4">
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      await addMaintenance.mutateAsync({
                        machineId: m.id,
                        data: { ...maintenanceForm, cost: maintenanceForm.cost || undefined },
                      });
                      setMaintenanceForm({ description: "", technician: "", cost: "" });
                    }} className="grid grid-cols-3 gap-2">
                      <Input placeholder="Descripción" value={maintenanceForm.description}
                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
                        className="bg-zinc-800 border-zinc-700 text-white text-sm" required />
                      <Input placeholder="Técnico" value={maintenanceForm.technician}
                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, technician: e.target.value })}
                        className="bg-zinc-800 border-zinc-700 text-white text-sm" required />
                      <div className="flex gap-2">
                        <Input placeholder="Costo (COP)" type="number" value={maintenanceForm.cost}
                          onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })}
                          className="bg-zinc-800 border-zinc-700 text-white text-sm" />
                        <Button type="submit" size="sm" className="bg-orange-500 hover:bg-orange-600 shrink-0">
                          Agregar
                        </Button>
                      </div>
                    </form>
                    <div className="space-y-2">
                      {(maintenanceHistory ?? []).map((r: any) => (
                        <div key={r.id} className="flex justify-between text-sm">
                          <div>
                            <span className="text-white">{r.description}</span>
                            <span className="text-zinc-400 ml-2">— {r.technician}</span>
                          </div>
                          <div className="text-zinc-400">
                            {r.cost ? `$${Number(r.cost).toLocaleString("es-CO")}` : "Sin costo"}
                          </div>
                        </div>
                      ))}
                      {(maintenanceHistory ?? []).length === 0 && (
                        <p className="text-zinc-500 text-sm">Sin registros de mantenimiento.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Probar manualmente**

```
1. Ir a /machines
2. Agregar máquina → aparece en la lista con estado "Activa"
3. Cambiar estado a "Mantenimiento" desde el dropdown → badge cambia de color
4. Click "Mantenimiento" → panel expandible aparece
5. Llenar descripción + técnico + costo → click Agregar
6. El registro aparece en el historial inmediatamente
```

- [ ] **Step 5: Commit final del Plan 2**

```bash
git add frontend/app/(dashboard)/machines/ frontend/hooks/useMachines.ts
git commit -m "feat: add machines frontend page with status management"
```

---

## Resumen del Plan 2

Al completar este plan tendrás:

- ✅ **Módulo Miembros:** CRUD completo + membresías por miembro + aislamiento de tenant
- ✅ **Módulo Check-ins:** registro de entrada/salida + contador de ocupación en tiempo real
- ✅ **Módulo Pagos:** registro manual + pagos pendientes + acción "marcar pagado"
- ✅ **Módulo Clases:** CRUD de clases con horario, instructor y capacidad
- ✅ **Módulo Máquinas:** inventario + cambio de estado + historial de mantenimiento
- ✅ **Frontend conectado:** todas las páginas consumen la API real via TanStack Query
- ✅ **35+ tests pasando** cubriendo CRUD, aislamiento multi-tenant y reglas de negocio

**Siguiente:** Plan 3 — Dashboard KPIs, Reportes, Chatbot IA, Notificaciones, Configuración

---

**Versión:** 1.0
**Estado:** Listo para ejecución
