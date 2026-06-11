from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

# Los timestamps se guardan en UTC; los cortes de día del negocio
# (expiración, caja, "hoy") se calculan en hora de Bogotá.
BOGOTA = ZoneInfo("America/Bogota")


def now_bogota() -> datetime:
    return datetime.now(BOGOTA)


def utcnow_naive() -> datetime:
    """UTC naive — para comparar contra created_at (server_default now() en UTC)."""
    return datetime.now(ZoneInfo("UTC")).replace(tzinfo=None)


def today_bogota() -> date:
    return now_bogota().date()


def utc_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Inicio y fin (exclusivo) de un día de Bogotá expresados en UTC naive,
    para filtrar columnas created_at almacenadas sin timezone."""
    start = datetime(day.year, day.month, day.day, tzinfo=BOGOTA)
    end = start + timedelta(days=1)
    utc = ZoneInfo("UTC")
    return start.astimezone(utc).replace(tzinfo=None), end.astimezone(utc).replace(tzinfo=None)
