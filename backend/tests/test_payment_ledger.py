"""Idempotencia de cobros y libro de movimientos.

El escenario que motiva todo esto: sábado 11am, tres socios en fila, la
recepcionista da clic en "Cobrar", el spinner se traba, da clic otra vez. Antes:
dos pagos, dos recibos y DOS membresías encadenadas — el socio pagaba una vez y
el sistema le decía que su plan vencía en 60 días, y en la caja del día sobraba
plata que nadie entregó.
"""
import asyncio
import uuid
from decimal import Decimal

import pytest

from app.core.timeutil import today_bogota
from tests.helpers import create_member, create_member_without_membership, create_plan

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="ledger@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Ledger", "gym_name": "Ledger Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKENS[email] = r.json()["access_token"]
    return _TOKENS[email]


def _auth(token, key=None):
    h = {"Authorization": f"Bearer {token}"}
    if key:
        h["Idempotency-Key"] = key
    return h


async def _open_shift(client, token):
    """La tenant DB persiste entre corridas: puede haber un turno abierto de antes."""
    r = await client.post("/api/v1/cash/shifts/open", json={"opening_amount": 0}, headers=_auth(token))
    if r.status_code == 201:
        return r.json()["id"]
    current = (await client.get("/api/v1/cash/shifts/current", headers=_auth(token))).json()
    return current["shift"]["id"] if current.get("open") else None


async def _fresh_open_shift(client, token):
    """Cierra lo que hubiera abierto y abre uno nuevo."""
    current = (await client.get("/api/v1/cash/shifts/current", headers=_auth(token))).json()
    if current.get("open"):
        await client.post(f"/api/v1/cash/shifts/{current['shift']['id']}/close",
                          json={"counted_cash": 0}, headers=_auth(token))
    r = await client.post("/api/v1/cash/shifts/open", json={"opening_amount": 0}, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ─────────────────────────── Idempotencia ───────────────────────────

async def test_double_click_creates_one_payment(client):
    token = await _owner_token(client)
    await _open_shift(client, token)
    member = await create_member_without_membership(client, _auth(token))
    key = uuid.uuid4().hex
    body = {"member_id": member["id"], "amount": 50000, "method": "cash",
            "status": "paid", "concept": "Abono"}

    first = await client.post("/api/v1/payments", json=body, headers=_auth(token, key))
    second = await client.post("/api/v1/payments", json=body, headers=_auth(token, key))

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["id"] == second.json()["id"], "el reintento creó un pago nuevo"

    listed = (await client.get(
        f"/api/v1/members/{member['id']}/payments", headers=_auth(token)
    )).json()
    assert len([p for p in listed if p["id"] == first.json()["id"]]) == 1
    assert len(listed) == 1, f"el socio quedó con {len(listed)} pagos"


async def test_double_charge_does_not_chain_a_second_membership(client):
    token = await _owner_token(client)
    await _open_shift(client, token)
    plan_id = await create_plan(client, _auth(token), duration_days=30)
    member = await create_member_without_membership(client, _auth(token))
    key = uuid.uuid4().hex
    body = {"member_id": member["id"], "plan_id": str(plan_id), "method": "cash"}

    first = await client.post("/api/v1/member-plans/charge", json=body, headers=_auth(token, key))
    second = await client.post("/api/v1/member-plans/charge", json=body, headers=_auth(token, key))
    assert first.status_code == 200, first.text
    assert first.json()["membership_id"] == second.json()["membership_id"]

    memberships = (await client.get(
        f"/api/v1/members/{member['id']}/memberships", headers=_auth(token)
    )).json()
    vigentes = [m for m in memberships if m.get("effective_status") in ("active", "scheduled")]
    assert len(vigentes) == 1, f"quedaron {len(vigentes)} membresías vigentes: {vigentes}"


async def test_same_key_different_body_is_rejected(client):
    token = await _owner_token(client)
    await _open_shift(client, token)
    member = await create_member_without_membership(client, _auth(token))
    key = uuid.uuid4().hex
    base = {"member_id": member["id"], "amount": 10000, "method": "cash",
            "status": "paid", "concept": "Uno"}
    assert (await client.post("/api/v1/payments", json=base, headers=_auth(token, key))).status_code == 201
    other = await client.post(
        "/api/v1/payments", json={**base, "amount": 99000}, headers=_auth(token, key)
    )
    assert other.status_code == 409, other.text


async def test_without_key_nothing_changes(client):
    """Sin cabecera el endpoint sigue funcionando como siempre (clientes viejos)."""
    token = await _owner_token(client)
    await _open_shift(client, token)
    member = await create_member_without_membership(client, _auth(token))
    body = {"member_id": member["id"], "amount": 7000, "method": "cash",
            "status": "paid", "concept": "Sin clave"}
    a = await client.post("/api/v1/payments", json=body, headers=_auth(token))
    b = await client.post("/api/v1/payments", json=body, headers=_auth(token))
    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["id"] != b.json()["id"]


# ─────────────────────────── Reversa ───────────────────────────

async def _refund_expenses_total(client, token) -> Decimal:
    """Suma de los egresos por devolución. Contar filas de una lista paginada
    deja de probar nada en cuanto el gym acumula 50 egresos."""
    rows = (await client.get("/api/v1/cash/expenses?limit=100", headers=_auth(token))).json()
    return sum(
        (Decimal(str(e["amount"])) for e in rows if e["category"] == "devolucion"),
        Decimal("0"),
    )


async def _paid_payment(client, token, amount=100000):
    await _open_shift(client, token)
    member = await create_member_without_membership(client, _auth(token))
    r = await client.post("/api/v1/payments", json={
        "member_id": member["id"], "amount": amount, "method": "cash",
        "status": "paid", "concept": "Cobro de prueba",
    }, headers=_auth(token, uuid.uuid4().hex))
    assert r.status_code == 201, r.text
    return r.json()


async def test_partial_refund_leaves_live_balance(client):
    token = await _owner_token(client)
    payment = await _paid_payment(client, token, amount=100000)

    r = await client.post(f"/api/v1/payments/{payment['id']}/refund", json={
        "reason": "Se cobró de más por error", "amount": 30000,
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "paid", "una devolución parcial no cierra el pago"
    assert Decimal(body["refunded_amount"]) == Decimal("30000")

    ledger = (await client.get(f"/api/v1/payments/{payment['id']}/movements", headers=_auth(token))).json()
    assert Decimal(ledger["outstanding"]) == Decimal("70000")
    kinds = [m["kind"] for m in ledger["movements"]]
    assert kinds == ["charge", "refund"]


async def test_refund_cannot_exceed_live_balance(client):
    token = await _owner_token(client)
    payment = await _paid_payment(client, token, amount=50000)
    await client.post(f"/api/v1/payments/{payment['id']}/refund",
                      json={"reason": "Primera parte", "amount": 40000}, headers=_auth(token))
    r = await client.post(f"/api/v1/payments/{payment['id']}/refund",
                          json={"reason": "Más de lo que queda", "amount": 20000}, headers=_auth(token))
    assert r.status_code == 400, r.text


async def test_full_refund_closes_the_payment(client):
    token = await _owner_token(client)
    payment = await _paid_payment(client, token, amount=60000)
    r = await client.post(f"/api/v1/payments/{payment['id']}/refund",
                          json={"reason": "Devolución completa"}, headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded"
    again = await client.post(f"/api/v1/payments/{payment['id']}/refund",
                              json={"reason": "Otra vez"}, headers=_auth(token))
    assert again.status_code == 400


async def test_correction_does_not_move_cash(client):
    """Corregir un typo no puede descuadrar la caja del día."""
    token = await _owner_token(client)
    payment = await _paid_payment(client, token, amount=150000)
    before = await _refund_expenses_total(client, token)

    r = await client.post(f"/api/v1/payments/{payment['id']}/refund", json={
        "reason": "Se digitó 150000 en vez de 120000", "amount": 30000, "kind": "correction",
    }, headers=_auth(token))
    assert r.status_code == 200, r.text

    after = await _refund_expenses_total(client, token)
    assert after == before, "la corrección generó un egreso de caja"

    ledger = (await client.get(f"/api/v1/payments/{payment['id']}/movements", headers=_auth(token))).json()
    assert [m["kind"] for m in ledger["movements"]] == ["charge", "correction"]
    assert Decimal(ledger["outstanding"]) == Decimal("120000")


async def test_refund_does_move_cash(client):
    token = await _owner_token(client)
    payment = await _paid_payment(client, token, amount=80000)
    before = await _refund_expenses_total(client, token)
    await client.post(f"/api/v1/payments/{payment['id']}/refund",
                      json={"reason": "Devolución real al socio", "amount": 20000}, headers=_auth(token))
    after = await _refund_expenses_total(client, token)
    assert after == before + 20000


async def test_void_has_its_own_status(client):
    """Una anulación manual y un rechazo de la pasarela ya no comparten estado."""
    token = await _owner_token(client)
    member = await create_member_without_membership(client, _auth(token))
    r = await client.post("/api/v1/payments", json={
        "member_id": member["id"], "amount": 40000, "method": "transfer",
        "status": "pending", "concept": "Transferencia que no llegó",
    }, headers=_auth(token, uuid.uuid4().hex))
    payment_id = r.json()["id"]

    v = await client.post(f"/api/v1/payments/{payment_id}/void",
                          json={"reason": "Nunca llegó el giro"}, headers=_auth(token))
    assert v.status_code == 200, v.text
    assert v.json()["status"] == "voided"

    ledger = (await client.get(f"/api/v1/payments/{payment_id}/movements", headers=_auth(token))).json()
    assert [m["kind"] for m in ledger["movements"]] == ["charge", "void"]


async def test_net_revenue_discounts_refunds(client):
    """El ingreso del día refleja lo que quedó, no lo que se cobró."""
    token = await _owner_token(client, email="ledger-net@gym.com")
    await _open_shift(client, token)
    payment = await _paid_payment(client, token, amount=200000)
    before = Decimal(str((await client.get("/api/v1/payments/cash", headers=_auth(token))).json()["today"]["total"]))

    await client.post(f"/api/v1/payments/{payment['id']}/refund",
                      json={"reason": "Devolución parcial", "amount": 50000}, headers=_auth(token))

    after = Decimal(str((await client.get("/api/v1/payments/cash", headers=_auth(token))).json()["today"]["total"]))
    assert after == before - 50000, f"el ingreso no bajó: {before} → {after}"


@pytest.mark.parametrize("method", ["put", "delete"])
async def test_mutating_a_payment_by_hand_is_gone(client, method):
    """PUT y DELETE eran la puerta trasera del modelo de reversa."""
    token = await _owner_token(client)
    payment = await _paid_payment(client, token)
    kwargs = {"headers": _auth(token)}
    if method == "put":
        kwargs["json"] = {"amount": 1}
    r = await getattr(client, method)(f"/api/v1/payments/{payment['id']}", **kwargs)
    assert r.status_code == 405, f"{method.upper()} sigue disponible ({r.status_code})"


async def test_mark_paid_twice_does_not_double_count(client):
    token = await _owner_token(client)
    member = await create_member_without_membership(client, _auth(token))
    r = await client.post("/api/v1/payments", json={
        "member_id": member["id"], "amount": 30000, "method": "transfer",
        "status": "pending", "concept": "Por confirmar",
    }, headers=_auth(token, uuid.uuid4().hex))
    payment_id = r.json()["id"]

    first = await client.patch(f"/api/v1/payments/{payment_id}/mark-paid", headers=_auth(token))
    assert first.status_code == 200, first.text
    second = await client.patch(f"/api/v1/payments/{payment_id}/mark-paid", headers=_auth(token))
    assert second.status_code == 400, second.text


# ─────────────────────────── Cadena de vigencias ───────────────────────────

async def test_reversal_closes_the_gap_in_the_chain(client):
    """El fallo que nadie ve venir: la reversa tocaba el dinero pero no la
    cadena de vigencias que ese dinero originó, y el hueco aparecía 60 días
    después, cuando el socio llegaba y el torniquete lo rechazaba."""
    token = await _owner_token(client, email="ledger-chain@gym.com")
    await _open_shift(client, token)
    plan_id = await create_plan(client, _auth(token), duration_days=30)
    member = await create_member(client, _auth(token), plan_id=plan_id, duration_days=30)

    # Dos renovaciones encadenadas sobre la membresía inicial
    for _ in range(2):
        r = await client.post("/api/v1/member-plans/charge", json={
            "member_id": member["id"], "plan_id": str(plan_id), "method": "cash",
        }, headers=_auth(token, uuid.uuid4().hex))
        assert r.status_code == 200, r.text

    memberships = (await client.get(
        f"/api/v1/members/{member['id']}/memberships", headers=_auth(token)
    )).json()
    vivas = sorted(
        [m for m in memberships if m.get("effective_status") in ("active", "scheduled")],
        key=lambda m: m["start_date"],
    )
    assert len(vivas) == 3, vivas
    ultima_antes = vivas[-1]["start_date"]

    # Se devuelve el pago de la del medio: su vigencia desaparece
    pagos = (await client.get(f"/api/v1/members/{member['id']}/payments", headers=_auth(token))).json()
    del_medio = next(p for p in pagos if p.get("membership_id") == vivas[1]["id"])
    r = await client.post(f"/api/v1/payments/{del_medio['id']}/refund",
                          json={"reason": "El socio se arrepintió"}, headers=_auth(token))
    assert r.status_code == 200, r.text

    despues = (await client.get(
        f"/api/v1/members/{member['id']}/memberships", headers=_auth(token)
    )).json()
    vivas2 = sorted(
        [m for m in despues if m.get("effective_status") in ("active", "scheduled")],
        key=lambda m: m["start_date"],
    )
    assert len(vivas2) == 2
    assert vivas2[-1]["start_date"] < ultima_antes, (
        "la última quedó flotando en su fecha vieja: hay un hueco de vigencia"
    )
    # Sin huecos: la programada arranca justo al terminar la vigente
    from datetime import date, timedelta
    fin_primera = date.fromisoformat(vivas2[0]["end_date"])
    inicio_segunda = date.fromisoformat(vivas2[-1]["start_date"])
    assert inicio_segunda == fin_primera + timedelta(days=1)


# ─────────────────────────── Caja ───────────────────────────

async def test_closed_shift_can_be_reopened_by_owner(client):
    token = await _owner_token(client, email="ledger-caja@gym.com")
    shift_id = await _fresh_open_shift(client, token)
    closed = await client.post(f"/api/v1/cash/shifts/{shift_id}/close",
                               json={"counted_cash": 0}, headers=_auth(token))
    assert closed.status_code == 200, closed.text

    r = await client.post(f"/api/v1/cash/shifts/{shift_id}/reopen",
                          json={"reason": "Conté mal el efectivo del cierre"}, headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "open"

    history = (await client.get(
        f"/api/v1/audit/entity/cash_shift/{shift_id}", headers=_auth(token)
    )).json()
    assert "cash.reopen" in [i["action"] for i in history["items"]]


async def test_reopen_refuses_while_another_shift_is_open(client):
    token = await _owner_token(client, email="ledger-caja2@gym.com")
    shift_id = await _fresh_open_shift(client, token)
    await client.post(f"/api/v1/cash/shifts/{shift_id}/close", json={"counted_cash": 0}, headers=_auth(token))
    await client.post("/api/v1/cash/shifts/open", json={"opening_amount": 0}, headers=_auth(token))

    r = await client.post(f"/api/v1/cash/shifts/{shift_id}/reopen",
                          json={"reason": "Quiero corregir el conteo anterior"}, headers=_auth(token))
    assert r.status_code == 409, r.text


# ─────────────────────────── Auditoría ───────────────────────────

async def test_every_reversal_leaves_a_trace(client):
    token = await _owner_token(client, email="ledger-audit@gym.com")
    payment = await _paid_payment(client, token, amount=90000)
    await client.post(f"/api/v1/payments/{payment['id']}/refund",
                      json={"reason": "Devolución con rastro"}, headers=_auth(token))

    history = (await client.get(
        f"/api/v1/audit/entity/payment/{payment['id']}", headers=_auth(token)
    )).json()
    actions = [i["action"] for i in history["items"]]
    assert "payment.create" in actions
    assert "payment.refund" in actions


# ─────────────────────────── Casos que faltaban ───────────────────────────

async def test_concurrent_charges_with_the_same_key(client):
    """La carrera real: dos peticiones simultáneas pasan el chequeo con la tabla
    vacía, las dos hacen el trabajo y una revienta el commit. Los tests
    secuenciales nunca ejercen esa rama."""
    token = await _owner_token(client, email="ledger-race@gym.com")
    await _open_shift(client, token)
    plan_id = await create_plan(client, _auth(token), duration_days=30)
    member = await create_member_without_membership(client, _auth(token))
    key = uuid.uuid4().hex
    body = {"member_id": member["id"], "plan_id": str(plan_id), "method": "cash"}

    a, b = await asyncio.gather(
        client.post("/api/v1/member-plans/charge", json=body, headers=_auth(token, key)),
        client.post("/api/v1/member-plans/charge", json=body, headers=_auth(token, key)),
        return_exceptions=True,
    )
    for r in (a, b):
        assert not isinstance(r, Exception), r
        assert r.status_code == 200, r.text
    assert a.json()["membership_id"] == b.json()["membership_id"]

    memberships = (await client.get(
        f"/api/v1/members/{member['id']}/memberships", headers=_auth(token)
    )).json()
    vivas = [m for m in memberships if m.get("effective_status") in ("active", "scheduled")]
    assert len(vivas) == 1, f"la carrera dejó {len(vivas)} membresías"

    payments = (await client.get(f"/api/v1/members/{member['id']}/payments", headers=_auth(token))).json()
    assert len(payments) == 1, f"la carrera dejó {len(payments)} pagos"


async def test_scheduled_membership_moves_up_when_the_current_one_is_refunded(client):
    """Si la que se devuelve es la VIGENTE, la programada debe arrancar hoy: el
    socio no puede quedarse 30 días esperando una fecha que ya no aplica."""
    token = await _owner_token(client, email="ledger-chain2@gym.com")
    await _open_shift(client, token)
    plan_id = await create_plan(client, _auth(token), duration_days=30)
    member = await create_member_without_membership(client, _auth(token))

    # Dos cobros: el primero arranca hoy (vigente), el segundo se encadena detrás
    cobros = []
    for _ in range(2):
        r = await client.post("/api/v1/member-plans/charge", json={
            "member_id": member["id"], "plan_id": str(plan_id), "method": "cash",
        }, headers=_auth(token, uuid.uuid4().hex))
        assert r.status_code == 200, r.text
        cobros.append(r.json())

    rr = await client.post(f"/api/v1/payments/{cobros[0]['payment_id']}/refund",
                           json={"reason": "Se arrepintió el mismo día"}, headers=_auth(token))
    assert rr.status_code == 200, rr.text

    despues = (await client.get(
        f"/api/v1/members/{member['id']}/memberships", headers=_auth(token)
    )).json()
    vivas = [m for m in despues if m.get("effective_status") in ("active", "scheduled")]
    assert len(vivas) == 1
    assert vivas[0]["start_date"] == today_bogota().isoformat(), (
        f"la programada se quedó en {vivas[0]['start_date']} en vez de arrancar hoy"
    )


async def test_partial_refund_keeps_the_membership(client):
    """Con saldo vivo el socio conserva su acceso: solo la reversa total deshace
    lo que el pago respaldaba."""
    token = await _owner_token(client, email="ledger-parcial@gym.com")
    await _open_shift(client, token)
    plan_id = await create_plan(client, _auth(token), duration_days=30)
    member = await create_member_without_membership(client, _auth(token))
    r = await client.post("/api/v1/member-plans/charge", json={
        "member_id": member["id"], "plan_id": str(plan_id), "method": "cash",
    }, headers=_auth(token, uuid.uuid4().hex))
    assert r.status_code == 200, r.text
    membership_id = r.json()["membership_id"]

    rr = await client.post(f"/api/v1/payments/{r.json()['payment_id']}/refund",
                           json={"reason": "Devolución parcial", "amount": 1000}, headers=_auth(token))
    assert rr.status_code == 200, rr.text

    memberships = (await client.get(
        f"/api/v1/members/{member['id']}/memberships", headers=_auth(token)
    )).json()
    actual = next(m for m in memberships if m["id"] == membership_id)
    assert actual["effective_status"] != "cancelled", "una parcial canceló la membresía"


async def test_reopen_is_owner_only(client):
    token = await _owner_token(client, email="ledger-caja3@gym.com")
    shift_id = await _fresh_open_shift(client, token)
    await client.post(f"/api/v1/cash/shifts/{shift_id}/close", json={"counted_cash": 0}, headers=_auth(token))

    from urllib.parse import urlparse, parse_qs
    email = f"recep-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post("/api/v1/users/invite", json={
        "email": email, "full_name": "Recepcion", "role": "receptionist"}, headers=_auth(token))
    assert inv.status_code == 201, inv.text
    invite_token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    staff = (await client.post("/api/v1/auth/staff/accept-invite",
                               json={"token": invite_token, "password": "StaffPass123!"})).json()

    r = await client.post(f"/api/v1/cash/shifts/{shift_id}/reopen",
                          json={"reason": "Quiero cambiar el conteo"}, headers=_auth(staff["access_token"]))
    assert r.status_code == 403, r.text


async def test_reverse_rejects_invalid_input(client):
    token = await _owner_token(client)
    payment = await _paid_payment(client, token, amount=20000)
    bad_amount = await client.post(f"/api/v1/payments/{payment['id']}/refund",
                                   json={"reason": "Monto cero", "amount": 0}, headers=_auth(token))
    assert bad_amount.status_code == 422, bad_amount.text
    bad_kind = await client.post(f"/api/v1/payments/{payment['id']}/refund",
                                 json={"reason": "Tipo inventado", "kind": "borrar"}, headers=_auth(token))
    assert bad_kind.status_code == 422, bad_kind.text


async def test_mark_paid_rejects_non_pending(client):
    token = await _owner_token(client)
    payment = await _paid_payment(client, token, amount=15000)
    r = await client.patch(f"/api/v1/payments/{payment['id']}/mark-paid", headers=_auth(token))
    assert r.status_code == 400 and "pendientes" in r.json()["detail"]


async def test_cash_shift_balances_after_a_partial_refund(client):
    """La devolución bajó el ingreso; contarla otra vez como egreso dejaría un
    sobrante fantasma que acusa al cajero en el cierre."""
    token = await _owner_token(client, email="ledger-cuadre@gym.com")
    await _fresh_open_shift(client, token)
    payment = await _paid_payment(client, token, amount=100000)
    await client.post(f"/api/v1/payments/{payment['id']}/refund",
                      json={"reason": "Devolución parcial en efectivo", "amount": 30000},
                      headers=_auth(token))

    current = (await client.get("/api/v1/cash/shifts/current", headers=_auth(token))).json()
    assert Decimal(current["expected_cash"]) == Decimal("70000"), current
