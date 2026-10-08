"""Rate limiting configuration."""
import ipaddress

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _is_internal(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return addr.is_private or addr.is_loopback or addr.is_link_local


def client_ip(request: Request) -> str:
    """IP real del cliente, sirve para rate limiting y para listas de IPs permitidas.

    Detrás del proxy (Caddy o el ALB), `request.client.host` es el proxy y el cliente
    real es lo que el proxy AGREGÓ al final de X-Forwarded-For. Lo que viene a la
    izquierda lo escribe el propio cliente: tomar el primero dejaba falsificar la IP
    con una cabecera. Por eso se recorre de derecha a izquierda saltando las IPs de
    la red interna (los proxies), y si la conexión no viene de un proxy interno se
    ignora la cabecera.
    """
    peer = get_remote_address(request)
    xff = request.headers.get("x-forwarded-for")
    if not xff or not _is_internal(peer):
        return peer
    hops = [h.strip() for h in xff.split(",") if h.strip()]
    for hop in reversed(hops):
        if not _is_internal(hop):
            return hop
    return hops[0] if hops else peer


limiter = Limiter(key_func=client_ip)
