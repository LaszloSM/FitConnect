"""Importación de socios desde el software anterior del gimnasio.

El archivo de prueba replica lo que exporta el programa que usan hoy los gyms
(encabezados "Cedula", "Sexo", "Fecha Nac", "Rh", "Ingreso por DNI"; separador
punto y coma; Latin-1; nombres en mayúsculas; cédulas con puntos).
"""
import io
import json
import uuid
from datetime import date, timedelta

from openpyxl import Workbook

from app.core.timeutil import today_bogota
from tests.helpers import create_member, create_plan

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="importa@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Importa", "gym_name": "Importa Gym", "city": "Medellín",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKENS[email] = r.json()["access_token"]
    return _TOKENS[email]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _cedula() -> str:
    return str(1000000000 + uuid.uuid4().int % 899999999)


def _dotted(doc: str) -> str:
    return f"{int(doc):,}".replace(",", ".")


def _legacy_csv(rows: list[list[str]]) -> bytes:
    header = ["Cedula", "Nombre", "Sexo", "Fecha Nac", "Ciudad", "Email", "Telefono", "Eps", "Rh",
              "Expectativa", "Direccion", "Ingreso por DNI", "Entrenador", "Plan", "Fecha vencimiento"]
    lines = [";".join(header)] + [";".join(r) for r in rows]
    return ("\r\n".join(lines) + "\r\n").encode("cp1252")


async def _preview(client, h, data: bytes, name="clientes.csv", options=None):
    files = {"file": (name, data, "text/csv")}
    form = {"options": json.dumps(options)} if options else None
    r = await client.post("/api/v1/members/import/preview", files=files, data=form, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _commit(client, h, data: bytes, name="clientes.csv", options=None):
    files = {"file": (name, data, "text/csv")}
    form = {"options": json.dumps(options)} if options else None
    r = await client.post("/api/v1/members/import/commit", files=files, data=form, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _by_doc(client, h, doc):
    r = await client.get("/api/v1/members", params={"id_number": doc}, headers=h)
    assert r.status_code == 200, r.text
    found = r.json()
    return found[0] if found else None


async def test_legacy_export_preview_then_commit_then_reimport_then_undo(client):
    h = _auth(await _owner_token(client))
    a, b, c = _cedula(), _cedula(), _cedula()
    family = f"familia-{uuid.uuid4().hex[:6]}@correo.co"
    vence = (today_bogota() + timedelta(days=20)).strftime("%d/%m/%Y")
    data = _legacy_csv([
        [_dotted(a), "MARÍA DE LOS ÁNGELES PÉREZ", "Femenino", "12/04/1995", "MEDELLÍN", family,
         "300 123 4567", "Sura", "O POSITIVO", "Bajar de peso", "Cra 45 # 10-20", "Si", "Profe Inexistente",
         "MENSUALIDAD VIP", vence],
        [b, "Juan Restrepo", "M", "03/11/1988", "Envigado", family, "3109876543", "Nueva EPS", "A-",
         "Ganar masa muscular", "", "No", "", "", ""],
        ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        [c, "", "F", "", "", "", "", "", "", "", "", "", "", "", ""],
        # La misma persona dos veces: se une, no se duplica
        [a, "María Pérez", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ])

    pv = await _preview(client, h, data)
    by_header = {col["header"]: col["field"] for col in pv["columns"]}
    assert by_header["Cedula"] == "id_number" and by_header["Rh"] == "blood_type"
    assert by_header["Ingreso por DNI"] == "access_by_document" and by_header["Fecha Nac"] == "birth_date"
    s = pv["summary"]
    assert s["create"] == 2 and s["error"] == 1 and s["memberships"] == 1
    assert [p["name"] for p in pv["unmatched_plans"]] == ["MENSUALIDAD VIP"]
    assert [t["name"] for t in pv["unmatched_trainers"]] == ["Profe Inexistente"]
    assert await _by_doc(client, h, a) is None, "la vista previa no debe escribir"

    res = await _commit(client, h, data)
    assert res["summary"]["create"] == 2 and res["errors"][0]["field"] == "full_name"

    maria = await _by_doc(client, h, a)
    assert maria["full_name"] == "María de los Ángeles Pérez"
    assert maria["gender"] == "F" and maria["birth_date"] == "1995-04-12"
    assert maria["blood_type"] == "O+" and maria["eps"] == "Sura" and maria["phone"] == "+573001234567"
    assert maria["access_by_document"] is True and maria["city"] == "Medellín"
    assert maria["expectation"] == "Bajar de peso" and maria["training_goal"] == "weight_loss"
    assert maria["email"] == family
    juan = await _by_doc(client, h, b)
    assert juan["email"] is None, "el correo de la familia queda con quien lo trajo primero"
    assert juan["training_goal"] == "muscle_gain" and juan["blood_type"] == "A-"

    ms = (await client.get(f"/api/v1/members/{maria['id']}/memberships", headers=h)).json()
    assert len(ms) == 1 and ms[0]["plan_name"] == "Mensualidad Vip"
    assert float(ms[0]["price"]) == 0

    # La migración debe servir en el torniquete desde el primer día
    dev = (await client.post("/api/v1/kiosk/devices", json={
        "name": f"Torniquete {uuid.uuid4().hex[:4]}", "kind": "turnstile"}, headers=h)).json()
    v = await client.post("/api/v1/access/verify", json={"id_number": a}, headers=_auth(dev["token"]))
    assert v.json()["allow"] is True, v.text

    again = await _commit(client, h, data)
    assert again["summary"]["create"] == 0 and again["summary"]["memberships"] == 0
    assert len((await client.get(f"/api/v1/members/{maria['id']}/memberships", headers=h)).json()) == 1

    batches = (await client.get("/api/v1/members/import/batches", headers=h)).json()
    first = next(bt for bt in batches if bt["id"] == res["batch_id"])
    assert first["status"] == "applied" and first["counts"]["create"] == 2

    undo = await client.post(f"/api/v1/members/import/batches/{res['batch_id']}/undo", headers=h)
    assert undo.status_code == 200, undo.text
    assert undo.json()["members_removed"] == 2
    assert await _by_doc(client, h, a) is None and await _by_doc(client, h, b) is None
    twice = await client.post(f"/api/v1/members/import/batches/{res['batch_id']}/undo", headers=h)
    assert twice.status_code == 409


async def test_existing_member_only_fills_empty_fields_and_undo_restores(client):
    h = _auth(await _owner_token(client))
    doc = _cedula()
    existing = await create_member(client, h, id_number=doc, full_name="Laura Gómez")
    assert existing["blood_type"] is None and existing["eps"] is None

    data = _legacy_csv([[_dotted(doc), "LAURA MARCELA GÓMEZ", "F", "", "", "", "", "Compensar", "AB+",
                         "", "", "", "", "", ""]])
    pv = await _preview(client, h, data)
    row = pv["rows"][0]
    assert row["action"] == "update"
    assert {"EPS", "RH / tipo de sangre", "Sexo"} <= set(row["fill"])
    assert [c["field"] for c in row["conflicts"]] == ["full_name"]

    res = await _commit(client, h, data)
    laura = await _by_doc(client, h, doc)
    assert laura["full_name"] == "Laura Gómez", "un dato existente no se pisa por defecto"
    assert laura["eps"] == "Compensar" and laura["blood_type"] == "AB+"

    await client.post(f"/api/v1/members/import/batches/{res['batch_id']}/undo", headers=h)
    laura = await _by_doc(client, h, doc)
    assert laura["eps"] is None and laura["blood_type"] is None
    assert laura["full_name"] == "Laura Gómez"


async def test_overwrite_conflicts_only_when_chosen(client):
    h = _auth(await _owner_token(client))
    doc = _cedula()
    await create_member(client, h, id_number=doc, full_name="Pedro Pérez", city="Cali")
    data = _legacy_csv([[doc, "Pedro Antonio Pérez", "", "", "Bogotá", "", "", "", "", "", "", "", "", "", ""]])
    await _commit(client, h, data, options={"on_conflict": "file"})
    pedro = await _by_doc(client, h, doc)
    assert pedro["full_name"] == "Pedro Antonio Pérez" and pedro["city"] == "Bogotá"


async def test_plan_mapping_and_ticketera_entries(client):
    h = _auth(await _owner_token(client))
    plan_id = await create_plan(client, h, duration_days=30)
    doc = _cedula()
    vence = (today_bogota() + timedelta(days=10)).strftime("%d/%m/%Y")
    data = _legacy_csv([[doc, "Ana Torres", "F", "", "", "", "", "", "", "", "", "", "", "Plan viejo", vence]])
    pv = await _preview(client, h, data)
    assert pv["unmatched_plans"][0]["name"] == "Plan viejo"
    await _commit(client, h, data, options={"plan_map": {"Plan viejo": plan_id}})
    ana = await _by_doc(client, h, doc)
    ms = (await client.get(f"/api/v1/members/{ana['id']}/memberships", headers=h)).json()
    plans = (await client.get("/api/v1/member-plans/", headers=h)).json()
    plan_name = next(p["name"] for p in plans if p["id"] == plan_id)
    assert ms[0]["plan_name"] == plan_name
    assert ms[0]["end_date"] == (today_bogota() + timedelta(days=10)).isoformat()


async def test_xlsx_with_title_row_split_names_and_old_template_endpoint(client):
    h = _auth(await _owner_token(client))
    doc1, doc2 = _cedula(), _cedula()
    wb = Workbook()
    ws = wb.active
    ws.append(["Listado de clientes - Gimnasio"])
    ws.append(["Documento", "Nombres", "Apellidos", "Genero", "Fecha de nacimiento", "Celular", "Tipo de sangre", "Vence"])
    ws.append([int(doc1), "CARLOS", "MEJÍA", "Hombre", date(1990, 1, 31), 3001112233, "0+", today_bogota() + timedelta(days=5)])
    ws.append([doc2, "Sofía", "Lara", "mujer", "1999-12-01", "", "b-", ""])
    buf = io.BytesIO()
    wb.save(buf)
    r = await client.post("/api/v1/members/import", files={
        "file": ("export.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    }, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 2
    carlos = await _by_doc(client, h, doc1)
    assert carlos["full_name"] == "Carlos Mejía" and carlos["blood_type"] == "O+" and carlos["gender"] == "M"
    assert carlos["birth_date"] == "1990-01-31"
    sofia = await _by_doc(client, h, doc2)
    assert sofia["blood_type"] == "B-" and sofia["birth_date"] == "1999-12-01"


async def test_template_round_trip(client):
    """La plantilla que se descarga tiene que poder subirse tal cual (antes fallaba
    porque el encabezado obligatorio llevaba un asterisco)."""
    h = _auth(await _owner_token(client))
    tpl = await client.get("/api/v1/members/import/template.xlsx", headers=h)
    assert tpl.status_code == 200 and tpl.content[:2] == b"PK"
    pv = await _preview(client, h, tpl.content, name="plantilla.xlsx")
    fields = {col["field"] for col in pv["columns"]}
    assert {"id_number", "full_name", "membership_end", "access_by_document", "eps"} <= fields
    assert pv["summary"]["error"] == 0 and pv["summary"]["create"] + pv["summary"]["update"] + pv["summary"]["unchanged"] == 1


async def test_import_rejects_bad_files_and_requires_permission(client):
    h = _auth(await _owner_token(client))
    r = await client.post("/api/v1/members/import/preview", files={"file": ("x.csv", b"", "text/csv")}, headers=h)
    assert r.status_code == 400
    big = b"a;b\n" + b"x" * (5 * 1024 * 1024 + 10)
    r = await client.post("/api/v1/members/import/preview", files={"file": ("x.csv", big, "text/csv")}, headers=h)
    assert r.status_code == 413
    r = await client.post("/api/v1/members/import/preview", files={"file": ("x.csv", b"a;b\n1;2\n", "text/csv")})
    assert r.status_code in (401, 403)


async def test_imported_membership_renewal_uses_plan_price_not_zero(client):
    """La membresía importada vale 0 (ya se cobró en el sistema anterior): al
    vencer, la renovación se cobra al precio del plan, nunca "Renueva por $0"."""
    h = _auth(await _owner_token(client))
    plan_id = await create_plan(client, h, duration_days=30, price=85000)
    plans = (await client.get("/api/v1/member-plans/", headers=h)).json()
    plan_name = next(p["name"] for p in plans if p["id"] == plan_id)
    mapped, unmapped = _cedula(), _cedula()
    vencio = (today_bogota() - timedelta(days=5)).strftime("%d/%m/%Y")
    data = _legacy_csv([
        [mapped, "Con Plan", "", "", "", "", "3001234500", "", "", "", "", "", "", plan_name, vencio],
        [unmapped, "Sin Plan", "", "", "", "", "3001234501", "", "", "", "", "", "", "Plan rarísimo", vencio],
    ])
    await _commit(client, h, data)
    rows = (await client.get("/api/v1/payments/receivables", headers=h)).json()
    by_name = {r["member_name"]: r for r in rows}
    assert float(by_name["Con Plan"]["amount_due"]) == 85000
    assert by_name["Sin Plan"]["amount_due"] is None
