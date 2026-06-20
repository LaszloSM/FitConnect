"""Logging estructurado en JSON + correlación por request.

Sin dependencias nuevas: formatter JSON con stdlib. Cada línea lleva el
`request_id` del request en curso (propagado por el middleware en main.py), para
poder correlacionar logs de una misma petición en CloudWatch/Sentry.
"""
import json
import logging
import re
from contextvars import ContextVar

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)

# Enmascarado de PII/secretos en mensajes de log (cédulas, teléfonos, tokens,
# Authorization headers). No es infalible, pero evita filtrar lo obvio.
_PII_PATTERNS = [
    (re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+", re.IGNORECASE), r"\1***"),
    (re.compile(r"\b\d{7,12}\b"), "***"),  # cédulas / teléfonos
]


def mask_pii(text: str) -> str:
    for pattern, repl in _PII_PATTERNS:
        text = pattern.sub(repl, text)
    return text


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "msg": mask_pii(record.getMessage()),
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
        }
        rid = request_id_ctx.get()
        if rid:
            payload["request_id"] = rid
        if record.exc_info:
            payload["exc"] = mask_pii(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    # uvicorn trae sus propios handlers; los alineamos al formato JSON.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = [handler]
        lg.propagate = False
