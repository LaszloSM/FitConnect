"""Registro en memoria de la última corrida de cada job del scheduler.

Single-process (igual que el scheduler y el broker SSE): con varias réplicas
cada una reporta lo suyo. Sirve para responder "¿el job corrió y cuándo?" desde
/health sin depender de una tabla ni de logs externos."""
from dataclasses import dataclass
from typing import Optional

from app.core.timeutil import now_bogota


@dataclass
class JobRun:
    name: str
    started_at: str
    finished_at: Optional[str] = None
    status: str = "running"  # running | ok | skipped | error
    duration_s: Optional[float] = None
    detail: Optional[str] = None


_last_runs: dict[str, JobRun] = {}


def record_start(name: str) -> JobRun:
    run = JobRun(name=name, started_at=now_bogota().isoformat())
    _last_runs[name] = run
    return run


def record_end(run: JobRun, status: str, detail: Optional[str] = None) -> None:
    end = now_bogota()
    run.finished_at = end.isoformat()
    run.status = status
    run.detail = detail
    try:
        from datetime import datetime
        run.duration_s = round(
            (end - datetime.fromisoformat(run.started_at)).total_seconds(), 2
        )
    except Exception:  # noqa: BLE001
        run.duration_s = None


def snapshot() -> list[dict]:
    return [vars(r) for r in _last_runs.values()]
