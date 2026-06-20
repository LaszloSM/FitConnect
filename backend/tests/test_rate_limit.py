"""
Test that auth endpoints enforce rate limiting.
Note: These are unit-level structure tests. Integration rate limit testing
requires a running server — see the comment in each test.
"""
import pytest
from app.main import app
from app.core.rate_limit import limiter
from slowapi import Limiter


def test_limiter_is_configured():
    """App must have a slowapi Limiter attached."""
    assert hasattr(app.state, "limiter"), "app.state.limiter not set — rate limiting not configured"
    assert isinstance(app.state.limiter, Limiter)


def test_limiter_uses_client_ip():
    """Limiter debe usar la IP del cliente (XFF-aware detrás del ALB)."""
    from app.core.rate_limit import client_ip
    assert app.state.limiter._key_func == client_ip


def test_client_ip_prefers_forwarded_for():
    """Detrás del proxy, la IP real es el primer valor de X-Forwarded-For."""
    from app.core.rate_limit import client_ip

    class _Req:
        headers = {"x-forwarded-for": "203.0.113.7, 10.0.0.1"}

    assert client_ip(_Req()) == "203.0.113.7"
