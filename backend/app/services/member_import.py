"""Importación masiva de miembros desde Excel.

Resuelve el problema de "datos sin estructura" imponiendo una plantilla: el owner
descarga un .xlsx con columnas fijas, lo llena y lo sube. Cada fila se valida con el
mismo schema Pydantic que el alta individual (`MemberBase`), de modo que los validadores
de teléfono colombiano, cédula y tipo de sangre se reutilizan tal cual. El resultado es
un reporte fila-por-fila: las filas válidas se crean; las inválidas se reportan con su
número de fila y motivo, sin abortar el lote."""
import io
from datetime import date, datetime

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.member import Member, IdType, Gender, TrainingGoal
from app.schemas.member import MemberBase
from app.core.timeutil import utcnow_naive

from app.services.exports import _BRAND_TINT  # noqa: E402

# (clave del schema, encabezado visible, ¿obligatorio?)
COLUMNS: list[tuple[str, str, bool]] = [
    ("full_name", "Nombre completo", True),
    ("email", "Correo", True),
    ("phone", "Teléfono", False),
    ("id_type", "Tipo de documento", False),
    ("id_number", "Número de documento", False),
    ("gender", "Género", False),
    ("birth_date", "Fecha de nacimiento (AAAA-MM-DD)", False),
    ("city", "Ciudad", False),
    ("country", "País (2 letras)", False),
    ("emergency_contact_name", "Contacto de emergencia", False),
    ("emergency_contact_phone", "Teléfono de emergencia", False),
    ("blood_type", "Tipo de sangre", False),
    ("training_goal", "Objetivo", False),
    ("notes", "Notas", False),
]

_HEADER_TO_KEY = {label.strip().lower(): key for key, label, _ in COLUMNS}
_HEADER_TO_KEY.update({key: key for key, _, _ in COLUMNS})

_EXAMPLE_ROW = {
    "full_name": "María Gómez",
    "email": "maria@ejemplo.co",
    "phone": "3001234567",
    "id_type": "CC",
    "id_number": "1018456789",
    "gender": "F",
    "birth_date": "1995-04-12",
    "city": "Bogotá",
    "country": "CO",
    "emergency_contact_name": "Juan Gómez",
    "emergency_contact_phone": "3019876543",
    "blood_type": "O+",
    "training_goal": "weight_loss",
    "notes": "",
}

_ENUM_HELP = {
    "Tipo de documento": [f"{e.value}" for e in IdType],
    "Género": [e.value for e in Gender],
    "Objetivo": [e.value for e in TrainingGoal],
    "Tipo de sangre": ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
}


def build_template() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Miembros"

    header_font = Font(bold=True, color="000000")
    header_fill = PatternFill("solid", fgColor=_BRAND_TINT)
    for col_idx, (_, label, required) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=label + (" *" if required else ""))
        cell.font = header_font
        cell.fill = header_fill
        ws.column_dimensions[cell.column_letter].width = max(len(label) + 4, 16)

    for col_idx, (key, _, _) in enumerate(COLUMNS, start=1):
        ws.cell(row=2, column=col_idx, value=_EXAMPLE_ROW.get(key, ""))

    info = wb.create_sheet("Instrucciones")
    info.column_dimensions["A"].width = 28
    info.column_dimensions["B"].width = 60
    info.cell(row=1, column=1, value="Campo").font = Font(bold=True)
    info.cell(row=1, column=2, value="Valores válidos").font = Font(bold=True)
    info.append(["Obligatorios", "Nombre completo y Correo"])
    info.append(["Correo", "Debe ser único en el gimnasio"])
    info.append(["Número de documento", "Único cuando se registra"])
    for label, values in _ENUM_HELP.items():
        info.append([label, ", ".join(values)])
    info.append(["Fecha de nacimiento", "Formato AAAA-MM-DD (ej. 1995-04-12)"])
    info.append(["Fila de ejemplo", "Bórrala antes de subir el archivo"])

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _normalize(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        return v or None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _integrity_field(exc: IntegrityError) -> tuple[str, str]:
    msg = str(getattr(exc, "orig", exc))
    if "uq_member_id_number" in msg:
        return "id_number", "La cédula ya está registrada"
    if "uq_member_email" in msg or "email" in msg.lower():
        return "email", "El correo ya está registrado"
    return "fila", "Registro duplicado"


async def import_members(db: AsyncSession, file_bytes: bytes) -> dict:
    try:
        wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    except Exception:
        raise ValueError("No se pudo leer el archivo. Sube un .xlsx válido.")

    ws = wb["Miembros"] if "Miembros" in wb.sheetnames else wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"created": 0, "errors": []}

    header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]
    col_keys = [_HEADER_TO_KEY.get(h) for h in header]

    created = 0
    errors: list[dict] = []

    for line_no, raw in enumerate(rows[1:], start=2):
        record = {
            key: _normalize(raw[i])
            for i, key in enumerate(col_keys)
            if key and i < len(raw)
        }
        if not any(v is not None for v in record.values()):
            continue  # fila en blanco

        try:
            member_in = MemberBase(**record)
        except ValidationError as exc:
            for err in exc.errors():
                field = err["loc"][0] if err["loc"] else "fila"
                errors.append({"row": line_no, "field": str(field), "message": err["msg"]})
            continue

        try:
            async with db.begin_nested():
                # El owner atesta al importar que sus socios ya firmaron la política de datos
                db.add(Member(**member_in.model_dump(), consent_data_at=utcnow_naive()))
            created += 1
        except IntegrityError as exc:
            field, message = _integrity_field(exc)
            errors.append({"row": line_no, "field": field, "message": message})

    await db.commit()
    return {"created": created, "errors": errors}
