import httpx

WHATSAPP_API_URL = "https://graph.facebook.com/v18.0"

# Los nombres de plantilla viven en `message_occasions.py` (sugeridos) y en
# `message_templates.meta_template_name` (el que el gym tiene aprobado). Aquí
# quedaba un segundo catálogo con claves distintas que nadie reconciliaba, y una
# entrada —link_de_pago— que ningún emisor usó jamás.


def normalize_phone(phone: str | None) -> str | None:
    """Normaliza a E.164 colombiano (+57XXXXXXXXXX) cuando es posible."""
    if not phone:
        return None
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("57") and len(digits) == 12:
        return f"+{digits}"
    if len(digits) == 10 and digits.startswith("3"):
        return f"+57{digits}"
    if phone.startswith("+"):
        return phone
    return None


async def send_template(
    *,
    phone_number_id: str,
    access_token: str,
    to: str,
    template_name: str,
    params: list[str],
    lang: str = "es_CO",
) -> None:
    """Envía un mensaje de plantilla por WhatsApp Cloud API. Lanza en error."""
    payload = {
        "messaging_product": "whatsapp",
        "to": to.lstrip("+"),
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": lang},
            "components": [{
                "type": "body",
                "parameters": [{"type": "text", "text": str(p)} for p in params],
            }],
        },
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{WHATSAPP_API_URL}/{phone_number_id}/messages",
            json=payload,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
