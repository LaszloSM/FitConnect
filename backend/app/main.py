import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.logging import setup_logging, request_id_ctx
from app.core.rate_limit import limiter
from app.api.v1.router import router as api_router
from app.services.scheduler import start_scheduler, stop_scheduler

setup_logging(settings.log_level)

# Sentry opcional: solo se activa si hay DSN (no exige cuenta ni la dependencia).
if settings.sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment, traces_sample_rate=0.1)
    except ImportError:
        logging.getLogger(__name__).warning("SENTRY_DSN seteado pero sentry-sdk no está instalado")


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="SaaS Gym API",
    version="1.0.0",
    docs_url="/docs" if settings.environment == "development" else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Correlation id por request: respeta un X-Request-ID entrante (del ALB) o
    genera uno; lo expone en el contexto de logging y en la respuesta."""
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex
    token = request_id_ctx.set(rid)
    try:
        response = await call_next(request)
    finally:
        request_id_ctx.reset(token)
    response.headers["X-Request-ID"] = rid
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health():
    """Healthcheck con dependencias críticas (DB master + Redis), no solo 'ok'."""
    from sqlalchemy import text
    from app.db.master_session import master_engine

    deps: dict[str, str] = {}
    try:
        async with master_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        deps["database"] = "ok"
    except Exception:
        deps["database"] = "error"

    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        deps["redis"] = "ok"
    except Exception:
        deps["redis"] = "error"

    from app.services.scheduler import scheduler
    healthy = all(v == "ok" for v in deps.values())
    return {
        "status": "ok" if healthy else "degraded",
        "dependencies": deps,
        "scheduler_running": scheduler.running,
    }
