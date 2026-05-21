import pytest
import inspect
from app.api.deps import get_tenant_db_from_token

def test_get_tenant_db_from_token_is_async_generator():
    """get_tenant_db_from_token must be an async generator function so FastAPI can call close() for cleanup."""
    assert inspect.isasyncgenfunction(get_tenant_db_from_token), (
        "get_tenant_db_from_token must be an async generator function "
        "so FastAPI can call __anext__ and then close() for cleanup"
    )
