from datetime import date, timedelta

from app.core.timeutil import today_bogota
from app.models.tenant.membership import Membership, MembershipStatus


def effective_status(
    membership: Membership,
    today: date | None = None,
    grace_days: int = 0,
) -> str:
    """Estado real de una membresía derivado de end_date/status (compute-on-read).

    Única fuente de verdad para check-in, reservas y reportes. Devuelve:
    active | frozen | in_grace | expired | cancelled.

    `in_grace` = venció hace <= grace_days (el gym decide si deja entrar con aviso).
    El campo persistido `status` solo lo escriben las transiciones explícitas
    (cancel, freeze/unfreeze) y el job diario de expiración.
    """
    today = today or today_bogota()
    if membership.status == MembershipStatus.cancelled:
        return "cancelled"
    if membership.status == MembershipStatus.frozen:
        return "frozen"
    if membership.end_date < today:
        if grace_days > 0 and today <= membership.end_date + timedelta(days=grace_days):
            return "in_grace"
        return "expired"
    return "active"
