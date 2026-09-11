"""Idempotencia de las escrituras de dinero.

El patrón ya estaba en el repo cuatro veces bien hecho (`WebhookEvent.event_id`,
`NotificationOutbox.idempotency_key`, el recibo por `payment_id`, el link de
pago), pero justo donde está el 95% del volumen —el mostrador— no existía: dos
clics en "Cobrar" creaban dos pagos, dos recibos y dos membresías encadenadas.

Cómo funciona la carrera: no se reserva la clave por adelantado (dentro de una
transacción abierta el otro request no la vería). Se hace el trabajo y se
confirma con la clave en el mismo commit; si otra petición ya ganó, la unicidad
de `key` revienta el commit, se deshace TODO el trabajo y se devuelve la
respuesta del ganador. Nunca quedan dos cobros.
"""
import hashlib
import json
import uuid
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import utcnow_naive
from app.models.tenant.idempotency import IdempotencyKey

HEADER = "Idempotency-Key"
# Ventana de reintento: pasado ese tiempo la clave se purga en el job diario.
RETENTION_HOURS = 24


def _hash(payload: Any) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()


class Idempotent:
    """Guarda de una escritura. `replayed` trae la respuesta ya emitida."""

    def __init__(self, db: AsyncSession, request: Request, endpoint: str, payload: Any):
        self.db = db
        self.endpoint = endpoint
        self.request_hash = _hash(payload)
        raw = (request.headers.get(HEADER) if request else None) or ""
        raw = raw.strip()
        if len(raw) > 64:
            # Truncar colapsaría dos claves distintas en una y devolvería el cobro
            # de otra operación como si fuera este.
            raise HTTPException(status_code=400, detail="Idempotency-Key demasiado larga (máximo 64)")
        self.key = raw or None
        self.replayed: dict | None = None

    async def check(self) -> dict | None:
        """Respuesta ya emitida para esta clave, o None si es la primera vez."""
        if not self.key:
            return None
        row = (await self.db.execute(
            select(IdempotencyKey).where(IdempotencyKey.key == self.key)
        )).scalar_one_or_none()
        if row is None:
            return None
        if row.endpoint != self.endpoint or row.request_hash != self.request_hash:
            raise HTTPException(
                status_code=409,
                detail="Esta clave de idempotencia ya se usó para otra operación",
            )
        self.replayed = row.response
        return row.response

    def remember(self, response: Any, status_code: int = 200) -> None:
        """Registra la respuesta en la MISMA transacción que el trabajo."""
        if not self.key:
            return
        self.db.add(IdempotencyKey(
            key=self.key,
            endpoint=self.endpoint,
            request_hash=self.request_hash,
            status_code=status_code,
            response=jsonable(response),
        ))

    async def commit(self) -> dict | None:
        """Confirma. Si otra petición con la misma clave ganó la carrera, deshace
        todo y devuelve la respuesta del ganador."""
        try:
            await self.db.commit()
            return None
        except IntegrityError as exc:
            await self.db.rollback()
            if not self.key or not _is_key_conflict(exc):
                # Otra restricción (referencia de transferencia, sku, FK) es un
                # fallo real: tragárselo devolvería 201 sobre un cobro que no existe.
                raise
            winner = (await self.db.execute(
                select(IdempotencyKey).where(IdempotencyKey.key == self.key)
            )).scalar_one_or_none()
            if winner is None or winner.request_hash != self.request_hash:
                raise
            self.replayed = winner.response
            return winner.response


def _is_key_conflict(exc: IntegrityError) -> bool:
    diag = getattr(getattr(exc, "orig", None), "diag", None)
    constraint = getattr(diag, "constraint_name", None)
    if constraint:
        return constraint == "uq_idempotency_key"
    return "uq_idempotency_key" in str(exc.orig or exc)


def jsonable(value: Any) -> Any:
    from fastapi.encoders import jsonable_encoder
    return jsonable_encoder(value)


async def purge_expired_keys(db: AsyncSession) -> int:
    """Las claves solo sirven para la ventana de reintento."""
    from datetime import timedelta
    from sqlalchemy import delete

    cutoff = utcnow_naive() - timedelta(hours=RETENTION_HOURS)
    result = await db.execute(
        delete(IdempotencyKey).where(IdempotencyKey.created_at < cutoff)
    )
    return result.rowcount or 0


def new_key() -> str:
    return uuid.uuid4().hex
