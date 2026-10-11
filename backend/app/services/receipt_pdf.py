"""Comprobante de pago en PDF: se arma desde el snapshot del recibo (inmutable),
con la marca del gym y sus datos fiscales. Base para la factura DIAN futura."""
import io
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image as PdfImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.payment import Payment, PaymentStatus
from app.models.tenant.receipt import Receipt
from app.services.exports import _BRAND, _BRAND_TINT, _INK, _cop
from app.services.gym_settings import get_gym_settings

_METHOD_LABELS = {"cash": "Efectivo", "transfer": "Transferencia", "card": "Tarjeta", "wompi": "Wompi"}
_STATUS_WATERMARK = {
    PaymentStatus.refunded: "DEVUELTO",
    PaymentStatus.voided: "ANULADO",
    PaymentStatus.failed: "RECHAZADO",
}


async def build_receipt_pdf(
    db: AsyncSession,
    receipt: Receipt,
    payment: Payment,
    *,
    gym_name: str,
    logo_png: bytes | None = None,
) -> bytes:
    gym = await get_gym_settings(db)
    snap = receipt.snapshot
    styles = getSampleStyleSheet()
    ink = colors.HexColor("#" + _INK)
    muted = colors.HexColor("#6B7280")
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=15, textColor=ink, spaceAfter=0, leading=18)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=muted, leading=10)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9.5, textColor=ink, leading=12)
    label = ParagraphStyle("label", parent=small, fontSize=7.5, textColor=muted)

    buf = io.BytesIO()
    watermark = _STATUS_WATERMARK.get(payment.status)

    def _decor(canvas, doc):
        canvas.saveState()
        w, h = A5
        canvas.setFillColor(colors.HexColor("#" + _BRAND))
        canvas.rect(0, h - 6 * mm, w, 6 * mm, stroke=0, fill=1)
        canvas.setFillColor(muted)
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(w / 2, 8 * mm, f"{gym_name} · Comprobante {snap.get('receipt_number', '')} · LSMFit")
        if watermark:
            canvas.setFont("Helvetica-Bold", 44)
            canvas.setFillColor(colors.Color(0.85, 0.1, 0.1, alpha=0.18))
            canvas.translate(w / 2, h / 2)
            canvas.rotate(30)
            canvas.drawCentredString(0, 0, watermark)
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf, pagesize=A5, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
        title=f"Comprobante {snap.get('receipt_number', '')}", author=gym_name,
    )
    story = []

    # Encabezado: logo + gym + datos fiscales | número y fecha
    fiscal_lines = [gym_name]
    if gym.legal_name and gym.legal_name != gym_name:
        fiscal_lines.append(gym.legal_name)
    if gym.nit:
        fiscal_lines.append(f"NIT {gym.nit}")
    if gym.tax_regime:
        fiscal_lines.append(gym.tax_regime)
    # Paragraph interpreta markup: todo texto del gym/socio va escapado
    left = [Paragraph("<br/>".join(escape(x) for x in fiscal_lines), body)]
    if logo_png:
        try:
            img = PdfImage(ImageReader(io.BytesIO(logo_png)), width=22 * mm, height=22 * mm, kind="proportional")
            left = [img, Spacer(1, 2 * mm)] + left
        except Exception:
            pass
    issued = receipt.issued_at
    issued_txt = issued.strftime("%d/%m/%Y %H:%M") if isinstance(issued, datetime) else str(issued)
    right = [
        Paragraph("COMPROBANTE DE PAGO", label),
        Paragraph(escape(snap.get("receipt_number", "")), h1),
        Paragraph(issued_txt, small),
    ]
    head = Table([[left, right]], colWidths=[None, 52 * mm])
    head.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [head, Spacer(1, 6 * mm)]

    # Cliente y pago
    method = _METHOD_LABELS.get(snap.get("method") or "", snap.get("method") or "—")
    detail = method
    if payment.transfer_reference:
        detail += f" · Ref. {payment.transfer_reference}"
    if payment.card_approval_code:
        detail += f" · Aprob. {payment.card_approval_code}"
    kv = [
        ["Cliente", snap.get("member_name") or "Venta de mostrador"],
        # Recibos viejos guardaron el enum como texto ("IdType.CC")
        ["Documento", (snap.get("member_document") or "—").replace("IdType.", "")],
        ["Concepto", snap.get("concept") or ""],
        ["Método", detail],
    ]
    kvt = Table([[Paragraph(k, label), Paragraph(escape(str(v)), body)] for k, v in kv], colWidths=[24 * mm, None])
    kvt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story += [kvt, Spacer(1, 4 * mm)]

    # Detalle
    items = snap.get("items") or []
    rows = [["Detalle", "Cant.", "Unitario", "Subtotal"]]
    if items:
        for i in items:
            rows.append([i["description"], str(i["quantity"]), _cop(float(i["unit_price"])), _cop(float(i["subtotal"]))])
    else:
        rows.append([snap.get("concept") or "", "1", _cop(float(snap["amount"])), _cop(float(snap["amount"]))])
    discount = float(payment.discount_amount or 0)
    if discount > 0:
        rows.append(["Descuento" + (f" · {payment.discount_note}" if payment.discount_note else ""), "", "", "−" + _cop(discount)])
    rows.append(["TOTAL", "", "", _cop(float(snap["amount"]))])
    t = Table(rows, colWidths=[None, 14 * mm, 26 * mm, 28 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#" + _BRAND_TINT)),
        ("TEXTCOLOR", (0, 0), (-1, 0), ink),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F5F5F5")]),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, ink),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [t, Spacer(1, 6 * mm)]

    if payment.status == PaymentStatus.refunded:
        story.append(Paragraph(escape(
            f"Pago devuelto el {payment.refunded_at.strftime('%d/%m/%Y') if payment.refunded_at else ''}"
            + (f" · {payment.refund_reason}" if payment.refund_reason else "")), small))
    story.append(Paragraph("Este comprobante no es una factura electrónica. Conserva este documento como soporte de tu pago.", small))

    doc.build(story, onFirstPage=_decor, onLaterPages=_decor)
    return buf.getvalue()
