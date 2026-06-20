from app.core.logging import mask_pii


def test_mask_pii_hides_bearer_and_numbers():
    masked = mask_pii("Authorization: Bearer abc.def-123 cedula 1098765432")
    assert "abc.def-123" not in masked
    assert "1098765432" not in masked
    assert "Bearer ***" in masked


async def test_health_reports_dependencies(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "dependencies" in body
    assert "database" in body["dependencies"]
    assert body["dependencies"]["database"] == "ok"


async def test_request_id_header_present(client):
    r = await client.get("/health")
    assert r.headers.get("x-request-id")
