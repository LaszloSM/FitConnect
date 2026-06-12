"""Broker de eventos en memoria para SSE (un solo proceso, igual que APScheduler).

La recepción se suscribe por tenant (db_name) y el check-in publica eventos.
Si algún día hay >1 worker, este módulo se reemplaza por Redis pub/sub
manteniendo la misma interfaz publish/subscribe.
"""
import asyncio
from collections import defaultdict

_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)


def publish(db_name: str, event: dict) -> None:
    for queue in list(_subscribers.get(db_name, ())):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            # Suscriptor colgado: se descarta el evento para no bloquear el check-in
            pass


def subscribe(db_name: str) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers[db_name].add(queue)
    return queue


def unsubscribe(db_name: str, queue: asyncio.Queue) -> None:
    _subscribers[db_name].discard(queue)
    if not _subscribers[db_name]:
        _subscribers.pop(db_name, None)
