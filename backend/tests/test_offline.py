"""Recepción sin conexión: copia para decidir, lote de entradas idempotente y
reenvío del alta y del cobro sin duplicar."""
import uuid
from datetime import datetime, timedelta, timezone

from tests.helpers import create_member, create_member_without_membership, create_plan, full_member_fields
from tests.test_users import create_owner_token


def _h(token, key=None):
    h = {"Authorization": f"Bearer {token}"}
    if key:
        h["Idempotency-Key"] = key
    return h


async def test_snapshot_has_status_and_no_personal_contact_data(client):
    token = await create_owner_token(client)
    ok = await create_member(client, _h(token))
    gone = await create_member_without_membership(client, _h(token))
    r = await client.get("/api/v1/offline/snapshot", headers=_h(token))
    assert r.status_code == 200, r.text
    snap = r.json()
    by_id = {m["id"]: m for m in snap["members"]}
    assert by_id[ok["id"]]["status"] == "ok" and by_id[ok["id"]]["id_number"] == ok["id_number"]
    assert by_id[gone["id"]]["status"] == "no_membership"
    assert ok["phone"] not in r.text and ok["email"] not in r.text
    assert snap["plans"] and {"id", "price", "duration_days"} <= set(snap["plans"][0])


async def test_offline_checkins_are_idempotent_and_flag_review(client):
    token = await create_owner_token(client)
    ok = await create_member(client, _h(token))
    gone = await create_member_without_membership(client, _h(token))
    at = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    ev_ok = {"client_event_id": uuid.uuid4().hex, "member_id": ok["id"], "occurred_at": at, "decision": "allowed"}
    ev_gone = {"client_event_id": uuid.uuid4().hex, "member_id": gone["id"], "occurred_at": at, "decision": "allowed"}
    r = await client.post("/api/v1/offline/checkins", json={"events": [ev_ok, ev_gone]}, headers=_h(token))
    assert r.status_code == 200, r.text
    res = {x["client_event_id"]: x for x in r.json()["results"]}
    assert res[ev_ok["client_event_id"]]["result"] == "ok"
    assert res[ev_gone["client_event_id"]]["result"] == "review"

    again = await client.post("/api/v1/offline/checkins", json={"events": [ev_ok]}, headers=_h(token))
    assert again.json()["results"][0]["result"] == "duplicate"

    history = (await client.get(f"/api/v1/checkins?member_id={ok['id']}", headers=_h(token))).json()
    mine = [c for c in history if c["member_id"] == ok["id"] and c.get("source") == "offline"]
    assert len(mine) == 1, "una sola entrada aunque el lote se reenvíe"


async def test_offline_rejects_impossible_clock(client):
    token = await create_owner_token(client)
    ok = await create_member(client, _h(token))
    future = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    r = await client.post("/api/v1/offline/checkins", json={"events": [{
        "client_event_id": uuid.uuid4().hex, "member_id": ok["id"], "occurred_at": future, "decision": "allowed"}]},
        headers=_h(token))
    assert r.json()["results"][0]["result"] == "rejected"


async def test_member_create_replayed_with_same_key_does_not_duplicate(client):
    token = await create_owner_token(client)
    plan_id = await create_plan(client, _h(token))
    payload = full_member_fields() | {"plan_id": plan_id}
    key = uuid.uuid4().hex
    first = await client.post("/api/v1/members", json=payload, headers=_h(token, key))
    assert first.status_code == 201, first.text
    second = await client.post("/api/v1/members", json=payload, headers=_h(token, key))
    assert second.status_code in (200, 201), second.text
    assert second.json()["id"] == first.json()["id"]
    # Sin clave, la misma cédula sigue siendo un choque real.
    third = await client.post("/api/v1/members", json=payload, headers=_h(token))
    assert third.status_code in (400, 409)
