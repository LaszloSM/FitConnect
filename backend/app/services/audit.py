import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.audit_log import AuditLog
from app.models.tenant.user_staff import UserStaff


def audit(
    db: AsyncSession,
    actor: UserStaff | None,
    action: str,
    entity_type: str | None = None,
    entity_id: uuid.UUID | str | None = None,
    details: dict | None = None,
) -> None:
    """Agrega un registro de auditoría a la sesión (sin commit: viaja en la
    misma transacción que la operación que audita)."""
    db.add(AuditLog(
        actor_staff_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else "sistema",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        details=details,
    ))
