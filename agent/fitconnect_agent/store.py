"""Memoria local del agente (SQLite): marcaciones pendientes de subir cuando
no hay internet, el cursor de eventos y, para ZKTeco por TCP, las plantillas
de quien se bloqueó (quedan en el PC del gimnasio, nunca en la nube)."""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Optional


def _locked(fn):
    def wrapper(self, *a, **kw):
        with self._lock:
            return fn(self, *a, **kw)
    return wrapper


class Store:
    def __init__(self, data_dir: str | Path):
        Path(data_dir).mkdir(parents=True, exist_ok=True)
        # Los drivers por TCP trabajan en un hilo aparte: conexión compartida con candado.
        self.db = sqlite3.connect(Path(data_dir) / "agent.db", check_same_thread=False)
        self._lock = threading.RLock()
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS templates (pin TEXT PRIMARY KEY, body TEXT NOT NULL);
            """
        )
        self.db.commit()

    @_locked
    def queue_punch(self, punch: dict) -> None:
        self.db.execute("INSERT OR IGNORE INTO outbox (id, body) VALUES (?, ?)", (punch["client_event_id"], json.dumps(punch)))
        self.db.commit()

    @_locked
    def pending_punches(self, limit: int = 500) -> list[dict]:
        rows = self.db.execute("SELECT body FROM outbox ORDER BY rowid LIMIT ?", (limit,)).fetchall()
        return [json.loads(r[0]) for r in rows]

    @_locked
    def drop_punches(self, ids: list[str]) -> None:
        self.db.executemany("DELETE FROM outbox WHERE id = ?", [(i,) for i in ids])
        self.db.commit()

    @_locked
    def get(self, key: str, default: Optional[Any] = None) -> Any:
        row = self.db.execute("SELECT v FROM kv WHERE k = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    @_locked
    def set(self, key: str, value: Any) -> None:
        self.db.execute("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", (key, json.dumps(value)))
        self.db.commit()

    @_locked
    def save_templates(self, pin: str, body: dict) -> None:
        self.db.execute("INSERT OR REPLACE INTO templates (pin, body) VALUES (?, ?)", (pin, json.dumps(body)))
        self.db.commit()

    @_locked
    def pop_templates(self, pin: str) -> Optional[dict]:
        row = self.db.execute("SELECT body FROM templates WHERE pin = ?", (pin,)).fetchone()
        if row:
            self.db.execute("DELETE FROM templates WHERE pin = ?", (pin,))
            self.db.commit()
            return json.loads(row[0])
        return None
