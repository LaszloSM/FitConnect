"""Cliente de la nube de LSMFit (solo conexiones salientes por HTTPS)."""
from __future__ import annotations

from typing import Any, Optional

import httpx


class Cloud:
    def __init__(self, base_url: str, token: str, transport: Optional[httpx.AsyncBaseTransport] = None):
        self.http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"), timeout=20, transport=transport,
            headers={"Authorization": f"Bearer {token}", "User-Agent": "lsmfit-agent/0.1"},
        )

    async def close(self) -> None:
        await self.http.aclose()

    async def heartbeat(self) -> dict:
        r = await self.http.post("/api/v1/access/heartbeat", json={})
        r.raise_for_status()
        return r.json()

    async def commands(self) -> list[dict]:
        r = await self.http.get("/api/v1/access/agent/commands")
        r.raise_for_status()
        return r.json()

    async def result(self, command_id: str, ok: bool, error: Optional[str] = None, result: Optional[dict] = None) -> None:
        r = await self.http.post(f"/api/v1/access/agent/commands/{command_id}/result",
                                 json={"ok": ok, "error": (error or "")[:500] or None, "result": result})
        r.raise_for_status()

    async def punches(self, events: list[dict]) -> dict:
        r = await self.http.post("/api/v1/access/agent/punches", json={"events": events})
        r.raise_for_status()
        return r.json()

    async def roster(self, users: list[dict], full: bool = True) -> dict:
        r = await self.http.post("/api/v1/access/agent/roster", json={"users": users, "full": full})
        r.raise_for_status()
        return r.json()

    async def template(self, pin: str, kind: str) -> Any:
        body = {"pin": pin, "has_face": kind == "face", "fingerprints": 1 if kind == "fingerprint" else None}
        r = await self.http.post("/api/v1/access/agent/templates", json=body)
        r.raise_for_status()
        return r.json()
