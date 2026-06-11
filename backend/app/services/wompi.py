import hashlib
import hmac

import httpx

from app.core.config import settings


class WompiClient:
    """Cliente mínimo de Wompi (sandbox por defecto). Las llaves vienen por gym."""

    def __init__(self, public_key: str | None, private_key: str | None, base_url: str | None = None):
        self.public_key = public_key
        self.private_key = private_key
        self.base_url = base_url or settings.wompi_api_url

    async def create_payment_link(
        self,
        *,
        name: str,
        description: str,
        amount_in_cents: int,
        reference: str,
        redirect_url: str | None = None,
        currency: str = "COP",
    ) -> dict:
        payload = {
            "name": name,
            "description": description,
            "single_use": True,
            "collect_shipping": False,
            "currency": currency,
            "amount_in_cents": amount_in_cents,
            "reference": reference,
        }
        if redirect_url:
            payload["redirect_url"] = redirect_url
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{self.base_url}/payment_links",
                json=payload,
                headers={"Authorization": f"Bearer {self.private_key}"},
            )
            resp.raise_for_status()
            return resp.json()["data"]

    async def get_transaction(self, transaction_id: str) -> dict | None:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{self.base_url}/transactions/{transaction_id}",
                headers={"Authorization": f"Bearer {self.private_key}"},
            )
            if resp.status_code != 200:
                return None
            return resp.json().get("data")

    async def find_transaction_by_reference(self, reference: str) -> dict | None:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{self.base_url}/transactions",
                params={"reference": reference},
                headers={"Authorization": f"Bearer {self.private_key}"},
            )
            if resp.status_code != 200:
                return None
            items = resp.json().get("data") or []
            return items[0] if items else None


def verify_event_signature(body: dict, events_secret: str) -> bool:
    """Valida la firma del webhook: SHA256 de los valores de signature.properties
    (en orden) concatenados con el timestamp y el events_secret."""
    try:
        signature = body["signature"]
        properties = signature["properties"]
        checksum = signature["checksum"]
        timestamp = str(body["timestamp"])
    except (KeyError, TypeError):
        return False

    data = body.get("data", {})
    concatenated = ""
    for prop in properties:
        # prop es del tipo "transaction.amount_in_cents" — navegar el dict.
        value = data
        for part in prop.split("."):
            value = value.get(part) if isinstance(value, dict) else None
        concatenated += str(value)
    concatenated += timestamp + events_secret
    computed = hashlib.sha256(concatenated.encode()).hexdigest()
    return hmac.compare_digest(computed.upper(), str(checksum).upper())
