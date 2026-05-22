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


def test_limiter_uses_remote_address():
    """Limiter must use IP-based rate limiting."""
    from slowapi.util import get_remote_address
    assert app.state.limiter._key_func == get_remote_address
