import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.api.deps import get_master_db, get_tenant_db_from_token, require_perm
from app.core import permissions as perm
from app.core.config import settings
from app.core.security import generate_invite_token, hash_invite_token
from app.services import emails, mailer
from app.services.audit import audit
from app.services.staff_member import restore_staff_member, suspend_staff_member
from app.models.master.staff_directory import StaffDirectory
from app.models.master.staff_invitation import StaffInvitation
from app.models.master.tenant import Tenant
from app.models.tenant.user_staff import UserStaff, UserRole
from app.schemas.user import InviteUserRequest, InviteResponse, UserResponse, UpdateUserRoleRequest

router = APIRouter(prefix="/users", tags=["users"])

INVITE_TTL_HOURS = 48
ROLE_LABELS = {"admin": "administrador", "receptionist": "recepción", "trainer": "entrenador"}


@router.post("/invite", status_code=201, response_model=InviteResponse)
async def invite_staff(
    payload: InviteUserRequest,
    current_user: UserStaff = Depends(require_perm(perm.USERS_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    master_db: AsyncSession = Depends(get_master_db),
):
    if payload.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede invitar con rol owner")

    # Contexto del gym del invitador (tenant_id, db_name) desde el índice global
    inviter = await master_db.execute(
        select(StaffDirectory).where(StaffDirectory.email == current_user.email)
    )
    inviter_entry = inviter.scalar_one_or_none()
    if not inviter_entry:
        raise HTTPException(status_code=400, detail="Invitador no está en el índice de staff")

    # Unicidad global de email (MVP: una persona = un gym)
    existing = await master_db.execute(
        select(StaffDirectory).where(StaffDirectory.email == payload.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya registrado en la plataforma")

    result = await db.execute(select(UserStaff).where(UserStaff.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya existe en este gym")

    # Re-invitar emite un link fresco: descartamos invitaciones previas sin usar.
    await master_db.execute(
        delete(StaffInvitation).where(
            StaffInvitation.email == payload.email,
            StaffInvitation.used_at.is_(None),
        )
    )

    token = generate_invite_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_TTL_HOURS)
    master_db.add(StaffInvitation(
        token_hash=hash_invite_token(token),
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role.value,
        tenant_id=inviter_entry.tenant_id,
        db_name=inviter_entry.db_name,
        invited_by=current_user.id,
        expires_at=expires_at,
    ))
    audit(db, current_user, "staff.invite", "user", payload.email,
          {"email": payload.email, "role": payload.role.value, "expires_at": expires_at.isoformat()})
    await db.commit()
    await master_db.commit()

    invite_url = f"{settings.frontend_url.rstrip('/')}/aceptar-invitacion?token={token}"
    tenant = await master_db.get(Tenant, inviter_entry.tenant_id)
    email_sent = await mailer.send_email(payload.email, emails.staff_invite(
        invite_url, tenant.name if tenant else "tu gimnasio", ROLE_LABELS.get(payload.role.value, payload.role.value),
        INVITE_TTL_HOURS, invited_by=current_user.full_name,
    ))
    return InviteResponse(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        invite_url=invite_url,
        expires_at=expires_at,
        email_sent=email_sent,
    )


@router.get("", response_model=list[UserResponse])
async def list_staff(
    current_user: UserStaff = Depends(require_perm(perm.USERS_READ)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    include_inactive: bool = Query(False),
):
    from app.models.tenant.instructor import Instructor

    stmt = select(UserStaff)
    if not include_inactive:
        stmt = stmt.where(UserStaff.is_active.is_(True))
    result = await db.execute(stmt.order_by(UserStaff.full_name))
    usuarios = result.scalars().all()

    con_ficha = set((await db.execute(
        select(Instructor.staff_id).where(Instructor.staff_id.is_not(None))
    )).scalars().all())

    salida = []
    for u in usuarios:
        item = UserResponse.model_validate(u)
        item.teaches_classes = u.id in con_ficha
        salida.append(item)
    return salida


async def _linked_trainer(db: AsyncSession, user: UserStaff):
    from app.models.tenant.instructor import Instructor

    return (await db.execute(
        select(Instructor).where(Instructor.staff_id == user.id)
    )).scalar_one_or_none()


async def _link_trainer_profile(db: AsyncSession, user: UserStaff):
    """Deja a esta persona lista para dictar clases, reusando su ficha si existe."""
    from sqlalchemy import func
    from app.models.tenant.instructor import Instructor

    ficha = await _linked_trainer(db, user)
    if ficha is not None:
        ficha.is_active = True
        return ficha

    libre = (await db.execute(
        select(Instructor).where(
            Instructor.staff_id.is_(None),
            func.lower(Instructor.full_name) == user.full_name.strip().lower(),
        )
    )).scalars().first()
    if libre is None:
        libre = Instructor(full_name=user.full_name)
        db.add(libre)
    libre.staff_id = user.id
    libre.is_active = True
    return libre


async def _active_classes(db: AsyncSession, instructor_id) -> int:
    from sqlalchemy import func
    from app.models.tenant.gym_class import GymClass

    return (await db.execute(
        select(func.count()).select_from(GymClass).where(
            GymClass.instructor_id == instructor_id, GymClass.is_active.is_(True)
        )
    )).scalar_one()


async def _sync_trainer_profile(db: AsyncSession, user: UserStaff) -> None:
    """Mantiene la ficha de `instructors` alineada con el rol.

    Ascender a alguien a entrenador desde Equipo tiene que dejarlo listo para
    trabajar. Quitarle el rol NO borra la ficha —sus clases pasadas apuntan a
    ella— y solo la desenlaza si no tiene clases vigentes: un administrador que
    además dicta spinning es un caso real, y perder su vínculo al cambiarle el
    rol dejaría esas clases sin entrenador asignado.
    """
    if user.role == UserRole.trainer:
        await _link_trainer_profile(db, user)
        return

    ficha = await _linked_trainer(db, user)
    if ficha is not None and not await _active_classes(db, ficha.id):
        ficha.staff_id = None


@router.post("/{user_id}/teaching", status_code=201)
async def enable_teaching(
    user_id: uuid.UUID,
    current_user: UserStaff = Depends(require_perm(perm.INSTRUCTORS_WRITE)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Habilita a un miembro del equipo para dictar clases, sea cual sea su rol."""
    user = (await db.execute(select(UserStaff).where(UserStaff.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    ficha = await _link_trainer_profile(db, user)
    audit(db, current_user, "staff.teaching_on", "user", user.id, {"email": user.email})
    await db.commit()
    await db.refresh(ficha)
    return {"instructor_id": str(ficha.id), "full_name": ficha.full_name}


@router.delete("/{user_id}/teaching")
async def disable_teaching(
    user_id: uuid.UUID,
    current_user: UserStaff = Depends(require_perm(perm.INSTRUCTORS_WRITE)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    user = (await db.execute(select(UserStaff).where(UserStaff.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    ficha = await _linked_trainer(db, user)
    if ficha is None:
        return {"ok": True}
    pendientes = await _active_classes(db, ficha.id)
    if pendientes:
        raise HTTPException(
            status_code=409,
            detail=f"{user.full_name} tiene {pendientes} clase(s) vigente(s). Reasignalas antes de quitarle las clases.",
        )
    ficha.staff_id = None
    audit(db, current_user, "staff.teaching_off", "user", user.id, {"email": user.email})
    await db.commit()
    return {"ok": True}


@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: uuid.UUID,
    payload: UpdateUserRoleRequest,
    current_user: UserStaff = Depends(require_perm(perm.USERS_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    if payload.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede asignar rol owner")

    result = await db.execute(select(UserStaff).where(UserStaff.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede cambiar el rol del owner")
    previous = user.role.value
    user.role = payload.role
    await _sync_trainer_profile(db, user)
    audit(db, current_user, "staff.role_change", "user", user.id,
          {"email": user.email, "from": previous, "to": payload.role.value})
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}")
async def deactivate_user(
    user_id: uuid.UUID,
    current_user: UserStaff = Depends(require_perm(perm.USERS_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(UserStaff).where(UserStaff.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")
    if user.role == UserRole.owner:
        raise HTTPException(status_code=400, detail="No se puede desactivar al owner")
    user.is_active = False
    # Quitarle el acceso al software tiene que quitarle también el del gimnasio:
    # si no, sigue entrando por el torniquete despues de que lo desvincularon.
    await suspend_staff_member(db, staff_id=user.id)
    audit(db, current_user, "staff.deactivate", "user", user.id, {"email": user.email})
    await db.commit()
    return {"ok": True}


@router.post("/{user_id}/reactivate", response_model=UserResponse)
async def reactivate_user(
    user_id: uuid.UUID,
    current_user: UserStaff = Depends(require_perm(perm.USERS_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Desactivar por error dejaba a la persona fuera para siempre: no había
    forma de revertirlo ni desde la UI ni desde la API."""
    result = await db.execute(select(UserStaff).where(UserStaff.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = True
    await restore_staff_member(db, staff_id=user.id)
    audit(db, current_user, "staff.reactivate", "user", user.id, {"email": user.email})
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)
