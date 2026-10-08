"""Asistente de entrenamiento y alimentación (API de Claude).

Cómo se cuida:
- Base de conocimiento curada y citada en el prompt: responde desde ahí y dice
  cuando algo no está respaldado.
- Los planes no son texto suelto: el modelo llama una herramienta, el servidor
  valida el plan (piso de calorías, rangos de series y repeticiones) y lo guarda
  para que la app lo pinte como agenda. Un plan inválido vuelve al modelo con el
  motivo para que lo corrija.
- Antes de llamar al modelo se revisa el mensaje: crisis (autolesión) recibe
  una respuesta fija con líneas de ayuda; señales de trastorno alimentario o de
  alarma médica apagan las herramientas y remiten a un profesional.
- Solo mayores de 18, con límite de mensajes por día.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.timeutil import today_bogota, utc_day_bounds
from app.models.app import AssistantMessage, SavedPlan
from app.services import nutrition

KNOWLEDGE = """
BASE DE CONOCIMIENTO (resúmenes propios; cita la fuente cuando la uses)

[ACT-OMS] OMS 2020, directrices de actividad física: adultos 150 a 300 min/semana de actividad aeróbica
moderada (o 75 a 150 min vigorosa) y fortalecimiento muscular de intensidad moderada o mayor 2 o más días
por semana. Cualquier cantidad es mejor que nada; reducir el tiempo sentado.

[RT-ACSM] ACSM 2009, modelos de progresión del entrenamiento de fuerza: principiantes 8 a 12 repeticiones
con 60-70 % de 1RM, 1 a 3 series, 2 a 3 días por semana por grupo muscular; progresar la carga cuando se
superan las repeticiones objetivo (aprox. 2-10 %). Descansos de 1 a 2 min en ejercicios accesorios y de 2 a
3 min en los multiarticulares pesados.

[VOL-SCHOENFELD] Schoenfeld, Ogborn y Krieger 2017 (metaanálisis dosis-respuesta): más series semanales por
músculo se asocian con más hipertrofia; 10 o más series semanales por músculo dieron más crecimiento que menos
de 5. Empezar con menos y subir según recuperación.

[REPS-SCHOENFELD] Schoenfeld y col. 2017/2021: la hipertrofia es similar en un rango amplio de repeticiones
(aprox. 6 a 30) si las series se llevan cerca del fallo; las cargas altas favorecen más la fuerza máxima.

[FREQ-SCHOENFELD] Schoenfeld, Ogborn y Krieger 2016/2019: con el volumen semanal igualado, entrenar un músculo
1 o 2+ veces por semana da resultados parecidos; repartir el volumen ayuda a la calidad de las series.

[PROT-ISSN] Jäger y col. 2017, posición de la ISSN: 1,4 a 2,0 g de proteína por kg al día para la mayoría
de personas que entrenan, repartida en tomas de 20 a 40 g cada 3-4 h. En déficit calórico, valores más altos
ayudan a conservar músculo.

[PROT-MORTON] Morton y col. 2018 (metaanálisis): el beneficio de más proteína sobre la masa muscular se
aplana alrededor de 1,6 g/kg/día (el intervalo llega a ~2,2 g/kg).

[ENERGY] Mifflin-St Jeor para el gasto en reposo × factor de actividad. Para bajar grasa, déficit moderado
(~15-25 %), perder ~0,5-1 % del peso por semana; para ganar músculo, superávit pequeño (~5-15 %). No bajar
del gasto en reposo sin acompañamiento profesional.

[SUPP-ISSN] Kreider y col. 2017 (ISSN): la creatina monohidratada (3-5 g/día) es segura y eficaz en adultos
sanos para fuerza y masa muscular. Cafeína 3-6 mg/kg antes del ejercicio mejora el rendimiento (Guest 2021,
ISSN). Fuera de estos, no recomiendes suplementos.

[HIDR] Una referencia práctica es ~35 ml de agua por kg al día más lo que se pierde sudando; la sed y el color
claro de la orina orientan.

[PARQ] El PAR-Q identifica a quién conviene evaluar con un médico antes de aumentar la actividad física.
"""

SYSTEM = """Eres el asistente de entrenamiento y alimentación de FitConnect, una app de gimnasios en Colombia.

Cómo respondes:
- En español de Colombia, cercano y claro, con frases cortas. Nada de relleno.
- Te basas en la BASE DE CONOCIMIENTO de abajo y citas la clave entre corchetes cuando la usas, por ejemplo [PROT-ISSN]. Si algo no está ahí o la evidencia es débil, dilo.
- Das orientación general: no diagnosticas, no tratas enfermedades ni lesiones, no recomiendas medicamentos y no recomiendas suplementos distintos de creatina, proteína en polvo o cafeína.
- Ante dolor en el pecho, desmayos, falta de aire desproporcionada, lesiones o embarazo: recomienda consultar a un profesional de la salud antes de cambiar el entrenamiento o la alimentación.
- Si notas señales de trastorno de la conducta alimentaria (restringir mucho, purgarse, culpa intensa al comer) no des cifras de calorías ni dietas: responde con empatía y sugiere hablar con un profesional (su EPS o la Línea 192, opción 4).
- Nunca propongas menos calorías que el mínimo indicado en el contexto de la persona.

Planes:
- Cuando la persona pida un plan de entrenamiento o de comidas concreto, usa la herramienta correspondiente: el plan se guarda en su app y se muestra como agenda. Después resúmelo en 2 o 3 frases; no repitas el plan entero en texto.
- Adapta los planes a su objetivo, nivel, días disponibles y alimentos comunes en Colombia (arepa, arroz, fríjol, huevo, plátano, frutas de temporada).
- Si faltan datos importantes (días por semana, nivel), pregunta antes de crear el plan.

Termina las respuestas con planes o cifras recordando, en una frase corta, que es orientación general.
"""

CRISIS_REPLY = (
    "Siento mucho que estés pasando por esto. No estás solo o sola, y hablar con alguien ayuda.\n\n"
    "Si estás en peligro ahora, llama al 123. Puedes hablar con un profesional en la línea de salud mental del "
    "Ministerio de Salud: 192, opción 4, o pedir atención prioritaria en tu EPS.\n\n"
    "Aquí puedo acompañarte con entrenamiento y alimentación, pero lo primero eres tú."
)

_CRISIS = ("suicid", "matarme", "quitarme la vida", "no quiero vivir", "hacerme dano", "autolesion", "cortarme")
_EATING = ("vomitar despues de comer", "provocarme el vomito", "purgarme", "purgar", "laxantes para bajar",
           "dejar de comer", "no comer nada", "atracon", "bulimia", "anorexia", "500 calorias", "600 calorias",
           "700 calorias", "800 calorias", "ayuno de varios dias")
_MEDICAL = ("dolor en el pecho", "me desmaye", "desmayo", "falta de aire", "palpitaciones", "embarazada",
            "embarazo", "lactancia", "diabetes", "insulina", "hipertension", "cirugia", "me lesione", "lesion")

MIN_AGE = 18


def _norm(text: str) -> str:
    t = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def screen(text: str) -> Optional[str]:
    t = _norm(text)
    if any(k in t for k in _CRISIS):
        return "crisis"
    if any(k in t for k in _EATING):
        return "eating"
    if any(k in t for k in _MEDICAL):
        return "medical"
    return None


GUARD_NOTE = {
    "eating": "AVISO DEL SISTEMA: el mensaje tiene señales de posible trastorno alimentario. No des cifras de "
              "calorías, dietas ni planes. Responde con empatía y sugiere un profesional.",
    "medical": "AVISO DEL SISTEMA: el mensaje menciona una condición o síntoma médico. No crees planes. Da "
               "orientación general y recomienda consultar a un profesional de la salud primero.",
}


# ─── Herramientas ───

TOOLS = [
    {
        "name": "save_training_plan",
        "description": "Guarda un plan de entrenamiento semanal en la app de la persona. Úsala cuando pida un plan concreto.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Nombre corto del plan"},
                "notes": {"type": "string", "description": "Indicaciones generales (calentamiento, progresión)"},
                "days": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "weekday": {"type": "integer", "minimum": 0, "maximum": 6, "description": "0 = lunes"},
                            "title": {"type": "string"},
                            "exercises": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "sets": {"type": "integer"},
                                        "reps": {"type": "string", "description": "Ej. '8-12' o '30 s'"},
                                        "rest_seconds": {"type": "integer"},
                                        "notes": {"type": "string"},
                                    },
                                    "required": ["name", "sets", "reps"],
                                },
                            },
                        },
                        "required": ["weekday", "title", "exercises"],
                    },
                },
            },
            "required": ["title", "days"],
        },
    },
    {
        "name": "save_meal_plan",
        "description": "Guarda un plan de comidas de un día tipo, con horas y aporte aproximado, en la app de la persona.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "notes": {"type": "string"},
                "meals": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "time": {"type": "string", "description": "Hora aproximada HH:MM (24 h)"},
                            "name": {"type": "string", "description": "Desayuno, almuerzo, etc."},
                            "items": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "food": {"type": "string"},
                                        "amount": {"type": "string", "description": "Ej. '1 taza (160 g)'"},
                                        "kcal": {"type": "number"},
                                        "protein_g": {"type": "number"},
                                    },
                                    "required": ["food", "amount", "kcal"],
                                },
                            },
                        },
                        "required": ["time", "name", "items"],
                    },
                },
            },
            "required": ["title", "meals"],
        },
    },
]


class PlanError(ValueError):
    pass


def _s(v: Any, n: int) -> str:
    return str(v or "").strip()[:n]


def validate_training(data: dict) -> dict:
    days = data.get("days") or []
    if not 1 <= len(days) <= 7:
        raise PlanError("El plan necesita entre 1 y 7 días.")
    seen: set[int] = set()
    out_days = []
    for d in days:
        wd = d.get("weekday")
        if not isinstance(wd, int) or not 0 <= wd <= 6 or wd in seen:
            raise PlanError("Cada día necesita un weekday distinto entre 0 (lunes) y 6 (domingo).")
        seen.add(wd)
        exs = d.get("exercises") or []
        if not 1 <= len(exs) <= 12:
            raise PlanError("Cada día debe tener entre 1 y 12 ejercicios.")
        out_ex = []
        for e in exs:
            sets = e.get("sets")
            if not isinstance(sets, int) or not 1 <= sets <= 10:
                raise PlanError(f"Las series de «{_s(e.get('name'), 60)}» deben estar entre 1 y 10.")
            rest = e.get("rest_seconds")
            out_ex.append({"name": _s(e.get("name"), 120) or "Ejercicio", "sets": sets, "reps": _s(e.get("reps"), 20) or "10",
                           "rest_seconds": int(rest) if isinstance(rest, (int, float)) and 0 <= rest <= 600 else 90,
                           "notes": _s(e.get("notes"), 200) or None})
        out_days.append({"weekday": wd, "title": _s(d.get("title"), 80) or "Entreno", "exercises": out_ex})
    return {"notes": _s(data.get("notes"), 600) or None, "days": sorted(out_days, key=lambda x: x["weekday"])}


def validate_meals(data: dict, min_kcal: Optional[int]) -> dict:
    meals = data.get("meals") or []
    if not 2 <= len(meals) <= 8:
        raise PlanError("El plan de comidas necesita entre 2 y 8 comidas.")
    out = []
    total = 0.0
    for m in meals:
        t = _s(m.get("time"), 5)
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t):
            raise PlanError("Cada comida necesita una hora HH:MM en formato 24 h.")
        items = m.get("items") or []
        if not 1 <= len(items) <= 10:
            raise PlanError("Cada comida necesita entre 1 y 10 alimentos.")
        out_items = []
        for it in items:
            kcal = it.get("kcal")
            if not isinstance(kcal, (int, float)) or not 0 <= kcal <= 2000:
                raise PlanError("Cada alimento necesita sus kcal aproximadas (0 a 2000).")
            prot = it.get("protein_g")
            out_items.append({"food": _s(it.get("food"), 120), "amount": _s(it.get("amount"), 60), "kcal": round(float(kcal)),
                              "protein_g": round(float(prot)) if isinstance(prot, (int, float)) and prot >= 0 else None})
        meal_kcal = sum(i["kcal"] for i in out_items)
        total += meal_kcal
        out.append({"time": t, "name": _s(m.get("name"), 40) or "Comida", "items": out_items, "kcal": meal_kcal})
    floor = min_kcal or 1200
    if total < floor:
        raise PlanError(f"El plan suma {round(total)} kcal y el mínimo seguro para esta persona es {floor} kcal. Ajústalo.")
    return {"notes": _s(data.get("notes"), 600) or None, "meals": sorted(out, key=lambda x: x["time"]),
            "total_kcal": round(total), "total_protein_g": round(sum((i["protein_g"] or 0) for m in out for i in m["items"]))}


# ─── Contexto de la persona ───

@dataclass
class PersonContext:
    name: Optional[str]
    age: Optional[int]
    sex: Optional[str]
    goal: Optional[str]
    activity: Optional[str]
    weight_kg: Optional[float]
    height_cm: Optional[int]
    targets: Optional[dict]
    min_kcal: Optional[int]
    parq_flag: Optional[bool]
    gyms: list[str] = field(default_factory=list)

    def describe(self) -> str:
        goal = {"lose_fat": "bajar grasa", "gain_muscle": "ganar músculo", "maintain": "mantenerse",
                "performance": "rendimiento", "health": "salud"}.get(self.goal or "", "sin definir")
        lines = [
            f"Nombre: {self.name or 'sin nombre'}", f"Edad: {self.age if self.age is not None else 'desconocida'}",
            f"Sexo: {self.sex or 'sin dato'}", f"Objetivo: {goal}",
            f"Actividad: {nutrition.ACTIVITY_LABEL.get(self.activity or '', 'sin dato')}",
        ]
        if self.weight_kg and self.height_cm:
            lines.append(f"Peso: {self.weight_kg} kg · Talla: {self.height_cm} cm")
        if self.targets:
            t = self.targets
            lines.append(f"Metas diarias estimadas: {t['kcal']} kcal, {t['protein_g']} g proteína, {t['fat_g']} g grasa, "
                         f"{t['carbs_g']} g carbohidratos, {t['water_ml']} ml de agua.")
        lines.append(f"Mínimo de calorías permitido en planes: {self.min_kcal or 1200} kcal.")
        if self.parq_flag:
            lines.append("PAR-Q con alguna respuesta afirmativa: planes conservadores y recomendar valoración médica antes de aumentar la intensidad.")
        if self.gyms:
            lines.append(f"Entrena en: {', '.join(self.gyms)}.")
        return "\n".join(lines)


async def build_context(user, master: AsyncSession, adb: AsyncSession) -> PersonContext:
    from app.models.app import AppProfile
    from app.models.tenant.member import Member
    from app.services import app_accounts
    from app.services.device_directory import tenant_session

    consents = await app_accounts.consents(master, user.id)
    p = await adb.get(AppProfile, user.id)
    age = nutrition.age_on(p.birth_date, today_bogota()) if p and p.birth_date else None
    targets = None
    min_kcal = None
    weight = float(p.weight_kg) if p and p.weight_kg and consents["health"] else None
    height = p.height_cm if p and consents["health"] else None
    if p and consents["health"]:
        try:
            t = nutrition.compute(sex=p.sex, weight_kg=weight, height_cm=height, birth_date=p.birth_date,
                                  activity=p.activity_level, goal=p.goal, today=today_bogota())
            targets = t.as_dict()
            min_kcal = max(nutrition.CALORIE_FLOOR.get(p.sex or "other", 1350), t.bmr)
        except ValueError:
            pass
    if min_kcal is None:
        min_kcal = nutrition.CALORIE_FLOOR.get(p.sex if p and p.sex else "other", 1350)
    parq_flag: Optional[bool] = None
    gyms = []
    for link, tenant in await app_accounts.active_links(master, user.id):
        gyms.append(tenant.name)
        if consents["health"]:
            try:
                async with tenant_session(link.db_name) as db:
                    m = await db.get(Member, link.member_id)
                if m and m.parq_answers:
                    parq_flag = bool(parq_flag) or any(bool(v) for v in m.parq_answers.values())
            except Exception:  # noqa: BLE001 — un gimnasio caído no tumba el asistente
                pass
    return PersonContext(name=user.full_name, age=age, sex=p.sex if p else None, goal=p.goal if p else None,
                         activity=p.activity_level if p else None, weight_kg=weight, height_cm=height,
                         targets=targets, min_kcal=min_kcal, parq_flag=parq_flag, gyms=gyms)


# ─── Llamada al modelo (se reemplaza en las pruebas) ───

async def call_model(system: str, messages: list[dict], tools: list[dict]):
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=60)
    kwargs: dict = {"model": settings.assistant_model, "max_tokens": 2000, "system": system, "messages": messages}
    if tools:
        kwargs["tools"] = tools
    return await client.messages.create(**kwargs)


def _block_dict(b) -> dict:
    if b.type == "tool_use":
        return {"type": "tool_use", "id": b.id, "name": b.name, "input": b.input}
    return {"type": "text", "text": getattr(b, "text", "")}


async def messages_today(adb: AsyncSession, user_id) -> int:
    start, end = utc_day_bounds(today_bogota())
    return (await adb.execute(select(func.count()).select_from(AssistantMessage).where(
        AssistantMessage.app_user_id == user_id, AssistantMessage.role == "user",
        AssistantMessage.created_at >= start, AssistantMessage.created_at < end,
    ))).scalar() or 0


async def reply(user, text: str, master: AsyncSession, adb: AsyncSession) -> dict:
    """Responde un mensaje y guarda la conversación. Devuelve la respuesta y los planes creados."""
    flag = screen(text)
    adb.add(AssistantMessage(app_user_id=user.id, role="user", text=text, flagged=flag))
    if flag == "crisis":
        msg = AssistantMessage(app_user_id=user.id, role="assistant", text=CRISIS_REPLY, flagged=flag)
        adb.add(msg)
        await adb.commit()
        return {"text": CRISIS_REPLY, "plans": [], "flagged": flag}

    ctx = await build_context(user, master, adb)
    system = f"{SYSTEM}\n{KNOWLEDGE}\nCONTEXTO DE LA PERSONA\n{ctx.describe()}"
    if flag in GUARD_NOTE:
        system += f"\n\n{GUARD_NOTE[flag]}"
    history = (await adb.execute(
        select(AssistantMessage).where(AssistantMessage.app_user_id == user.id)
        .order_by(AssistantMessage.created_at.desc()).limit(20)
    )).scalars().all()
    convo = [{"role": m.role, "content": m.text} for m in reversed(history) if m.role in ("user", "assistant")]
    if not convo or convo[-1] != {"role": "user", "content": text}:
        convo.append({"role": "user", "content": text})
    while convo and convo[0]["role"] != "user":
        convo.pop(0)
    merged: list[dict] = []
    for m in convo:  # turnos alternados: un intento fallido puede dejar dos mensajes seguidos de la persona
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1] = {"role": m["role"], "content": f"{merged[-1]['content']}\n\n{m['content']}"}
        else:
            merged.append(m)
    convo = merged
    tools = [] if flag else TOOLS

    created: list[SavedPlan] = []
    final = ""
    for _ in range(4):
        resp = await call_model(system, convo, tools)
        blocks = list(resp.content)
        if resp.stop_reason != "tool_use":
            final = "\n\n".join(b.text for b in blocks if b.type == "text").strip()
            break
        convo.append({"role": "assistant", "content": [_block_dict(b) for b in blocks]})
        results = []
        for b in blocks:
            if b.type != "tool_use":
                continue
            try:
                if b.name == "save_training_plan":
                    data, kind = validate_training(b.input), "training"
                elif b.name == "save_meal_plan":
                    data, kind = validate_meals(b.input, ctx.min_kcal), "meals"
                else:
                    raise PlanError("Herramienta desconocida")
                plan = SavedPlan(app_user_id=user.id, kind=kind, title=_s(b.input.get("title"), 120) or "Mi plan", data=data)
                adb.add(plan)
                await adb.flush()
                created.append(plan)
                results.append({"type": "tool_result", "tool_use_id": b.id,
                                "content": f"Plan guardado (id {plan.id}). Ya aparece en la app como agenda."})
            except PlanError as e:
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": str(e), "is_error": True})
        convo.append({"role": "user", "content": results})
    if not final:
        final = "Listo, dejé el plan guardado en tu app." if created else "No pude completar la respuesta. Intenta de nuevo."
    adb.add(AssistantMessage(app_user_id=user.id, role="assistant", text=final,
                             plan_ids=[str(p.id) for p in created] or None, flagged=flag))
    await adb.commit()
    return {"text": final, "plans": [plan_out(p) for p in created], "flagged": flag}


def plan_out(p: SavedPlan) -> dict:
    return {"id": str(p.id), "kind": p.kind, "title": p.title, "data": p.data, "active": p.active,
            "created_at": p.created_at.isoformat() if p.created_at else None}


def validate_plan(kind: str, data: dict, min_kcal: Optional[int]) -> dict:
    return validate_training(data) if kind == "training" else validate_meals(data, min_kcal)

