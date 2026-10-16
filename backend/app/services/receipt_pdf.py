"""Comprobante de pago en PDF: se arma desde el snapshot del recibo (inmutable),
con la marca del gym y sus datos fiscales. Base para la factura DIAN futura.

Media carta vertical (A5): se lee bien en el celular cuando llega por WhatsApp
y se imprime de a dos por hoja. Tinta casi negra y un solo acento de color, para
que también salga bien en blanco y negro."""
import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image as PdfImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.master.tenant import Tenant
from app.models.tenant.payment import Payment, PaymentStatus
from app.models.tenant.receipt import Receipt
from app.services.exports import _BRAND, _BRAND_TEXT, _BRAND_TINT, _INK, _cop
from app.services.receipts import format_issued, receipt_view

_METHOD_LABELS = {"cash": "Efectivo", "transfer": "Transferencia", "card": "Tarjeta", "wompi": "Pago en línea (Wompi)"}
_STATUS = {
    PaymentStatus.paid: ("PAGADO", "166534", "DCFCE7"),
    PaymentStatus.refunded: ("DEVUELTO", "991B1B", "FEE2E2"),
    PaymentStatus.voided: ("ANULADO", "991B1B", "FEE2E2"),
    PaymentStatus.failed: ("RECHAZADO", "991B1B", "FEE2E2"),
}
_WATERMARK = {PaymentStatus.refunded, PaymentStatus.voided, PaymentStatus.failed}

_INK_C = colors.HexColor("#" + _INK)
_MUTED = colors.HexColor("#57534E")
_FAINT = colors.HexColor("#A8A29E")
_RULE = colors.HexColor("#E7E5E4")
_BRAND_C = colors.HexColor("#" + _BRAND)


def _style(name: str, **kw) -> ParagraphStyle:
    base = {"fontName": "Helvetica", "fontSize": 9, "leading": 12, "textColor": _INK_C}
    return ParagraphStyle(name, **{**base, **kw})


_EYEBROW_R = _style("eyebrow", fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=colors.HexColor("#" + _BRAND_TEXT), alignment=TA_RIGHT)
_LABEL = _style("label", fontName="Helvetica-Bold", fontSize=6.5, leading=9, textColor=_MUTED)
_GYM = _style("gym", fontName="Helvetica-Bold", fontSize=12.5, leading=15)
_FISCAL = _style("fiscal", fontSize=7.5, leading=10, textColor=_MUTED)
_NUMBER = _style("number", fontName="Helvetica-Bold", fontSize=17, leading=20, alignment=TA_RIGHT)
_DATE = _style("date", fontSize=8, leading=11, textColor=_MUTED, alignment=TA_RIGHT)
_STRONG = _style("strong", fontName="Helvetica-Bold", fontSize=10, leading=13)
_BODY = _style("body", fontSize=8.5, leading=11.5, textColor=_MUTED)
_CELL = _style("cell", fontSize=8.5, leading=11)
_CELL_R = _style("cellr", fontSize=8.5, leading=11, alignment=TA_RIGHT)
_HEAD = _style("head", fontName="Helvetica-Bold", fontSize=6.5, leading=9, textColor=_MUTED)
_HEAD_R = _style("headr", fontName="Helvetica-Bold", fontSize=6.5, leading=9, textColor=_MUTED, alignment=TA_RIGHT)
_WORDS = _style("words", fontName="Helvetica-Oblique", fontSize=8, leading=11, textColor=_MUTED)
_NOTE = _style("note", fontSize=8, leading=11, textColor=colors.HexColor("#991B1B"))


def _p(text: str | None, style: ParagraphStyle) -> Paragraph:
    # Paragraph interpreta markup: todo texto del gym o del socio va escapado.
    return Paragraph(escape(text or ""), style)


def _initials(name: str) -> str:
    parts = [w for w in name.split() if w[:1].isalnum()]
    return "".join(w[0] for w in parts[:2]).upper() or "G"


def _logo_cell(logo_png: bytes | None, gym_name: str):
    if logo_png:
        try:
            return PdfImage(ImageReader(io.BytesIO(logo_png)), width=16 * mm, height=16 * mm, kind="proportional")
        except Exception:
            pass
    mono = Table([[_p(_initials(gym_name), _style("mono", fontName="Helvetica-Bold", fontSize=13, leading=15, textColor=colors.white, alignment=1))]],
                 colWidths=[14 * mm], rowHeights=[14 * mm])
    mono.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _BRAND_C),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    return mono


async def build_receipt_pdf(
    db: AsyncSession,
    receipt: Receipt,
    payment: Payment,
    *,
    tenant: Tenant,
    logo_png: bytes | None = None,
) -> bytes:
    view = await receipt_view(db, receipt, payment, tenant)
    gym = view["gym"]
    snap = receipt.snapshot
    number = snap.get("receipt_number", "")
    amount = float(snap.get("amount") or 0)
    page_w, page_h = A5
    # El marco de platypus agrega 6 pt por lado: el texto y la banda inferior se alinean a ese borde.
    margin = 13 * mm
    edge = margin + 6
    width = page_w - 2 * edge

    def _decor(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(_BRAND_C)
        canvas.rect(0, page_h - 2.2 * mm, page_w, 2.2 * mm, stroke=0, fill=1)
        canvas.setStrokeColor(_RULE)
        canvas.setLineWidth(0.5)
        canvas.line(edge, 14 * mm, page_w - edge, 14 * mm)
        canvas.setFont("Helvetica", 6.5)
        canvas.setFillColor(_FAINT)
        canvas.drawString(edge, 10 * mm, "Comprobante de pago. No es factura electrónica de venta.")
        canvas.drawRightString(page_w - edge, 10 * mm, "Hecho con LSMFit")
        if payment.status in _WATERMARK:
            canvas.setFont("Helvetica-Bold", 46)
            canvas.setFillColor(colors.Color(0.6, 0.1, 0.1, alpha=0.12))
            canvas.translate(page_w / 2, page_h / 2)
            canvas.rotate(30)
            canvas.drawCentredString(0, 0, _STATUS[payment.status][0])
        canvas.restoreState()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A5, leftMargin=margin, rightMargin=margin, topMargin=12 * mm, bottomMargin=19 * mm,
        title=f"Comprobante {number}", author=gym["name"], creator="LSMFit",
    )

    # ── Encabezado: marca del gym | número, fecha y estado ──
    fiscal = [x for x in (
        gym["legal_name"],
        " · ".join(x for x in (f"NIT {gym['nit']}" if gym["nit"] else None, gym["tax_regime"]) if x),
        gym["address"],
        f"Tel. {gym['phone']}" if gym["phone"] else None,
    ) if x]
    brand_block = [_p(gym["name"], _GYM)] + [_p(x, _FISCAL) for x in fiscal]
    brand = Table([[_logo_cell(logo_png, gym["name"]), brand_block]], colWidths=[19 * mm, width - 46 * mm - 19 * mm])
    brand.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    label, fg, bg = _STATUS.get(payment.status, ("PENDIENTE", "57534E", "F5F5F4"))
    pill = Table([[_p(label, _style("pill", fontName="Helvetica-Bold", fontSize=6.5, leading=8, textColor=colors.HexColor("#" + fg), alignment=1))]],
                 colWidths=[20 * mm])
    pill.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#" + bg)),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    pill.hAlign = "RIGHT"
    meta = [
        _p("COMPROBANTE DE PAGO", _EYEBROW_R),
        _p(number, _NUMBER),
        _p(view["issued_label"], _DATE),
        Spacer(1, 1.5 * mm),
        pill,
    ]
    head = Table([[brand, meta]], colWidths=[width - 46 * mm, 46 * mm])
    head.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, -1), 0.6, _RULE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5 * mm),
    ]))

    # ── Quién pagó y cómo ──
    member_doc = (snap.get("member_document") or "").replace("IdType.", "")
    payer = [_p("RECIBIDO DE", _LABEL), _p(snap.get("member_name") or "Venta de mostrador", _STRONG)]
    if member_doc:
        payer.append(_p(member_doc, _BODY))
    method = _METHOD_LABELS.get(snap.get("method") or "", snap.get("method") or "—")
    pay = [_p("FORMA DE PAGO", _LABEL), _p(method, _STRONG)]
    if view["transfer_reference"]:
        pay.append(_p(f"Referencia {view['transfer_reference']}", _BODY))
    if view["card_approval_code"]:
        pay.append(_p(f"Aprobación {view['card_approval_code']}", _BODY))
    if view["cashier_name"]:
        pay.append(_p(f"Atendió: {view['cashier_name']}", _BODY))
    parties = Table([[payer, pay]], colWidths=[width / 2, width / 2])
    parties.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 5 * mm),
    ]))

    # ── Detalle ──
    items = snap.get("items") or []
    rows = [[_p("DESCRIPCIÓN", _HEAD), _p("CANT.", _HEAD_R), _p("VALOR UNIT.", _HEAD_R), _p("VALOR", _HEAD_R)]]
    if items:
        for i in items:
            rows.append([
                _p(i["description"], _CELL), _p(str(i["quantity"]), _CELL_R),
                _p(_cop(float(i["unit_price"])), _CELL_R), _p(_cop(float(i["subtotal"])), _CELL_R),
            ])
    else:
        base = float(view["subtotal"])
        rows.append([_p(snap.get("concept"), _CELL), _p("1", _CELL_R), _p(_cop(base), _CELL_R), _p(_cop(base), _CELL_R)])
    detail = Table(rows, colWidths=[width - 63 * mm, 13 * mm, 25 * mm, 25 * mm], repeatRows=1)
    detail.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (1, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, _INK_C),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, _RULE),
    ]))

    # ── Totales ──
    discount = float(view["discount_amount"])
    total_rows = []
    if discount > 0:
        note = f"Descuento · {view['discount_note']}" if view["discount_note"] else "Descuento"
        total_rows += [
            [_p("Subtotal", _BODY), _p(_cop(float(view["subtotal"])), _CELL_R)],
            [_p(note, _BODY), _p("- " + _cop(discount), _CELL_R)],
        ]
    total_rows.append([
        _p("TOTAL PAGADO", _style("tl", fontName="Helvetica-Bold", fontSize=8, leading=11)),
        _p(_cop(amount), _style("tv", fontName="Helvetica-Bold", fontSize=14, leading=17, alignment=TA_RIGHT)),
    ])
    totals = Table(total_rows, colWidths=[42 * mm, 30 * mm])
    style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#" + _BRAND_TINT)),
        ("TOPPADDING", (0, -1), (-1, -1), 6), ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]
    totals.setStyle(TableStyle(style))
    totals.hAlign = "RIGHT"

    story = [
        head, parties, detail, Spacer(1, 4 * mm), totals, Spacer(1, 3 * mm),
        _p(f"Son: {view['amount_in_words']}.", _WORDS),
    ]
    if payment.status == PaymentStatus.refunded:
        when = format_issued(payment.refunded_at).split(" · ")[0] if payment.refunded_at else ""
        reason = f" · {view['refund_reason']}" if view["refund_reason"] else ""
        story += [Spacer(1, 4 * mm), _p(f"Pago devuelto el {when}{reason}", _NOTE)]
    elif payment.status == PaymentStatus.voided:
        story += [Spacer(1, 4 * mm), _p("Este pago fue anulado y no tiene validez como soporte.", _NOTE)]
    story += [
        Spacer(1, 6 * mm),
        _p("Conserva este comprobante como soporte de tu pago. Si tienes dudas, escríbenos o acércate a recepción.", _FISCAL),
    ]

    doc.build(story, onFirstPage=_decor, onLaterPages=_decor)
    return buf.getvalue()
