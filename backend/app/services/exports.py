"""Generación server-side de reportes exportables (Excel .xlsx y PDF).

Una sola fuente de verdad para los datos del export: las mismas consultas que
alimentan /reports, ensambladas aquí en datasets tabulares. El frontend solo
dispara la descarga."""
import io
from datetime import date, datetime, timedelta
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.tenant.checkin import CheckIn
from app.models.tenant.expense import Expense
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.payment import Payment, PaymentStatus
from app.services.gym_settings import get_gym_settings

_VOLT = "D4FF00"  # color de marca para encabezados


def _month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return datetime.combine(start, datetime.min.time()), datetime.combine(end, datetime.min.time())


def _months_back(today: date, i: int) -> tuple[int, int]:
    m, y = today.month - i, today.year
    while m <= 0:
        m += 12
        y -= 1
    return y, m


async def _profit_rows(db: AsyncSession, months: int = 12) -> list[dict]:
    today = today_bogota()
    rows = []
    for i in range(months - 1, -1, -1):
        y, m = _months_back(today, i)
        start_dt, end_dt = _month_bounds(y, m)
        income = (await db.execute(
            select(func.coalesce(func.sum(Payment.amount), Decimal("0"))).where(
                Payment.created_at >= start_dt, Payment.created_at < end_dt,
                Payment.status == PaymentStatus.paid,
            )
        )).scalar() or Decimal("0")
        expenses = (await db.execute(
            select(func.coalesce(func.sum(Expense.amount), Decimal("0"))).where(
                Expense.created_at >= start_dt, Expense.created_at < end_dt,
            )
        )).scalar() or Decimal("0")
        rows.append({
            "month": date(y, m, 1).strftime("%b %Y"),
            "income": float(income),
            "expenses": float(expenses),
            "profit": float(income - expenses),
        })
    return rows


async def _expiring_rows(db: AsyncSession, days: int = 30) -> list[dict]:
    today = today_bogota()
    cutoff = today + timedelta(days=days)
    result = await db.execute(
        select(Membership, Member.full_name)
        .join(Member, Member.id == Membership.member_id)
        .where(
            Membership.end_date <= cutoff,
            Membership.end_date >= today,
            Membership.status == MembershipStatus.active.value,
        )
        .order_by(Membership.end_date)
    )
    return [
        {
            "member_name": full_name,
            "plan_name": m.plan_name,
            "end_date": m.end_date.isoformat(),
            "days_remaining": (m.end_date - today).days,
        }
        for m, full_name in result.all()
    ]


async def _inactive_rows(db: AsyncSession, days: int = 14) -> list[dict]:
    today = today_bogota()
    cutoff = datetime.combine(today - timedelta(days=days), datetime.min.time())
    recent = (
        select(CheckIn.member_id).where(CheckIn.created_at >= cutoff).distinct().scalar_subquery()
    )
    members = (await db.execute(
        select(Member)
        .where(Member.status == MemberStatus.active, Member.id.not_in(recent))
        .order_by(Member.full_name)
    )).scalars().all()
    ids = [m.id for m in members]
    last_map: dict = {}
    if ids:
        lr = await db.execute(
            select(CheckIn.member_id, func.max(CheckIn.created_at))
            .where(CheckIn.member_id.in_(ids)).group_by(CheckIn.member_id)
        )
        last_map = {row[0]: row[1] for row in lr.all()}
    return [
        {
            "full_name": m.full_name,
            "phone": m.phone or "",
            "email": m.email or "",
            "last_checkin": last_map[m.id].date().isoformat() if last_map.get(m.id) else "Nunca",
            "days_inactive": (today - last_map[m.id].date()).days if last_map.get(m.id) else "",
        }
        for m in members
    ]


async def _roster_rows(db: AsyncSession) -> list[dict]:
    members = (await db.execute(
        select(Member).order_by(Member.full_name)
    )).scalars().all()
    return [
        {
            "full_name": m.full_name,
            "id_number": m.id_number or "",
            "phone": m.phone or "",
            "email": m.email or "",
            "status": "Activo" if m.status == MemberStatus.active else "Inactivo",
        }
        for m in members
    ]


# ─────────────────────────── Excel ───────────────────────────

def _write_sheet(ws, title: str, columns: list[tuple[str, str]], rows: list[dict]) -> None:
    """columns: lista de (clave, encabezado). Aplica estilo de marca al header."""
    ws.title = title
    header_font = Font(bold=True, color="111111")
    header_fill = PatternFill("solid", fgColor=_VOLT)
    for col_idx, (_, header) in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
    for row_idx, row in enumerate(rows, start=2):
        for col_idx, (key, _) in enumerate(columns, start=1):
            ws.cell(row=row_idx, column=col_idx, value=row.get(key))
    # Ancho aproximado por contenido
    for col_idx, (key, header) in enumerate(columns, start=1):
        width = max(len(header), *(len(str(r.get(key, ""))) for r in rows)) if rows else len(header)
        ws.column_dimensions[get_column_letter(col_idx)].width = min(width + 4, 45)
    ws.freeze_panes = "A2"


async def build_reports_xlsx(db: AsyncSession) -> bytes:
    wb = Workbook()
    _write_sheet(
        wb.active, "Utilidad",
        [("month", "Mes"), ("income", "Ingresos"), ("expenses", "Egresos"), ("profit", "Utilidad")],
        await _profit_rows(db),
    )
    _write_sheet(
        wb.create_sheet(), "Por vencer",
        [("member_name", "Socio"), ("plan_name", "Plan"), ("end_date", "Vence"), ("days_remaining", "Días")],
        await _expiring_rows(db),
    )
    _write_sheet(
        wb.create_sheet(), "Inactivos",
        [("full_name", "Socio"), ("phone", "Teléfono"), ("email", "Email"),
         ("last_checkin", "Última visita"), ("days_inactive", "Días sin venir")],
        await _inactive_rows(db),
    )
    _write_sheet(
        wb.create_sheet(), "Socios",
        [("full_name", "Nombre"), ("id_number", "Documento"), ("phone", "Teléfono"),
         ("email", "Email"), ("status", "Estado")],
        await _roster_rows(db),
    )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─────────────────────────── PDF ───────────────────────────

def _cop(v: float) -> str:
    return "$" + f"{v:,.0f}".replace(",", ".")


async def build_profit_pdf(db: AsyncSession) -> bytes:
    gym = await get_gym_settings(db)
    gym_name = getattr(gym, "legal_name", None) or getattr(gym, "name", None) or "Gimnasio"
    rows = await _profit_rows(db)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Title"], fontSize=18, spaceAfter=4)
    sub_style = ParagraphStyle("s", parent=styles["Normal"], textColor=colors.grey, fontSize=9)

    elements = [
        Paragraph(gym_name, title_style),
        Paragraph(
            f"Estado de resultados · generado {today_bogota().strftime('%d/%m/%Y')}",
            sub_style,
        ),
        Spacer(1, 10 * mm),
    ]

    data = [["Mes", "Ingresos", "Egresos", "Utilidad"]]
    tot_i = tot_e = tot_p = 0.0
    for r in rows:
        data.append([r["month"], _cop(r["income"]), _cop(r["expenses"]), _cop(r["profit"])])
        tot_i += r["income"]; tot_e += r["expenses"]; tot_p += r["profit"]
    data.append(["TOTAL", _cop(tot_i), _cop(tot_e), _cop(tot_p)])

    table = Table(data, colWidths=[40 * mm, 40 * mm, 40 * mm, 40 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#" + _VOLT)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#111111")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F5F5F5")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#DDDDDD")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(table)

    doc.build(elements)
    return buf.getvalue()
