"""Créditos para planes con IA. Libro que solo agrega filas: el saldo es la
suma, y cada movimiento lleva una referencia única para que reintentar no lo
duplique (`uq_credit_ref`).

Movimientos: `welcome` (una vez), `weekly` (uno por semana ISO, se entrega
al consultar el saldo), `spend` (al pedir un plan con IA), `refund` (si el
pedido terminó en un plan automático). `ad` y `purchase` quedan reservados
para cuando existan anuncios y compras.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.timeutil import today_bogota
from app.models.app import CreditEntry


class NoCredits(Exception):
    pass


def week_ref(day: date) -> str:
    y, w, _ = day.isocalendar()
    return f"{y}-W{w:02d}"


async def _add(adb: AsyncSession, user_id, kind: str, amount: int, ref: str) -> bool:
    """True si el movimiento es nuevo. Usa un savepoint para no tumbar la
    transacción de quien llama si el movimiento ya existía."""
    try:
        async with adb.begin_nested():
            adb.add(CreditEntry(app_user_id=user_id, kind=kind, amount=amount, ref=ref))
        return True
    except IntegrityError:
        return False


async def ensure_grants(adb: AsyncSession, user_id) -> None:
    await _add(adb, user_id, "welcome", settings.plan_welcome_credits, "welcome")
    await _add(adb, user_id, "weekly", settings.plan_free_weekly, week_ref(today_bogota()))


async def balance(adb: AsyncSession, user_id) -> int:
    await ensure_grants(adb, user_id)
    return int((await adb.execute(select(func.coalesce(func.sum(CreditEntry.amount), 0))
                                  .where(CreditEntry.app_user_id == user_id))).scalar() or 0)


async def spend(adb: AsyncSession, user_id, job_ref: str) -> None:
    if await balance(adb, user_id) <= 0:
        raise NoCredits()
    await _add(adb, user_id, "spend", -1, job_ref)


async def refund(adb: AsyncSession, user_id, job_ref: str) -> None:
    """Solo devuelve lo que se cobró, y una sola vez."""
    spent = (await adb.execute(select(CreditEntry.id).where(
        CreditEntry.app_user_id == user_id, CreditEntry.kind == "spend", CreditEntry.ref == job_ref))).first()
    if spent:
        await _add(adb, user_id, "refund", 1, job_ref)


async def summary(adb: AsyncSession, user_id) -> dict:
    bal = await balance(adb, user_id)
    rows = (await adb.execute(select(CreditEntry).where(CreditEntry.app_user_id == user_id)
                              .order_by(CreditEntry.created_at.desc()).limit(30))).scalars().all()
    today = today_bogota()
    next_monday = today + timedelta(days=7 - today.weekday())
    labels = {"welcome": "Bienvenida", "weekly": "Recarga semanal gratis", "spend": "Plan con IA",
              "refund": "Devuelto: el plan salió automático", "ad": "Anuncio", "purchase": "Compra"}
    return {
        "balance": bal, "weekly_free": settings.plan_free_weekly, "next_refill": next_monday.isoformat(),
        "history": [{"kind": r.kind, "label": labels.get(r.kind, r.kind), "amount": r.amount,
                     "at": r.created_at.isoformat()} for r in rows],
    }
