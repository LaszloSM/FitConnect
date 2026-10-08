"""
Test that auth endpoints enforce rate limiting.
Note: These are unit-level structure tests. Integration rate limit testing
requires a running server — see the comment in each test.
"""
from app.main import app
from slowapi import Limiter


def test_limiter_is_configured():
    """App must have a slowapi Limiter attached."""
    assert hasattr(app.state, "limiter"), "app.state.limiter not set — rate limiting not configured"
    assert isinstance(app.state.limiter, Limiter)


def test_limiter_uses_client_ip():
    """Limiter debe usar la IP del cliente (XFF-aware detrás del ALB)."""
    from app.core.rate_limit import client_ip
    assert app.state.limiter._key_func == client_ip


def _req(peer, xff=None):
    class _Client:
        host = peer

    class _Req:
        client = _Client()
        headers = {"x-forwarded-for": xff} if xff else {}

    return _Req()


def test_client_ip_takes_what_the_proxy_appended():
    """Detrás del proxy, el cliente real es el último valor externo de X-Forwarded-For."""
    from app.core.rate_limit import client_ip
    assert client_ip(_req("10.0.0.5", "181.49.10.20")) == "181.49.10.20"
    assert client_ip(_req("10.0.0.5", "181.49.10.20, 10.0.0.1")) == "181.49.10.20"


def test_client_ip_cannot_be_spoofed_with_the_header():
    """Lo de la izquierda lo escribe el cliente: no debe servir para hacerse pasar por otra IP."""
    from app.core.rate_limit import client_ip
    assert client_ip(_req("10.0.0.5", "8.8.4.4, 186.80.1.2")) == "186.80.1.2"
    # Conexión directa (sin proxy interno): la cabecera se ignora.
    assert client_ip(_req("186.80.1.2", "8.8.4.4")) == "186.80.1.2"
