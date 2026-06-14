import httpx

WHATSAPP_API_URL = "https://graph.facebook.com/v18.0"

# Plantillas que el gym debe crear y aprobar en su WhatsApp Business (es_CO).
# recordatorio_vencimiento / recordatorio_vencido reciben 4 parámetros:
# {{1}} nombre, {{2}} plan, {{3}} fecha de vencimiento, {{4}} link de pago o "en recepción"
TEMPLATES = {
    "membership.expiring": "recordatorio_vencimiento",
    "membership.overdue": "recordatorio_vencido",
    "payment.confirmed": "confirmacion_pago",
    "payment.link_created": "link_de_pago",
    "member.birthday": "cumpleanos",
    "member.winback": "te_extranamos",
}


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
