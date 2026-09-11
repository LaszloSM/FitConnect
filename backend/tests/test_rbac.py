import uuid
from urllib.parse import urlparse, parse_qs

import pytest

_OWNER: dict[str, str] = {}


async def _owner_token(client):
    if "token" in _OWNER:
        return _OWNER["token"]
    email = "rbac-owner@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner RBAC", "gym_name": "RbacGym", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _OWNER["token"] = r.json()["access_token"]
    return _OWNER["token"]


async def _staff_token(client, owner_token, role):
    """Invita y acepta para obtener un token de staff con el rol dado."""
    email = f"{role}-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post(
        "/api/v1/users/invite",
        json={"email": email, "full_name": role.title(), "role": role},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    acc = await client.post("/api/v1/auth/staff/accept-invite", json={"token": token, "password": "StaffPass123!"})
    return acc.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# Endpoints restringidos a owner+admin (visibilidad financiera)
FINANCIAL_GET = [
    "/api/v1/dashboard/kpis",
    "/api/v1/dashboard/insights",
    "/api/v1/payments",
    "/api/v1/payments/cash",
    "/api/v1/payments/receivables",
    "/api/v1/settings/billing",
    "/api/v1/reports/member-status",
    "/api/v1/reports/payment-methods",
    "/api/v1/cash/shifts",
    "/api/v1/cash/expenses",
]


@pytest.mark.parametrize("path", FINANCIAL_GET)
async def test_receptionist_forbidden_on_financial(client, path):
    owner = await _owner_token(client)
    recep = await _staff_token(client, owner, "receptionist")
    r = await client.get(path, headers=_auth(recep))
    assert r.status_code == 403, f"{path} debería ser 403 para recepción, fue {r.status_code}"


@pytest.mark.parametrize("path", FINANCIAL_GET)
async def test_admin_allowed_on_financial(client, path):
    owner = await _owner_token(client)
    admin = await _staff_token(client, owner, "admin")
    r = await client.get(path, headers=_auth(admin))
    assert r.status_code == 200, f"{path} debería ser 200 para admin, fue {r.status_code} ({r.text})"


async def test_receptionist_allowed_on_operational(client):
    owner = await _owner_token(client)
    recep = await _staff_token(client, owner, "receptionist")
    # Recepción sí puede operar: ver miembros y check-ins del día
    assert (await client.get("/api/v1/members", headers=_auth(recep))).status_code == 200
    assert (await client.get("/api/v1/checkins/today", headers=_auth(recep))).status_code == 200
    # Y las listas de a quién hay que llamar: vencen esta semana, morosos en
    # gracia, denegados hoy. Es su trabajo, no información financiera.
    assert (await client.get("/api/v1/dashboard/operations", headers=_auth(recep))).status_code == 200


async def test_receptionist_cannot_delete_member(client):
    owner = await _owner_token(client)
    recep = await _staff_token(client, owner, "receptionist")
    r = await client.delete(f"/api/v1/members/{uuid.uuid4()}", headers=_auth(recep))
    assert r.status_code == 403


async def test_deactivated_staff_token_rejected_on_operational(client):
    """El baseline get_current_staff cierra el hueco: un token de staff cuyo
    UserStaff fue desactivado deja de funcionar en endpoints operativos."""
    owner = await _owner_token(client)
    email = f"deact-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post(
        "/api/v1/users/invite",
        json={"email": email, "full_name": "Deact", "role": "receptionist"},
        headers=_auth(owner),
    )
    token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    staff_token = (await client.post(
        "/api/v1/auth/staff/accept-invite", json={"token": token, "password": "StaffPass123!"}
    )).json()["access_token"]
    # Funciona mientras está activo
    assert (await client.get("/api/v1/products", headers=_auth(staff_token))).status_code == 200
    # El owner lo desactiva
    users = (await client.get("/api/v1/users", headers=_auth(owner))).json()
    uid = next(u["id"] for u in users if u["email"] == email)
    assert (await client.delete(f"/api/v1/users/{uid}", headers=_auth(owner))).status_code == 200
    # El token deja de servir (get_current_staff valida is_active)
    assert (await client.get("/api/v1/products", headers=_auth(staff_token))).status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# Mutaciones por rol.
#
# Antes esta suite solo cubría GETs, así que un router que naciera sin control
# de permisos (member_plans lo estuvo: recepción podía cambiar el precio de un
# plan y borrarlo) pasaba desapercibido. Aquí se comprueba cada escritura.
# ─────────────────────────────────────────────────────────────────────────────

_TOKENS: dict[str, str] = {}

ALL_ROLES = ("owner", "admin", "receptionist")


async def _role_token(client, role):
    if role not in _TOKENS:
        owner = await _owner_token(client)
        _TOKENS[role] = owner if role == "owner" else await _staff_token(client, owner, role)
    return _TOKENS[role]


_FAKE = str(uuid.uuid4())
_TAG = uuid.uuid4().hex[:6]  # la tenant DB no es fresca: nombres unicos por corrida

# Un 403 prueba que el permiso frena. Un "no-403" no prueba nada por si solo: 401
# (token roto), 405 (ruta mal escrita) y 404-de-ruta tambien pasarian. Por eso la
# rama permitida exige ademas que la respuesta venga del handler real.
REACHED_HANDLER = {200, 201, 204, 400, 404, 409, 422}

# (metodo, ruta, cuerpo, roles que SI deben poder)
MUTATIONS = [
    ("post",   "/api/v1/member-plans/", {"name": f"P {_TAG}", "price": 1000, "duration_days": 30}, ("owner", "admin")),
    ("put",    f"/api/v1/member-plans/{_FAKE}", {"price": 1}, ("owner", "admin")),
    ("delete", f"/api/v1/member-plans/{_FAKE}", None, ("owner", "admin")),

    ("post",   "/api/v1/payments", {"member_id": _FAKE, "amount": 1000, "method": "cash"},
     ("owner", "admin", "receptionist")),
    ("post",   f"/api/v1/payments/{_FAKE}/void", {"reason": "prueba de permisos"}, ("owner", "admin")),
    ("post",   f"/api/v1/payments/{_FAKE}/refund", {"reason": "prueba de permisos"}, ("owner", "admin")),
    ("patch",  f"/api/v1/payments/{_FAKE}/mark-paid", None, ("owner", "admin", "receptionist")),

    ("post",   "/api/v1/cash/shifts/open", {"opening_amount": 0}, ("owner", "admin", "receptionist")),
    ("post",   f"/api/v1/cash/shifts/{_FAKE}/close", {"counted_cash": 0}, ("owner", "admin", "receptionist")),
    ("post",   "/api/v1/cash/expenses", {"amount": 1000, "category": "otros", "concept": "prueba"},
     ("owner", "admin", "receptionist")),

    ("post",   "/api/v1/machines", {"name": f"Trotadora {_TAG}", "area": "Cardio"}, ("owner", "admin")),
    ("put",    f"/api/v1/machines/{_FAKE}", {"name": "X"}, ("owner", "admin")),
    ("delete", f"/api/v1/machines/{_FAKE}", None, ("owner", "admin")),
    ("post",   f"/api/v1/machines/{_FAKE}/maintenance", {"description": "Engrase"},
     ("owner", "admin", "receptionist")),

    ("post",   "/api/v1/instructors", {"full_name": f"Juan {_TAG}"}, ("owner", "admin")),
    ("put",    f"/api/v1/instructors/{_FAKE}", {"full_name": "Juan"}, ("owner", "admin")),
    ("delete", f"/api/v1/instructors/{_FAKE}", None, ("owner", "admin")),

    ("post",   "/api/v1/products/categories", {"name": f"Cat {_TAG}"}, ("owner", "admin")),
    ("put",    f"/api/v1/products/{_FAKE}", {"price": 1}, ("owner", "admin")),
    ("delete", f"/api/v1/products/{_FAKE}", None, ("owner", "admin")),

    ("post",   "/api/v1/classes", {"name": f"Clase {_TAG}", "instructor": "Ana", "capacity": 10}, ("owner", "admin")),
    ("put",    f"/api/v1/classes/{_FAKE}", {"capacity": 5}, ("owner", "admin")),
    ("delete", f"/api/v1/classes/{_FAKE}", None, ("owner", "admin")),
    ("patch",  f"/api/v1/class-sessions/{_FAKE}", {"instructor_override": "Ana"}, ("owner", "admin")),
    ("post",   f"/api/v1/class-sessions/{_FAKE}/bookings", {"member_id": _FAKE},
     ("owner", "admin", "receptionist")),

    ("post",   f"/api/v1/members/{_FAKE}/routines", {"routine_id": _FAKE}, ("owner", "admin")),

    ("post",   f"/api/v1/memberships/{_FAKE}/cancel", None, ("owner", "admin", "receptionist")),
    ("post",   f"/api/v1/memberships/{_FAKE}/freeze", {"days": 7}, ("owner", "admin", "receptionist")),

    ("delete", f"/api/v1/members/{_FAKE}", None, ("owner", "admin")),
    ("post",   "/api/v1/checkins/override", {"member_id": _FAKE, "reason": "prueba"}, ("owner", "admin")),

    ("patch",  "/api/v1/settings/gym", {"phone": "3001112233"}, ("owner", "admin")),
    ("patch",  "/api/v1/settings/operations", {"grace_days": 3}, ("owner",)),
    ("patch",  "/api/v1/settings/billing", {"transfer_auto_void_hours": 48}, ("owner",)),
    ("patch",  "/api/v1/settings/integrations", {"wompi_public_key": "pub_test"}, ("owner",)),

    # Mensajeria: un anuncio le llega a todo el gym y no se puede deshacer.
    ("put",    "/api/v1/messages/welcome",
     {"body": "Hola {nombre}", "is_active": True, "meta_template_name": None}, ("owner", "admin")),
    ("post",   "/api/v1/messages/announcements",
     {"title": "Aviso", "body": "Mensaje de prueba", "segment": "all_members"}, ("owner", "admin")),
    ("post",   "/api/v1/messages/send",
     {"member_id": _FAKE, "title": "Hola", "body": "Mensaje de prueba"}, ("owner", "admin")),
    ("post",   f"/api/v1/messages/outbox/{_FAKE}/retry", None, ("owner", "admin")),

    ("post",   "/api/v1/users/invite",
     {"email": f"x-{uuid.uuid4().hex[:8]}@gym.com", "full_name": "X", "role": "receptionist"}, ("owner",)),
    ("patch",  f"/api/v1/users/{_FAKE}/role", {"role": "admin"}, ("owner",)),
    ("delete", f"/api/v1/users/{_FAKE}", None, ("owner",)),
    ("post",   f"/api/v1/users/{_FAKE}/reactivate", None, ("owner",)),
]


@pytest.mark.parametrize("method,path,body,allowed", MUTATIONS)
@pytest.mark.parametrize("role", ALL_ROLES)
async def test_mutation_permissions(client, method, path, body, allowed, role):
    token = await _role_token(client, role)
    kwargs = {"headers": _auth(token)}
    if body is not None:
        kwargs["json"] = body
    r = await getattr(client, method)(path, **kwargs)
    if role in allowed:
        assert r.status_code in REACHED_HANDLER, (
            f"{method.upper()} {path} deberia llegar al handler para {role}, "
            f"fue {r.status_code} ({r.text[:200]})"
        )
    else:
        assert r.status_code == 403, (
            f"{method.upper()} {path} deberia ser 403 para {role}, fue {r.status_code}"
        )


async def test_audit_is_owner_only(client):
    owner = await _role_token(client, "owner")
    admin = await _role_token(client, "admin")
    recep = await _role_token(client, "receptionist")
    assert (await client.get("/api/v1/audit", headers=_auth(owner))).status_code == 200
    # La auditoria es del dueno: ni siquiera el admin la ve.
    assert (await client.get("/api/v1/audit", headers=_auth(admin))).status_code == 403
    assert (await client.get("/api/v1/audit", headers=_auth(recep))).status_code == 403


async def test_deactivated_staff_can_be_reactivated(client):
    """Desactivar por error dejaba a la persona fuera de la lista y sin vuelta atras."""
    owner = await _owner_token(client)
    email = f"react-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post(
        "/api/v1/users/invite",
        json={"email": email, "full_name": "Reactivable", "role": "receptionist"},
        headers=_auth(owner),
    )
    assert inv.status_code == 201, inv.text
    token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    acc = await client.post("/api/v1/auth/staff/accept-invite", json={"token": token, "password": "StaffPass123!"})
    assert acc.status_code in (200, 201), acc.text

    users = (await client.get("/api/v1/users", headers=_auth(owner))).json()
    uid = next(u["id"] for u in users if u["email"] == email)
    assert (await client.delete(f"/api/v1/users/{uid}", headers=_auth(owner))).status_code == 200

    # Desactivado: fuera de la lista por defecto, visible con include_inactive
    assert email not in [u["email"] for u in (await client.get("/api/v1/users", headers=_auth(owner))).json()]
    inactive = (await client.get("/api/v1/users?include_inactive=true", headers=_auth(owner))).json()
    assert email in [u["email"] for u in inactive]

    r = await client.post(f"/api/v1/users/{uid}/reactivate", headers=_auth(owner))
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is True
