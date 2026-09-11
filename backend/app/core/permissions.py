"""Matriz declarativa de permisos por rol.

Antes, cada endpoint decidía por su cuenta con `require_role(...)` y los que se
olvidaban de hacerlo quedaban abiertos a cualquier staff autenticado (recepción
podía cambiar el precio de un plan y borrarlo). Aquí la política se lee de una
sola tabla y añadir un rol nuevo no obliga a revisar router por router.
"""
from app.models.tenant.user_staff import UserRole

# ── Capacidades ───────────────────────────────────────────────────────────────
# Convención: "<recurso>.<acción>". `read` es consulta; `write` es alta/edición;
# las acciones sensibles (reverse, close, secrets) van separadas a propósito.

PAYMENTS_READ = "payments.read"
PAYMENTS_WRITE = "payments.write"
PAYMENTS_CONFIRM = "payments.confirm"
PAYMENTS_REVERSE = "payments.reverse"

CASH_READ = "cash.read"
CASH_OPEN = "cash.open"
CASH_CLOSE = "cash.close"
CASH_EXPENSE = "cash.expense"
CASH_REOPEN = "cash.reopen"

PLANS_READ = "plans.read"
PLANS_WRITE = "plans.write"

MEMBERS_READ = "members.read"
MEMBERS_WRITE = "members.write"
MEMBERS_DELETE = "members.delete"
MEMBERS_IMPORT = "members.import"

MEMBERSHIPS_WRITE = "memberships.write"

DAY_PASSES_SELL = "day_passes.sell"
DAY_PASSES_WRITE = "day_passes.write"

PRODUCTS_READ = "products.read"
PRODUCTS_WRITE = "products.write"
STOCK_MOVEMENT = "stock.movement"   # entradas de inventario; mermas se filtran en el handler

MACHINES_READ = "machines.read"
MACHINES_WRITE = "machines.write"
MACHINES_MAINTAIN = "machines.maintain"

CLASSES_READ = "classes.read"
CLASSES_WRITE = "classes.write"
CLASSES_ATTEND = "classes.attend"

INSTRUCTORS_READ = "instructors.read"
INSTRUCTORS_WRITE = "instructors.write"

ROUTINES_READ = "routines.read"
ROUTINES_WRITE = "routines.write"
ROUTINES_ASSIGN = "routines.assign"

CHECKINS_WRITE = "checkins.write"
ACCESS_VALIDATE = "access.validate"
ACCESS_OVERRIDE = "access.override"
CREDENTIALS_WRITE = "credentials.write"   # huella/tarjeta del socio
CONSENT_WRITE = "consent.write"           # firma del consentimiento biométrico

REPORTS_READ = "reports.read"

MESSAGES_READ = "messages.read"
MESSAGES_WRITE = "messages.write"
NOTIFICATIONS_OUTBOX = "notifications.outbox"

SETTINGS_READ = "settings.read"
SETTINGS_PROFILE = "settings.profile"  # perfil del gym: nombre, contacto, logo, horarios
SETTINGS_WRITE = "settings.write"
SETTINGS_SECRETS = "settings.secrets"

LOCATIONS_WRITE = "locations.write"
PROMOS_WRITE = "promos.write"
KIOSK_MANAGE = "kiosk.manage"

USERS_READ = "users.read"
USERS_MANAGE = "users.manage"
AUDIT_READ = "audit.read"
JOBS_RUN = "jobs.run"


# ── Matriz rol → capacidades ──────────────────────────────────────────────────

_RECEPTIONIST: frozenset[str] = frozenset({
    # Operación diaria de mostrador.
    PAYMENTS_WRITE, PAYMENTS_CONFIRM,
    CASH_OPEN, CASH_CLOSE, CASH_EXPENSE,
    PLANS_READ,
    MEMBERS_READ, MEMBERS_WRITE,
    MEMBERSHIPS_WRITE,
    DAY_PASSES_SELL,
    PRODUCTS_READ, STOCK_MOVEMENT,
    MACHINES_READ, MACHINES_MAINTAIN,
    CLASSES_READ, CLASSES_ATTEND,
    INSTRUCTORS_READ,
    ROUTINES_READ,
    CHECKINS_WRITE, ACCESS_VALIDATE, CREDENTIALS_WRITE, CONSENT_WRITE,
})

_ADMIN: frozenset[str] = _RECEPTIONIST | frozenset({
    # Gestión del negocio, sin llegar a secretos, staff ni auditoría.
    PAYMENTS_READ, PAYMENTS_REVERSE,
    CASH_READ,
    PLANS_WRITE,
    MEMBERS_DELETE, MEMBERS_IMPORT,
    DAY_PASSES_WRITE,
    PRODUCTS_WRITE,
    MACHINES_WRITE,
    CLASSES_WRITE,
    INSTRUCTORS_WRITE,
    ROUTINES_WRITE, ROUTINES_ASSIGN,
    ACCESS_OVERRIDE,
    REPORTS_READ,
    MESSAGES_READ, MESSAGES_WRITE,
    SETTINGS_READ, SETTINGS_PROFILE,
    LOCATIONS_WRITE, PROMOS_WRITE, KIOSK_MANAGE,
    USERS_READ,
})

_OWNER: frozenset[str] = _ADMIN | frozenset({
    CASH_REOPEN,
    SETTINGS_WRITE, SETTINGS_SECRETS,
    NOTIFICATIONS_OUTBOX,
    USERS_MANAGE,
    AUDIT_READ,
    JOBS_RUN,
})

ROLE_PERMISSIONS: dict[UserRole, frozenset[str]] = {
    UserRole.owner: _OWNER,
    UserRole.admin: _ADMIN,
    UserRole.receptionist: _RECEPTIONIST,
}

ALL_PERMISSIONS: frozenset[str] = _OWNER


def has_perm(role: UserRole, perm: str) -> bool:
    return perm in ROLE_PERMISSIONS.get(role, frozenset())
