from datetime import date

from app.models.tenant.membership import Membership, MembershipStatus


def effective_status(membership: Membership, today: date | None = None) -> str:
    """Estado real de una membresía derivado de end_date/status (compute-on-read).

    Evita depender del campo `status` que queda stale cuando pasa la fecha de fin.
    """
    today = today or date.today()
    if membership.status == MembershipStatus.cancelled:
        return "cancelled"
    if membership.end_date < today:
        return "expired"
    return "active"
