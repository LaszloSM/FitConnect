"""Ninguna mutación del panel puede nacer sin permiso, y la matriz no puede prometer
capacidades que nadie exige.

`member_plans.py` estuvo meses sin un solo control de rol: recepción podía cambiar
el precio de un plan y borrarlo. El agujero no lo abrió nadie a propósito — un
router nuevo simplemente nace con `get_current_staff` y ya. Este test enumera las
rutas reales de la app y falla si aparece otro.
"""
import re
from pathlib import Path

import pytest

from app.main import app
from app.core import permissions as perm

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}

# Rutas públicas (sin principal) o del socio.
EXEMPT_PREFIXES = (
    "/api/v1/auth/",
    "/api/v1/webhooks/",
    "/api/v1/public/",
)

# Excepciones justificadas, una por una. Añadir aquí exige explicar por qué.
EXEMPT_PATHS = {
    # El staff edita su propio perfil y sus preferencias: no hay nada que autorizar.
    ("PATCH", "/api/v1/settings/profile"),
    ("PATCH", "/api/v1/settings/notifications"),
    # Marcar como leídas las notificaciones propias.
    ("POST", "/api/v1/notifications/mark-all-read"),
    ("POST", "/api/v1/notifications/{notification_id}/read"),
    # El tour de onboarding es estado de UI del propio usuario.
    ("POST", "/api/v1/onboarding/tour-complete"),
    # Token SSE de corta vida para la sesión del propio staff.
    ("POST", "/api/v1/realtime/token"),
}


def _device_authenticated(route) -> bool:
    """Endpoints del kiosko: los autentica el token del dispositivo, no un staff."""
    return any(
        getattr(dep.call, "__name__", "") in {"get_kiosk_payload", "get_kiosk_db"}
        for dep in route.dependant.dependencies
    ) or any(
        getattr(sub.call, "__name__", "") in {"get_kiosk_payload", "get_kiosk_db"}
        for dep in route.dependant.dependencies for sub in dep.dependencies
    )


def _guarded_perms(route) -> set[str]:
    """Capacidades exigidas por una ruta (dependencias del router + del endpoint)."""
    found: set[str] = set()
    for dep in route.dependant.dependencies:
        call = getattr(dep, "call", None)
        closure = getattr(call, "__closure__", None) or ()
        for cell in closure:
            value = cell.cell_contents
            if isinstance(value, tuple) and value and all(isinstance(v, str) for v in value):
                found.update(value)
    return found


def _staff_routes():
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api/v1/"):
            continue
        for method in getattr(route, "methods", set()) & MUTATING:
            if path.startswith(EXEMPT_PREFIXES) or (method, path) in EXEMPT_PATHS:
                continue
            if _device_authenticated(route):
                continue
            yield method, path, route


def test_every_mutation_requires_a_permission():
    unguarded = [
        f"{method} {path}"
        for method, path, route in _staff_routes()
        if not _guarded_perms(route)
    ]
    assert not unguarded, (
        "Mutaciones sin require_perm (si es intencional, añádelas a EXEMPT_PATHS "
        "con su motivo):\n  " + "\n  ".join(sorted(unguarded))
    )


def _declared_permissions() -> set[str]:
    src = Path(perm.__file__).read_text(encoding="utf-8")
    return set(re.findall(r'^[A-Z_]+ = "([a-z_]+\.[a-z_]+)"', src, re.M))


def _enforced_permissions() -> set[str]:
    enforced: set[str] = set()
    for route in app.routes:
        if getattr(route, "path", "").startswith("/api/v1/"):
            enforced |= _guarded_perms(route)
    return enforced


def test_matrix_declares_no_unenforced_permission():
    """Una capacidad declarada que ningún endpoint exige describe una política
    que no existe: el dueño lee la matriz y cree estar protegido."""
    orphans = _declared_permissions() - _enforced_permissions()
    assert not orphans, f"Capacidades declaradas que nadie exige: {sorted(orphans)}"


def test_every_enforced_permission_is_declared():
    unknown = _enforced_permissions() - _declared_permissions()
    assert not unknown, f"Capacidades exigidas pero no declaradas: {sorted(unknown)}"


@pytest.mark.parametrize("role", list(perm.ROLE_PERMISSIONS))
def test_role_permissions_are_subset_of_declared(role):
    unknown = perm.ROLE_PERMISSIONS[role] - _declared_permissions()
    assert not unknown, f"{role.value} tiene capacidades inexistentes: {sorted(unknown)}"
