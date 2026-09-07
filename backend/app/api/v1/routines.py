"""Rutinas: biblioteca global de ejercicios (Master DB), rutinas del gym con
días y ejercicios, asignación a socios y lectura desde la pantalla del gym."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, desc, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_master_db, get_kiosk_db, get_kiosk_payload, require_role
from app.core.timeutil import utcnow_naive
from app.models.master.exercise import Exercise
from app.models.tenant.member import Member
from app.models.tenant.routine import Routine, RoutineDay, RoutineExercise, MemberRoutine
from app.models.tenant.user_staff import UserStaff, UserRole
from app.services.audit import audit
from app.services.exercise_catalog import exercise_out, MUSCLES_ES, EQUIPMENT_ES, CATEGORY_ES, LEVEL_ES

router = APIRouter(tags=["routines"])

GOALS = {"hipertrofia": "Hipertrofia", "fuerza": "Fuerza", "perdida_grasa": "Pérdida de grasa",
         "resistencia": "Resistencia", "movilidad": "Movilidad", "general": "Acondicionamiento general"}


# ─── Biblioteca de ejercicios ───

async def _search_exercises(db: AsyncSession, q: str, muscle: str | None, equipment: str | None,
                            category: str | None, level: str | None, limit: int, offset: int) -> list[dict]:
    stmt = select(Exercise).where(Exercise.is_active.is_(True))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Exercise.name_es.ilike(like), Exercise.name_en.ilike(like)))
    if muscle:
        stmt = stmt.where(Exercise.primary_muscles.any(muscle))
    if equipment:
        stmt = stmt.where(Exercise.equipment == equipment)
    if category:
        stmt = stmt.where(Exercise.category == category)
    if level:
        stmt = stmt.where(Exercise.level == level)
    stmt = stmt.order_by(desc(Exercise.sort_weight), Exercise.name_es).limit(limit).offset(offset)
    return [exercise_out(e) for e in (await db.execute(stmt)).scalars().all()]


@router.get("/exercises", dependencies=[Depends(get_current_staff)])
async def list_exercises(
    master: AsyncSession = Depends(get_master_db),
    q: str = Query(""),
    muscle: str | None = Query(None),
    equipment: str | None = Query(None),
    category: str | None = Query(None),
    level: str | None = Query(None),
    limit: int = Query(40, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await _search_exercises(master, q.strip(), muscle, equipment, category, level, limit, offset)


@router.get("/exercises/facets", dependencies=[Depends(get_current_staff)])
async def exercise_facets(master: AsyncSession = Depends(get_master_db)):
    total = (await master.execute(select(func.count()).select_from(Exercise).where(Exercise.is_active.is_(True)))).scalar() or 0
    return {
        "total": total,
        "muscles": [{"key": k, "label": v} for k, v in MUSCLES_ES.items()],
        "equipment": [{"key": k, "label": v} for k, v in EQUIPMENT_ES.items() if k],
        "categories": [{"key": k, "label": v} for k, v in CATEGORY_ES.items()],
        "levels": [{"key": k, "label": v} for k, v in LEVEL_ES.items()],
        "goals": [{"key": k, "label": v} for k, v in GOALS.items()],
    }


@router.get("/exercises/{exercise_id}", dependencies=[Depends(get_current_staff)])
async def get_exercise(exercise_id: uuid.UUID, master: AsyncSession = Depends(get_master_db)):
    e = (await master.execute(select(Exercise).where(Exercise.id == exercise_id))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Ejercicio no encontrado")
    return exercise_out(e)


# ─── Rutinas ───

class RoutineExerciseIn(BaseModel):
    exercise_id: uuid.UUID
    sets: int = Field(default=3, ge=1, le=20)
    reps: str = Field(default="10-12", min_length=1, max_length=40)
    rest_seconds: int = Field(default=60, ge=0, le=900)
    notes: Optional[str] = Field(default=None, max_length=300)
    video_url: Optional[str] = Field(default=None, max_length=500)


class RoutineDayIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=500)
    exercises: list[RoutineExerciseIn] = Field(default_factory=list, max_length=30)


class RoutineIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    goal: Optional[str] = Field(default=None, pattern="^(hipertrofia|fuerza|perdida_grasa|resistencia|movilidad|general)$")
    level: str = Field(default="beginner", pattern="^(beginner|intermediate|expert)$")
    is_public_on_screen: bool = False
    is_active: bool = True
    days: list[RoutineDayIn] = Field(default_factory=list, max_length=7)


async def _exercise_names(master: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, Exercise]:
    if not ids:
        return {}
    rows = (await master.execute(select(Exercise).where(Exercise.id.in_(list(ids))))).scalars().all()
    return {e.id: e for e in rows}


async def _routine_detail(db: AsyncSession, master: AsyncSession | None, routine: Routine) -> dict:
    days = (await db.execute(
        select(RoutineDay).where(RoutineDay.routine_id == routine.id).order_by(RoutineDay.day_index)
    )).scalars().all()
    day_ids = [d.id for d in days]
    exercises = (await db.execute(
        select(RoutineExercise).where(RoutineExercise.day_id.in_(day_ids)).order_by(RoutineExercise.order)
    )).scalars().all() if day_ids else []
    catalog = await _exercise_names(master, {e.exercise_id for e in exercises}) if master is not None else {}
    by_day: dict = {}
    for ex in exercises:
        cat = catalog.get(ex.exercise_id)
        by_day.setdefault(ex.day_id, []).append({
            "id": str(ex.id), "exercise_id": str(ex.exercise_id),
            "exercise_name": ex.exercise_name, "order": ex.order, "sets": ex.sets, "reps": ex.reps,
            "rest_seconds": ex.rest_seconds, "notes": ex.notes, "video_url": ex.video_url,
            "exercise": exercise_out(cat) if cat else None,
        })
    assigned = (await db.execute(
        select(func.count()).select_from(MemberRoutine).where(MemberRoutine.routine_id == routine.id, MemberRoutine.ended_at.is_(None))
    )).scalar() or 0
    return {
        "id": str(routine.id), "name": routine.name, "description": routine.description, "goal": routine.goal,
        "goal_label": GOALS.get(routine.goal or "", routine.goal), "level": routine.level, "level_es": LEVEL_ES.get(routine.level, routine.level),
        "days_per_week": routine.days_per_week, "is_public_on_screen": routine.is_public_on_screen, "is_active": routine.is_active,
        "assigned_count": assigned, "created_at": routine.created_at, "updated_at": routine.updated_at,
        "days": [
            {"id": str(d.id), "day_index": d.day_index, "title": d.title, "notes": d.notes, "exercises": by_day.get(d.id, [])}
            for d in days
        ],
    }


async def _write_structure(db: AsyncSession, master: AsyncSession, routine: Routine, days: list[RoutineDayIn]) -> None:
    ids = {ex.exercise_id for d in days for ex in d.exercises}
    catalog = await _exercise_names(master, ids)
    missing = ids - set(catalog.keys())
    if missing:
        raise HTTPException(status_code=400, detail="Hay ejercicios que no existen en la biblioteca")
    old_day_ids = select(RoutineDay.id).where(RoutineDay.routine_id == routine.id)
    await db.execute(delete(RoutineExercise).where(RoutineExercise.day_id.in_(old_day_ids)))
    await db.execute(delete(RoutineDay).where(RoutineDay.routine_id == routine.id))
    for i, d in enumerate(days):
        day = RoutineDay(routine_id=routine.id, day_index=i, title=d.title.strip(), notes=d.notes)
        db.add(day)
        await db.flush()
        for j, ex in enumerate(d.exercises):
            db.add(RoutineExercise(
                day_id=day.id, exercise_id=ex.exercise_id, exercise_name=catalog[ex.exercise_id].name_es,
                order=j, sets=ex.sets, reps=ex.reps.strip(), rest_seconds=ex.rest_seconds, notes=ex.notes, video_url=ex.video_url,
            ))
    routine.days_per_week = max(len(days), 1)


@router.get("/routines", dependencies=[Depends(get_current_staff)])
async def list_routines(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    include_inactive: bool = Query(False),
):
    stmt = select(Routine)
    if not include_inactive:
        stmt = stmt.where(Routine.is_active.is_(True))
    routines = (await db.execute(stmt.order_by(Routine.name))).scalars().all()
    counts = dict((await db.execute(
        select(MemberRoutine.routine_id, func.count()).where(MemberRoutine.ended_at.is_(None)).group_by(MemberRoutine.routine_id)
    )).all())
    day_counts = dict((await db.execute(select(RoutineDay.routine_id, func.count()).group_by(RoutineDay.routine_id))).all())
    return [
        {
            "id": str(r.id), "name": r.name, "description": r.description, "goal": r.goal,
            "goal_label": GOALS.get(r.goal or "", r.goal), "level": r.level, "level_es": LEVEL_ES.get(r.level, r.level),
            "days_per_week": day_counts.get(r.id, r.days_per_week), "is_public_on_screen": r.is_public_on_screen,
            "is_active": r.is_active, "assigned_count": counts.get(r.id, 0), "updated_at": r.updated_at,
        }
        for r in routines
    ]


@router.post("/routines", status_code=201, dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def create_routine(
    payload: RoutineIn,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    master: AsyncSession = Depends(get_master_db),
    current_user: UserStaff = Depends(get_current_staff),
):
    routine = Routine(
        name=payload.name.strip(), description=payload.description, goal=payload.goal, level=payload.level,
        is_public_on_screen=payload.is_public_on_screen, is_active=payload.is_active, created_by=current_user.id,
    )
    db.add(routine)
    await db.flush()
    await _write_structure(db, master, routine, payload.days)
    audit(db, current_user, "routine.create", "routine", routine.id, {"name": routine.name, "days": len(payload.days)})
    await db.commit()
    await db.refresh(routine)
    return await _routine_detail(db, master, routine)


@router.get("/routines/{routine_id}", dependencies=[Depends(get_current_staff)])
async def get_routine(
    routine_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    master: AsyncSession = Depends(get_master_db),
):
    routine = (await db.execute(select(Routine).where(Routine.id == routine_id))).scalar_one_or_none()
    if not routine:
        raise HTTPException(status_code=404, detail="Rutina no encontrada")
    return await _routine_detail(db, master, routine)


@router.put("/routines/{routine_id}", dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def update_routine(
    routine_id: uuid.UUID,
    payload: RoutineIn,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    master: AsyncSession = Depends(get_master_db),
    current_user: UserStaff = Depends(get_current_staff),
):
    routine = (await db.execute(select(Routine).where(Routine.id == routine_id))).scalar_one_or_none()
    if not routine:
        raise HTTPException(status_code=404, detail="Rutina no encontrada")
    routine.name, routine.description, routine.goal, routine.level = payload.name.strip(), payload.description, payload.goal, payload.level
    routine.is_public_on_screen, routine.is_active = payload.is_public_on_screen, payload.is_active
    await _write_structure(db, master, routine, payload.days)
    audit(db, current_user, "routine.update", "routine", routine.id, {"name": routine.name, "days": len(payload.days)})
    await db.commit()
    await db.refresh(routine)
    return await _routine_detail(db, master, routine)


@router.delete("/routines/{routine_id}", dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def archive_routine(
    routine_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    routine = (await db.execute(select(Routine).where(Routine.id == routine_id))).scalar_one_or_none()
    if not routine:
        raise HTTPException(status_code=404, detail="Rutina no encontrada")
    routine.is_active = False
    routine.is_public_on_screen = False
    audit(db, current_user, "routine.archive", "routine", routine.id, {"name": routine.name})
    await db.commit()
    return {"archived": True}


# ─── Asignación a socios ───

class AssignRoutine(BaseModel):
    routine_id: uuid.UUID
    notes: Optional[str] = Field(default=None, max_length=500)


@router.post("/members/{member_id}/routines", status_code=201, dependencies=[Depends(get_current_staff)])
async def assign_routine(
    member_id: uuid.UUID,
    payload: AssignRoutine,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    member = (await db.execute(select(Member).where(Member.id == member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    routine = (await db.execute(select(Routine).where(Routine.id == payload.routine_id, Routine.is_active.is_(True)))).scalar_one_or_none()
    if not routine:
        raise HTTPException(status_code=404, detail="Rutina no encontrada")
    # Una rutina vigente por socio: la anterior queda en el historial
    current = (await db.execute(
        select(MemberRoutine).where(MemberRoutine.member_id == member_id, MemberRoutine.ended_at.is_(None))
    )).scalars().all()
    for c in current:
        c.ended_at = utcnow_naive()
    mr = MemberRoutine(member_id=member_id, routine_id=routine.id, assigned_by=current_user.id, notes=payload.notes)
    db.add(mr)
    audit(db, current_user, "routine.assign", "member", member_id, {"routine": routine.name})
    await db.commit()
    await db.refresh(mr)
    return {"id": str(mr.id), "routine_id": str(routine.id), "routine_name": routine.name, "assigned_at": mr.assigned_at}


@router.get("/members/{member_id}/routines", dependencies=[Depends(get_current_staff)])
async def member_routines(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    master: AsyncSession = Depends(get_master_db),
):
    rows = (await db.execute(
        select(MemberRoutine, Routine).join(Routine, Routine.id == MemberRoutine.routine_id)
        .where(MemberRoutine.member_id == member_id).order_by(desc(MemberRoutine.assigned_at))
    )).all()
    current = None
    history = []
    for mr, r in rows:
        item = {"id": str(mr.id), "routine_id": str(r.id), "routine_name": r.name, "goal_label": GOALS.get(r.goal or "", r.goal),
                "assigned_at": mr.assigned_at, "ended_at": mr.ended_at, "notes": mr.notes}
        if mr.ended_at is None and current is None:
            current = {**item, "routine": await _routine_detail(db, master, r)}
        else:
            history.append(item)
    return {"current": current, "history": history}


@router.delete("/members/{member_id}/routines/current", dependencies=[Depends(get_current_staff)])
async def end_member_routine(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    rows = (await db.execute(
        select(MemberRoutine).where(MemberRoutine.member_id == member_id, MemberRoutine.ended_at.is_(None))
    )).scalars().all()
    for r in rows:
        r.ended_at = utcnow_naive()
    await db.commit()
    return {"ended": len(rows)}


# ─── Pantalla del gym (token de dispositivo, sin login) ───

@router.get("/kiosk/routines")
async def screen_routines(
    db: AsyncSession = Depends(get_kiosk_db),
    _payload: dict = Depends(get_kiosk_payload),
):
    routines = (await db.execute(
        select(Routine).where(Routine.is_active.is_(True), Routine.is_public_on_screen.is_(True)).order_by(Routine.name)
    )).scalars().all()
    day_counts = dict((await db.execute(select(RoutineDay.routine_id, func.count()).group_by(RoutineDay.routine_id))).all())
    return [
        {"id": str(r.id), "name": r.name, "description": r.description, "goal_label": GOALS.get(r.goal or "", r.goal),
         "level_es": LEVEL_ES.get(r.level, r.level), "days_per_week": day_counts.get(r.id, r.days_per_week)}
        for r in routines
    ]


@router.get("/kiosk/routines/{routine_id}")
async def screen_routine_detail(
    routine_id: uuid.UUID,
    db: AsyncSession = Depends(get_kiosk_db),
    master: AsyncSession = Depends(get_master_db),
    _payload: dict = Depends(get_kiosk_payload),
):
    routine = (await db.execute(
        select(Routine).where(Routine.id == routine_id, Routine.is_active.is_(True), Routine.is_public_on_screen.is_(True))
    )).scalar_one_or_none()
    if not routine:
        raise HTTPException(status_code=404, detail="Rutina no disponible")
    return await _routine_detail(db, master, routine)
