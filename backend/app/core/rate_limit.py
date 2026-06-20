"""Rate limiting configuration."""
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def client_ip(request: Request) -> str:
    """IP del cliente para rate limiting. Detrás del ALB, request.client.host es el
    balanceador (todos los usuarios compartirían un solo bucket); el cliente real
    es el primer IP de X-Forwarded-For. Es la convención estándar para throttling
    (mitigación de fuerza bruta), no para autorización.

    Pendiente (follow-up): clave compuesta ip+email en login para frenar credential
    stuffing distribuido. slowapi 0.1.9 usa key_func síncrono y evalúa la clave
    antes de parsear el body, así que requiere middleware propio; queda fuera de
    esta fase.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)
