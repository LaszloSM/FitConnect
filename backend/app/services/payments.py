"""Reglas compartidas de cobro: turno de caja, transferencias con referencia y
cuenta destino, activación de pases. Las usan POS, cobro de membresía y pase
del día para no duplicar la política de pago en cada endpoint."""
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import utcnow_naive
from app.models.tenant.cash_shift import CashShift
from app.models.tenant.day_pass import DayPass, DayPassStatus
from app.models.tenant.gym_settings import GymSettings
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.user_staff import UserStaff
from app.services.storage import resolve_media_url


async def open_cash_shift(db: AsyncSession) -> CashShift | None:
    """Turno de caja abierto de la sede única (location_id NULL)."""
    return (await db.execute(
        select(CashShift).where(CashShift.status == "open", CashShift.location_id.is_(None)).limit(1)
    )).scalar_one_or_none()


async def shift_for_cash(db: AsyncSession, gym: GymSettings) -> CashShift | None:
    """El efectivo cobrado exige turno abierto, salvo que el gym no use turnos.
    Devuelve el turno (o None si los turnos están desactivados)."""
    shift = await open_cash_shift(db)
    if shift is None and gym.cash_shifts_enabled:
        raise HTTPException(status_code=400, detail="Abre un turno de caja antes de cobrar en efectivo")
    return shift


def transfer_accounts(gym: GymSettings) -> list[dict]:
    """Cuentas de recaudo con id garantizado (las guardadas antes de esta
    versión no lo traían; se asigna al leer sin escribir en DB)."""
    accounts = []
    for a in gym.transfer_accounts or []:
        a = dict(a)
        a.setdefault("id", str(uuid.uuid5(uuid.NAMESPACE_URL, f"{a.get('type')}:{a.get('account_number')}")))
        a.setdefault("is_active", True)
        a.setdefault("breb_key", None)
        a.setdefault("qr_url", None)
        accounts.append(a)
    return accounts


def resolve_transfer_account(gym: GymSettings, account_id: str | None) -> dict | None:
    """Cuenta destino de una transferencia. Si el gym tiene una sola activa y no
    se envió id, se usa esa; con varias, el id es obligatorio. Sin cuentas
    configuradas la transferencia se registra sin destino (la UI avisa)."""
    active = [a for a in transfer_accounts(gym) if a.get("is_active", True)]
    if not active:
        return None
    if account_id is None:
        if len(active) == 1:
            return active[0]
        raise HTTPException(status_code=400, detail="Indica a qué cuenta se hará la transferencia")
    for a in active:
        if a["id"] == account_id:
            return a
    raise HTTPException(status_code=400, detail="La cuenta de recaudo no existe o está inactiva")


async def next_transfer_reference(db: AsyncSession, gym: GymSettings) -> str:
    number = (await db.execute(text("SELECT nextval('transfer_ref_seq')"))).scalar()
    return f"{gym.receipt_prefix}-{number:04d}"


async def apply_payment_policy(
    db: AsyncSession,
    payment: Payment,
    gym: GymSettings,
    *,
    transfer_account_id: str | None = None,
    card_approval_code: str | None = None,
    card_terminal: str | None = None,
) -> dict | None:
    """Aplica la política por método a un Payment recién construido (sin flush):
    - cash paid → turno abierto (o sin turno si están desactivados)
    - transfer → pending + cuenta destino + referencia corta
    - card → datos del voucher
    Devuelve la cuenta destino elegida (para mostrarla en la respuesta)."""
    account = None
    if payment.method == PaymentMethod.transfer:
        payment.status = PaymentStatus.pending
        account = resolve_transfer_account(gym, transfer_account_id)
        payment.destination_account_id = account["id"] if account else None
        if not payment.transfer_reference:
            payment.transfer_reference = await next_transfer_reference(db, gym)
    elif payment.method == PaymentMethod.cash and payment.status == PaymentStatus.paid:
        shift = await shift_for_cash(db, gym)
        if shift is not None:
            payment.shift_id = shift.id
    elif payment.method == PaymentMethod.card:
        payment.card_approval_code = card_approval_code
        payment.card_terminal = card_terminal
    return account


def public_account(account: dict | None) -> dict | None:
    """Vista de la cuenta destino para el socio: sin exponer más de lo necesario."""
    if not account:
        return None
    return {
        "id": account["id"],
        "type": account.get("type"),
        "label": account.get("label"),
        "account_number": account.get("account_number"),
        "holder_name": account.get("holder_name"),
        "breb_key": account.get("breb_key"),
        "qr_url": resolve_media_url(account.get("qr_url")),
    }


async def activate_day_passes(db: AsyncSession, payment_id: uuid.UUID) -> None:
    """Un pase vendido por transferencia/Wompi da acceso solo cuando el pago
    se confirma. Idempotente."""
    await db.execute(
        update(DayPass)
        .where(DayPass.payment_id == payment_id, DayPass.status == DayPassStatus.pending.value)
        .values(status=DayPassStatus.active.value)
    )


async def void_day_passes(db: AsyncSession, payment_id: uuid.UUID, *, include_active: bool = False) -> None:
    """Anular pago pendiente: solo pases pendientes. Devolución de un pago
    confirmado (include_active): también el pase ya activo deja de dar acceso."""
    stmt = update(DayPass).where(DayPass.payment_id == payment_id)
    if not include_active:
        stmt = stmt.where(DayPass.status != DayPassStatus.active.value)
    await db.execute(stmt.values(status=DayPassStatus.void.value))


async def mark_voided(
    db: AsyncSession,
    payment: Payment,
    reason: str | None,
    user: "UserStaff | None" = None,
) -> None:
    """Anula un pendiente que nunca entró y lo deja en el libro.

    Antes reutilizaba `failed`, el mismo estado de una tarjeta rechazada por
    Wompi: en los reportes no había forma de responder "¿cuántas ventas perdí
    por la pasarela?" frente a "¿cuántas anuló mi recepcionista?".
    """
    from app.models.tenant.payment_movement import MovementKind
    from app.services.payment_ledger import backfill_charge, record

    await backfill_charge(db, payment)
    payment.status = PaymentStatus.voided
    payment.voided_at = utcnow_naive()
    payment.void_reason = reason
    payment.voided_by = user.id if user else None
    record(db, payment, kind=MovementKind.void, amount=-payment.amount,
           actor=user, reason=reason)


async def cancel_unpaid_membership(db: AsyncSession, payment: Payment) -> bool:
    """Al anular el pago pendiente de una membresía (cobro por transferencia que
    nunca llegó) la membresía creada con él no puede seguir dando acceso. Solo
    se cancela si ningún otro pago confirmado la respalda."""
    if not payment.membership_id:
        return False
    other_paid = (await db.execute(
        select(func.count()).select_from(Payment).where(
            Payment.membership_id == payment.membership_id,
            Payment.status == PaymentStatus.paid,
            Payment.id != payment.id,
        )
    )).scalar() or 0
    if other_paid:
        return False
    await db.execute(
        update(Membership)
        .where(Membership.id == payment.membership_id, Membership.status != MembershipStatus.cancelled.value)
        .values(status=MembershipStatus.cancelled.value)
    )
    return True


def elapsed_minutes(created_at: datetime) -> int:
    return max(int((utcnow_naive() - created_at).total_seconds() // 60), 0)
