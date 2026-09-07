"""Exports por pestaña (PDF y Excel) con la marca del gym.

Un `ReportSpec` describe el documento: título, período, tiles de resumen y
secciones (tabla + totales). Los mismos datasets alimentan los dos formatos."""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date, timedelta
from xml.sax.saxutils import escape

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image as PdfImage, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.services import report_data as rd
from app.services.exports import _INK, _VOLT, _cop, _cover_sheet, _MONEY_FMT


@dataclass
class Column:
    key: str
    header: str
    money: bool = False
    align_right: bool = False
    width_mm: float | None = None


@dataclass
class Section:
    title: str
    columns: list[Column]
    rows: list[dict]
    total_row: dict | None = None
    note: str | None = None
    empty_text: str = "Sin datos en el período."


@dataclass
class Tile:
    label: str
    value: str


@dataclass
class ReportSpec:
    title: str
    subtitle: str
    tiles: list[Tile] = field(default_factory=list)
    sections: list[Section] = field(default_factory=list)


MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def _xlsx_safe(v):
    """Excel interpreta '=', '+', '-', '@' iniciales como fórmula: se neutraliza
    el texto que viene de nombres/conceptos escritos por el usuario."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def _fmt(value, money: bool) -> str:
    if value is None or value == "":
        return "—"
    if money:
        return _cop(float(value))
    if isinstance(value, float):
        return f"{value:,.1f}".replace(",", ".")
    return str(value)


# ─── PDF ───

def build_pdf(spec: ReportSpec, *, gym_name: str, logo_png: bytes | None, nit: str | None = None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=22 * mm, leftMargin=16 * mm, rightMargin=16 * mm,
                            title=spec.title, author=gym_name)
    styles = getSampleStyleSheet()
    ink = colors.HexColor("#" + _INK)
    volt = colors.HexColor("#" + _VOLT)
    h1 = ParagraphStyle("t", parent=styles["Title"], fontSize=20, spaceAfter=2, alignment=0, textColor=ink)
    sub = ParagraphStyle("s", parent=styles["Normal"], textColor=colors.grey, fontSize=9)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12.5, textColor=ink, spaceBefore=8, spaceAfter=4)
    note_style = ParagraphStyle("n", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
    cell = ParagraphStyle("c", parent=styles["Normal"], fontSize=8.5, leading=10.5)
    generated = today_bogota().strftime("%d/%m/%Y")

    def _decor(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(volt)
        canvas.rect(0, A4[1] - 6 * mm, A4[0], 6 * mm, stroke=0, fill=1)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(16 * mm, 12 * mm, f"{gym_name} · {spec.title} · generado {generated}")
        canvas.drawRightString(A4[0] - 16 * mm, 12 * mm, f"Página {canvas.getPageNumber()}")
        canvas.restoreState()

    els = []
    head_left = []
    if logo_png:
        try:
            reader = ImageReader(io.BytesIO(logo_png))
            iw, ih = reader.getSize()
            w = 26 * mm
            head_left.append(PdfImage(io.BytesIO(logo_png), width=w, height=w * ih / iw))
        except Exception:
            pass
    head_left += [Paragraph(escape(gym_name), h1)]
    if nit:
        head_left.append(Paragraph(f"NIT {escape(nit)}", sub))
    head_right = [
        Paragraph(escape(spec.title), ParagraphStyle("rt", parent=h2, alignment=2, fontSize=14)),
        Paragraph(escape(spec.subtitle), ParagraphStyle("rs", parent=sub, alignment=2)),
    ]
    head = Table([[head_left, head_right]], colWidths=[None, 70 * mm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    els += [head, Spacer(1, 5 * mm)]

    if spec.tiles:
        n = len(spec.tiles)
        per_row = min(n, 4)
        rows_t = [spec.tiles[i:i + per_row] for i in range(0, n, per_row)]
        for chunk in rows_t:
            data = [[t.label for t in chunk], [t.value for t in chunk]]
            t = Table(data, colWidths=[(A4[0] - 32 * mm) / per_row] * len(chunk))
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F5F5F5")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.grey),
                ("FONTSIZE", (0, 0), (-1, 0), 7.5),
                ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 1), (-1, 1), 13),
                ("TEXTCOLOR", (0, 1), (-1, 1), ink),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("TOPPADDING", (0, 0), (-1, 0), 6), ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
                ("LINEBEFORE", (1, 0), (-1, -1), 0.5, colors.white),
            ]))
            els += [t, Spacer(1, 2 * mm)]
        els.append(Spacer(1, 3 * mm))

    for sec in spec.sections:
        block = [Paragraph(escape(sec.title), h2)]
        if not sec.rows:
            block.append(Paragraph(escape(sec.empty_text), note_style))
        else:
            header = [c.header for c in sec.columns]
            data = [header]
            for r in sec.rows:
                data.append([Paragraph(escape(_fmt(r.get(c.key), c.money)), cell) if not (c.money or c.align_right) else _fmt(r.get(c.key), c.money) for c in sec.columns])
            if sec.total_row:
                data.append([_fmt(sec.total_row.get(c.key), c.money) if c.key in sec.total_row else "" for c in sec.columns])
            avail = A4[0] - 32 * mm
            fixed = sum(c.width_mm for c in sec.columns if c.width_mm)
            flex = [c for c in sec.columns if not c.width_mm]
            widths = [c.width_mm * mm if c.width_mm else max((avail - fixed * mm) / max(len(flex), 1), 20 * mm) for c in sec.columns]
            t = Table(data, colWidths=widths, repeatRows=1)
            style = [
                ("BACKGROUND", (0, 0), (-1, 0), volt),
                ("TEXTCOLOR", (0, 0), (-1, 0), ink),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F7F7")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#DDDDDD")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
            for i, c in enumerate(sec.columns):
                if c.money or c.align_right:
                    style.append(("ALIGN", (i, 0), (i, -1), "RIGHT"))
            if sec.total_row:
                style += [("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("LINEABOVE", (0, -1), (-1, -1), 1, ink),
                          ("BACKGROUND", (0, -1), (-1, -1), colors.white)]
            t.setStyle(TableStyle(style))
            block.append(t)
        if sec.note:
            block.append(Paragraph(escape(sec.note), note_style))
        els.append(KeepTogether(block[:2]) if len(block) >= 2 and len(sec.rows) <= 12 else block[0])
        if not (len(block) >= 2 and len(sec.rows) <= 12):
            els += block[1:]
        else:
            els += block[2:]
        els.append(Spacer(1, 3 * mm))

    doc.build(els, onFirstPage=_decor, onLaterPages=_decor)
    return buf.getvalue()


# ─── Excel ───

def build_xlsx(spec: ReportSpec, *, gym_name: str, logo_png: bytes | None) -> bytes:
    wb = Workbook()
    _cover_sheet(wb, gym_name, logo_png)
    ws0 = wb.active
    ws0.cell(row=ws0.max_row + 2, column=2, value=spec.title).font = Font(bold=True, size=14, color=_INK)
    ws0.cell(row=ws0.max_row + 1, column=2, value=spec.subtitle).font = Font(size=10, color="666666")
    r0 = ws0.max_row + 2
    for i, t in enumerate(spec.tiles):
        ws0.cell(row=r0 + i, column=2, value=t.label).font = Font(color="666666")
        ws0.cell(row=r0 + i, column=3, value=_xlsx_safe(t.value)).font = Font(bold=True)
    used = {"Portada"}
    for sec in spec.sections:
        title = sec.title[:28]
        base, k = title, 2
        while title in used:
            title = f"{base[:25]} {k}"
            k += 1
        used.add(title)
        ws = wb.create_sheet(title=title.replace("/", "-").replace(":", ""))
        header_font = Font(bold=True, color=_INK)
        header_fill = PatternFill("solid", fgColor=_VOLT)
        for ci, c in enumerate(sec.columns, start=1):
            cell = ws.cell(row=1, column=ci, value=c.header)
            cell.font, cell.fill, cell.alignment = header_font, header_fill, Alignment(horizontal="center")
        for ri, row in enumerate(sec.rows, start=2):
            for ci, c in enumerate(sec.columns, start=1):
                v = row.get(c.key)
                cell = ws.cell(row=ri, column=ci, value=_xlsx_safe(v))
                if c.money:
                    cell.number_format = _MONEY_FMT
        n = len(sec.rows)
        if sec.total_row:
            for ci, c in enumerate(sec.columns, start=1):
                v = sec.total_row.get(c.key, "")
                cell = ws.cell(row=n + 2, column=ci, value=_xlsx_safe(v))
                cell.font = Font(bold=True)
                if c.money and v != "":
                    cell.number_format = _MONEY_FMT
        for ci, c in enumerate(sec.columns, start=1):
            width = max([len(c.header)] + [len(str(r.get(c.key, ""))) for r in sec.rows]) if sec.rows else len(c.header)
            ws.column_dimensions[get_column_letter(ci)].width = min(width + 4, 48)
        ws.freeze_panes = "A2"
        if n:
            ws.auto_filter.ref = f"A1:{get_column_letter(len(sec.columns))}{n + 1}"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── Specs por pestaña ───

def _period_label(from_day: str, to_day: str) -> str:
    f = date.fromisoformat(from_day).strftime("%d/%m/%Y")
    t = date.fromisoformat(to_day).strftime("%d/%m/%Y")
    return f"{f} — {t}" if f != t else f


async def spec_ingresos(db: AsyncSession, from_date, to_date) -> ReportSpec:
    s = await rd.summary(db, from_date, to_date)
    kinds = await rd.revenue_by_kind_and_method(db, from_date, to_date)
    plans = await rd.revenue_by_plan(db, from_date, to_date)
    daily = await rd.revenue_daily(db, from_date, to_date)
    expenses = await rd.expenses_by_category(db, from_date, to_date)
    payments = await rd.payments_list(db, from_date, to_date)
    truncated_note = f"Se muestran los primeros {rd.PAYMENTS_LIST_LIMIT} pagos del período." if len(payments) >= rd.PAYMENTS_LIST_LIMIT else None
    period = _period_label(s["from"], s["to"])
    return ReportSpec(
        title="Ingresos", subtitle=period,
        tiles=[Tile("Ingresos confirmados", _cop(s["revenue"])), Tile("Egresos", _cop(s["expenses"])),
               Tile("Utilidad", _cop(s["profit"])), Tile("Pendiente por confirmar", _cop(s["pending"]))],
        sections=[
            Section("Por fuente de ingreso", [Column("label", "Fuente"), Column("count", "Pagos", align_right=True, width_mm=25), Column("amount", "Monto", money=True, width_mm=40)],
                    kinds["by_kind"], {"label": "TOTAL", "amount": kinds["total"]}),
            Section("Por método de pago", [Column("label", "Método"), Column("count", "Pagos", align_right=True, width_mm=25), Column("amount", "Monto", money=True, width_mm=40)],
                    kinds["by_method"], {"label": "TOTAL", "amount": kinds["total"]}),
            Section("Por plan", [Column("plan_name", "Plan"), Column("count", "Cobros", align_right=True, width_mm=25), Column("amount", "Monto", money=True, width_mm=40)], plans),
            Section("Egresos por categoría", [Column("label", "Categoría"), Column("count", "Registros", align_right=True, width_mm=25), Column("amount", "Monto", money=True, width_mm=40)],
                    expenses, {"label": "TOTAL", "amount": s["expenses"]} if expenses else None),
            Section("Ingresos por día", [Column("date", "Fecha", width_mm=30), Column("membership", "Membresías", money=True), Column("day_pass", "Pases", money=True),
                                        Column("product", "Productos", money=True), Column("amount", "Total", money=True)],
                    [{**d, "date": date.fromisoformat(d["date"]).strftime("%d/%m/%Y")} for d in daily if d["amount"] > 0], {"date": "TOTAL", "amount": s["revenue"]}),
            Section("Detalle de pagos", [Column("date", "Fecha", width_mm=28), Column("member", "Socio"), Column("concept", "Concepto"), Column("method", "Método", width_mm=24),
                                         Column("status", "Estado", width_mm=20), Column("amount", "Monto", money=True, width_mm=26)], payments, note=truncated_note),
        ],
    )


async def spec_ventas(db: AsyncSession, from_date, to_date) -> ReportSpec:
    from app.api.v1.reports import _product_sales_data
    data = await _product_sales_data(db, from_date, to_date)
    stock = await rd.stockout(db)
    period = _period_label(data["from"], data["to"])
    return ReportSpec(
        title="Ventas de productos", subtitle=period,
        tiles=[Tile("Unidades", str(data["total_units"])), Tile("Ingreso neto", _cop(data["total_revenue"])),
               Tile("Costo", _cop(data["total_cost"])), Tile("Margen", _cop(data["total_margin"]))],
        sections=[
            Section("Ventas por producto", [Column("name", "Producto"), Column("units", "Unid.", align_right=True, width_mm=18), Column("gross", "Bruto", money=True, width_mm=26),
                                            Column("discount", "Desc.", money=True, width_mm=22), Column("revenue", "Neto", money=True, width_mm=26),
                                            Column("cost", "Costo", money=True, width_mm=26), Column("margin", "Margen", money=True, width_mm=26)],
                    data["products"], {"name": "TOTAL", "units": data["total_units"], "revenue": data["total_revenue"], "cost": data["total_cost"], "margin": data["total_margin"]}),
            Section("Inventario actual y proyección de agotamiento (ritmo de 30 días)",
                    [Column("name", "Producto"), Column("stock", "Stock", align_right=True, width_mm=20), Column("units_sold_30d", "Vend. 30d", align_right=True, width_mm=22),
                     Column("daily_velocity", "Por día", align_right=True, width_mm=20), Column("days_left", "Días restantes", align_right=True, width_mm=28), Column("runs_out_on", "Se agota", width_mm=26)],
                    stock),
        ],
    )


async def spec_pases(db: AsyncSession, from_date, to_date) -> ReportSpec:
    from app.api.v1.reports import _day_passes_data
    data = await _day_passes_data(db, from_date, to_date)
    period = _period_label(data["from"], data["to"])
    return ReportSpec(
        title="Pases del día", subtitle=period,
        tiles=[Tile("Pases vendidos", str(data["total_count"])), Tile("Ingresos", _cop(data["total_amount"])),
               Tile("Personas distintas", str(data["unique_people"])), Tile("Se hicieron socios", str(data["converted_to_member"]))],
        sections=[
            Section("Por tipo de pase", [Column("name", "Pase"), Column("includes_trainer", "Entrenador", width_mm=26), Column("count", "Cantidad", align_right=True, width_mm=24), Column("amount", "Ingresos", money=True, width_mm=36)],
                    [{**t, "includes_trainer": "Sí" if t["includes_trainer"] else "No"} for t in data["by_type"]],
                    {"name": "TOTAL", "count": data["total_count"], "amount": data["total_amount"]}),
            Section("Por día", [Column("date", "Fecha", width_mm=30), Column("count", "Pases", align_right=True, width_mm=24), Column("amount", "Ingresos", money=True, width_mm=36)],
                    [{**d, "date": date.fromisoformat(d["date"]).strftime("%d/%m/%Y")} for d in data["daily"]]),
        ],
    )


async def spec_socios(db: AsyncSession, from_date, to_date) -> ReportSpec:
    from app.services.exports import _expiring_rows, _inactive_rows, _roster_rows
    o = await rd.members_overview(db, from_date, to_date)
    st = o["by_membership_status"]
    labels = {"active": "Con membresía activa", "scheduled": "Programada", "frozen": "Congelada", "in_grace": "En gracia", "expired": "Vencida", "no_membership": "Sin membresía"}
    return ReportSpec(
        title="Socios", subtitle=_period_label(o["from"], o["to"]),
        tiles=[Tile("Socios registrados", str(o["total"])), Tile("Cuentas activas", str(o["active_accounts"])),
               Tile("Nuevos en el período", str(o["new_in_period"])), Tile("Visitantes (pase)", str(o["visitors"]))],
        sections=[
            Section("Estado de membresía (socios activos)", [Column("label", "Estado"), Column("count", "Socios", align_right=True, width_mm=30)],
                    [{"label": labels.get(k, k), "count": v} for k, v in st.items()]),
            Section("Nuevos en el período", [Column("full_name", "Socio"), Column("phone", "Teléfono", width_mm=34), Column("created_at", "Registro", width_mm=28)], o["new_list"]),
            Section("Membresías por vencer (30 días)", [Column("member_name", "Socio"), Column("plan_name", "Plan"), Column("end_date", "Vence", width_mm=28), Column("days_remaining", "Días", align_right=True, width_mm=18)],
                    await _expiring_rows(db)),
            Section("Sin venir hace 14+ días", [Column("full_name", "Socio"), Column("phone", "Teléfono", width_mm=34), Column("last_checkin", "Última visita", width_mm=30), Column("days_inactive", "Días", align_right=True, width_mm=18)],
                    await _inactive_rows(db)),
            Section("Listado de socios", [Column("full_name", "Nombre"), Column("id_number", "Documento", width_mm=30), Column("phone", "Teléfono", width_mm=32), Column("email", "Email"), Column("status", "Estado", width_mm=20)],
                    await _roster_rows(db)),
        ],
    )


async def spec_asistencia(db: AsyncSession, from_date, to_date) -> ReportSpec:
    a = await rd.attendance(db, from_date, to_date)
    peak = a["peak"]
    if peak["busiest_hour"] is not None:
        busiest = f"{rd.eng.WEEKDAYS_ES[peak['busiest_weekday']]} · {peak['busiest_hour']:02d}:00"
    else:
        busiest = "—"
    return ReportSpec(
        title="Asistencia", subtitle=_period_label(a["from"], a["to"]),
        tiles=[Tile("Ingresos", str(a["total"])), Tile("Personas distintas", str(a["unique_members"])),
               Tile("Denegados", str(a["denied"])), Tile("Pico", busiest)],
        sections=[
            Section("Por día", [Column("date", "Fecha", width_mm=30), Column("count", "Ingresos", align_right=True, width_mm=30)],
                    [{**d, "date": date.fromisoformat(d["date"]).strftime("%d/%m/%Y")} for d in a["daily"]], {"date": "TOTAL", "count": a["total"]}),
            Section("Por día de la semana", [Column("label", "Día"), Column("count", "Ingresos", align_right=True, width_mm=30)], peak["by_weekday"]),
            Section("Por hora", [Column("hour", "Hora", align_right=True, width_mm=20), Column("count", "Ingresos", align_right=True, width_mm=30)],
                    [{"hour": f"{h['hour']:02d}:00", "count": h["count"]} for h in peak["by_hour"] if h["count"] > 0]),
            Section("Por origen", [Column("source", "Origen"), Column("count", "Ingresos", align_right=True, width_mm=30)], a["by_source"]),
        ],
    )


async def spec_retencion(db: AsyncSession, from_date, to_date) -> ReportSpec:
    from app.api.v1.reports import _retention_data
    ret = await _retention_data(db, 6)
    coh = await rd.cohorts(db, 6)
    risk = await rd.churn_risk(db, 50)
    last = next((r for r in reversed(ret) if r["renewal_rate"] is not None), None)
    return ReportSpec(
        title="Retención", subtitle="Últimos 6 meses",
        tiles=[Tile("Renovación (último mes con datos)", f"{last['renewal_rate']}%" if last else "—"),
               Tile("Churn", f"{last['churn_rate']}%" if last else "—"),
               Tile("Socios en riesgo alto", str(sum(1 for r in risk if r["level"] == "alto")))],
        sections=[
            Section("Renovación mensual", [Column("month", "Mes", width_mm=30), Column("ended", "Vencieron", align_right=True, width_mm=26), Column("renewed", "Renovaron", align_right=True, width_mm=26),
                                           Column("renewal_rate", "Renovación %", align_right=True, width_mm=28), Column("churn_rate", "Churn %", align_right=True, width_mm=24)], ret),
            Section("Cohortes por mes de ingreso", [Column("month", "Cohorte", width_mm=30), Column("size", "Socios", align_right=True, width_mm=22), Column("active_now", "Activos hoy", align_right=True, width_mm=26),
                                                     Column("active_pct", "Activos %", align_right=True, width_mm=24), Column("renewed", "Renovaron", align_right=True, width_mm=24), Column("renewed_pct", "Renov. %", align_right=True, width_mm=22)], coh),
            Section("Riesgo de abandono", [Column("full_name", "Socio"), Column("phone", "Teléfono", width_mm=30), Column("score", "Puntaje", align_right=True, width_mm=20), Column("level", "Nivel", width_mm=18), Column("reasons_txt", "Por qué")],
                    [{**r, "reasons_txt": "; ".join(r["reasons"])} for r in risk]),
        ],
    )


async def spec_inteligencia(db: AsyncSession, from_date, to_date) -> ReportSpec:
    """Exporta lo mismo que muestra la pestaña Inteligencia: proyección de
    ingresos, horas pico, riesgo de abandono y stock por agotarse."""
    fc = await rd.forecast(db)
    a = await rd.attendance(db, from_date, to_date)
    peak = a["peak"]
    risk = await rd.churn_risk(db, 50)
    stock = await rd.stockout(db)
    if peak["busiest_hour"] is not None:
        busiest = f"{rd.eng.WEEKDAYS_ES[peak['busiest_weekday']]} · {peak['busiest_hour']:02d}:00"
    else:
        busiest = "—"
    vs_prev = f"{fc['vs_previous_pct']:+.0f}%" if fc.get("vs_previous_pct") is not None else "—"
    return ReportSpec(
        title="Inteligencia", subtitle=_period_label(a["from"], a["to"]),
        tiles=[Tile("Proyección del mes", _cop(fc["projection"])),
               Tile("Va del mes", _cop(fc["month_to_date"])),
               Tile("Contra meses previos", vs_prev),
               Tile("Hora pico", busiest)],
        sections=[
            Section("Proyección de ingresos del mes",
                    [Column("concepto", "Concepto"), Column("valor", "Valor", align_right=True, width_mm=40)],
                    [{"concepto": "Ingresos en lo que va del mes", "valor": _cop(fc["month_to_date"])},
                     {"concepto": f"Ritmo diario ({fc['elapsed_days']} de {fc['days_in_month']} días)", "valor": _cop(fc["daily_pace"])},
                     {"concepto": "Proyección al cierre", "valor": _cop(fc["projection"])},
                     {"concepto": "Rango probable", "valor": f"{_cop(fc['projection_low'])} a {_cop(fc['projection_high'])}"},
                     {"concepto": "Promedio de los 3 meses previos",
                      "valor": _cop(fc["avg_previous_months"]) if fc.get("avg_previous_months") is not None else "sin historial"}]),
            Section("Horas pico", [Column("hour", "Hora", align_right=True, width_mm=20), Column("count", "Ingresos", align_right=True, width_mm=30)],
                    [{"hour": f"{h['hour']:02d}:00", "count": h["count"]} for h in peak["by_hour"] if h["count"] > 0]),
            Section("Días más movidos", [Column("label", "Día"), Column("count", "Ingresos", align_right=True, width_mm=30)], peak["by_weekday"]),
            Section("Socios en riesgo de abandono",
                    [Column("full_name", "Socio"), Column("phone", "Teléfono", width_mm=30),
                     Column("score", "Puntaje", align_right=True, width_mm=20), Column("level", "Nivel", width_mm=18),
                     Column("reasons_txt", "Por qué")],
                    [{**r, "reasons_txt": "; ".join(r["reasons"])} for r in risk]),
            Section("Inventario por agotarse",
                    [Column("name", "Producto"), Column("stock", "Stock", align_right=True, width_mm=20),
                     Column("units_sold_30d", "Vendidos 30d", align_right=True, width_mm=28),
                     Column("days_left_txt", "Días restantes", align_right=True, width_mm=28),
                     Column("runs_out_on_txt", "Se agota", width_mm=26)],
                    [{**p, "days_left_txt": p["days_left"] if p["days_left"] is not None else "—",
                      "runs_out_on_txt": date.fromisoformat(p["runs_out_on"]).strftime("%d/%m/%Y") if p.get("runs_out_on") else "—"}
                     for p in stock]),
        ],
    )


async def spec_cierre(db: AsyncSession, year: int, month: int) -> ReportSpec:
    start = date(year, month, 1)
    end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)
    ing = await spec_ingresos(db, start, end)
    ven = await spec_ventas(db, start, end)
    pas = await spec_pases(db, start, end)
    soc = await spec_socios(db, start, end)
    asi = await spec_asistencia(db, start, end)
    ret = await spec_retencion(db, start, end)
    label = f"{MESES_ES[month - 1].capitalize()} {year}"
    generated = today_bogota().strftime("%d/%m/%Y")
    # Secciones que describen el estado de HOY, no el mes: se marcan para no confundir un cierre pasado
    snapshot_titles = {"Inventario actual y proyección de agotamiento (ritmo de 30 días)", "Membresías por vencer (30 días)",
                       "Sin venir hace 14+ días", "Renovación mensual", "Cohortes por mes de ingreso", "Riesgo de abandono"}
    sections = []
    for sp, prefix in ((ing, "Ingresos"), (ven, "Ventas"), (pas, "Pases"), (soc, "Socios"), (asi, "Asistencia"), (ret, "Retención")):
        for sec in sp.sections:
            if sec.title == "Detalle de pagos" or sec.title == "Listado de socios":
                continue
            title = f"{prefix} · {sec.title}"
            note = sec.note
            if sec.title in snapshot_titles:
                title += f" (estado al {generated})"
            sections.append(Section(title, sec.columns, sec.rows, sec.total_row, note, sec.empty_text))
    return ReportSpec(
        title="Cierre de mes", subtitle=label,
        tiles=ing.tiles[:3] + [Tile("Ingresos por pases", pas.tiles[1].value), Tile("Margen productos", ven.tiles[3].value), Tile("Nuevos socios", soc.tiles[2].value), Tile("Ingresos al gym", asi.tiles[0].value), Tile("Renovación", ret.tiles[0].value)],
        sections=sections,
    )


SPECS = {
    "ingresos": spec_ingresos,
    "ventas": spec_ventas,
    "pases": spec_pases,
    "socios": spec_socios,
    "asistencia": spec_asistencia,
    "retencion": spec_retencion,
    "inteligencia": spec_inteligencia,
}
