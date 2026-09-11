"""Una sola fuente de verdad para "a esta máquina le toca mantenimiento".

La regla vivía duplicada en `jobs.py` (Python) y en `MachinesClient.tsx`
(TypeScript). Dos implementaciones de lo mismo divergen solas: la del job ya
saltaba las retiradas y la de la pantalla no, así que el panel mostraba en rojo
máquinas que a nadie le iban a avisar.
"""
from dataclasses import dataclass
from datetime import date, timedelta

from app.models.tenant.machine import Machine, MachineStatus

#: Con cuántos días de anticipación se avisa. Enterarse el día que vence es
#: enterarse tarde: repuestos y técnico no aparecen en la misma tarde.
PREAVISO_DIAS = 7


@dataclass(frozen=True)
class MaintenanceState:
    next_date: date | None
    is_overdue: bool
    is_due_soon: bool
    #: Negativo = ya venció hace tantos días.
    days_until: int | None


def maintenance_state(machine: Machine, today: date) -> MaintenanceState:
    """Sin intervalo configurado no hay preventivo que vigilar.

    Una máquina retirada tampoco: sigue en la lista para consultar su historial,
    pero no genera alertas ni se pinta en rojo.
    """
    if not machine.maintenance_interval_days or machine.status == MachineStatus.retired:
        return MaintenanceState(None, False, False, None)

    if machine.last_maintenance_date is None:
        # Nunca se le hizo: vencida desde hoy, no "vencida hace años".
        return MaintenanceState(today, True, False, 0)

    proxima = machine.last_maintenance_date + timedelta(days=machine.maintenance_interval_days)
    faltan = (proxima - today).days
    return MaintenanceState(
        next_date=proxima,
        is_overdue=faltan <= 0,
        is_due_soon=0 < faltan <= PREAVISO_DIAS,
        days_until=faltan,
    )
