"""Plantillas de correo de LSMFit.

Cada correo se arma con bloques (párrafo, botón, código, pasos, nota) y sale en
dos versiones: HTML para los clientes de correo y texto plano para los que no
muestran HTML. El HTML usa tablas y estilos en línea porque Gmail y Outlook
ignoran las hojas de estilo y el posicionamiento moderno.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass, field

from app.core.config import settings

INK, MUTED, BRAND, CREAM, LINE, PAGE = "#2A1911", "#6B5A50", "#C4360C", "#FCF6ED", "#EADFD3", "#F4EEE6"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


@dataclass
class P:
    """Párrafo. `**texto**` sale en negrita."""
    text: str
    muted: bool = False


@dataclass
class Button:
    label: str
    url: str


@dataclass
class Code:
    """Código para escribir a mano (verificación, vinculación)."""
    code: str
    caption: str = ""


@dataclass
class Steps:
    items: list[str]


@dataclass
class Note:
    """Recuadro de aviso (seguridad, vencimiento)."""
    text: str


Block = P | Button | Code | Steps | Note


@dataclass
class Email:
    subject: str
    heading: str
    blocks: list[Block]
    preheader: str = ""
    # Gimnasio en nombre del cual se envía (correos a socios). None = la plataforma.
    gym_name: str | None = None
    footer: str = ""
    tags: dict[str, str] = field(default_factory=dict)


@dataclass
class Rendered:
    subject: str
    text: str
    html: str


def _inline(text: str) -> str:
    out = html.escape(text)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)


def _plain(text: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"\1", text)


def logo_url() -> str:
    return f"{settings.frontend_url.rstrip('/')}/email/lsmfit-logo.png"


def _block_html(b: Block) -> str:
    if isinstance(b, P):
        color = MUTED if b.muted else INK
        size = "14px" if b.muted else "16px"
        return f'<p style="margin:0 0 16px;font-size:{size};line-height:1.6;color:{color};">{_inline(b.text)}</p>'
    if isinstance(b, Button):
        url = html.escape(b.url, quote=True)
        return (
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">'
            f'<tr><td align="center" bgcolor="{BRAND}" style="border-radius:10px;">'
            f'<a href="{url}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:{FONT};'
            f'font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">'
            f"{html.escape(b.label)}</a></td></tr></table>"
            f'<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:{MUTED};">Si el botón no abre, copia '
            f'este enlace en tu navegador:<br><a href="{url}" style="color:{BRAND};word-break:break-all;">{url}</a></p>'
        )
    if isinstance(b, Code):
        caption = (f'<div style="margin-top:6px;font-size:13px;color:{MUTED};">{_inline(b.caption)}</div>'
                   if b.caption else "")
        return (
            f'<div style="margin:4px 0 24px;padding:18px 16px;background:{CREAM};border:1px solid {LINE};'
            f'border-radius:12px;text-align:center;">'
            f'<div style="font-size:32px;font-weight:700;letter-spacing:6px;color:{INK};'
            f'font-family:{FONT};">{html.escape(b.code)}</div>{caption}</div>'
        )
    if isinstance(b, Steps):
        rows = "".join(
            f'<tr><td valign="top" style="padding:0 12px 12px 0;"><div style="width:26px;height:26px;'
            f'border-radius:13px;background:{CREAM};border:1px solid {LINE};text-align:center;line-height:26px;'
            f'font-size:13px;font-weight:700;color:{BRAND};">{i}</div></td>'
            f'<td valign="top" style="padding:3px 0 12px;font-size:15px;line-height:1.5;color:{INK};">'
            f"{_inline(item)}</td></tr>"
            for i, item in enumerate(b.items, 1)
        )
        return f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">{rows}</table>'
    if isinstance(b, Note):
        return (
            f'<div style="margin:0 0 20px;padding:14px 16px;background:#FFF8EC;border:1px solid #F0DDB8;'
            f'border-radius:10px;font-size:14px;line-height:1.5;color:{INK};">{_inline(b.text)}</div>'
        )
    raise TypeError(b)


def _block_text(b: Block) -> str:
    if isinstance(b, P):
        return _plain(b.text)
    if isinstance(b, Button):
        return f"{b.label}: {b.url}"
    if isinstance(b, Code):
        return f"    {b.code}" + (f"\n{_plain(b.caption)}" if b.caption else "")
    if isinstance(b, Steps):
        return "\n".join(f"{i}. {_plain(s)}" for i, s in enumerate(b.items, 1))
    if isinstance(b, Note):
        return _plain(b.text)
    raise TypeError(b)


def _footer(email: Email) -> str:
    if email.footer:
        return email.footer
    if email.gym_name:
        return (f"Recibes este correo porque eres socio de {email.gym_name}. "
                f"{email.gym_name} usa LSMFit para gestionar sus socios.")
    return "Recibes este correo porque tienes una cuenta en LSMFit."


def render(email: Email) -> Rendered:
    footer = _footer(email)
    text = "\n\n".join([email.heading, *(_block_text(b) for b in email.blocks), "—", footer])
    body = "".join(_block_html(b) for b in email.blocks)
    sender = (f'<p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:.02em;color:{MUTED};">'
              f"{html.escape(email.gym_name)}</p>") if email.gym_name else ""
    pre = html.escape(email.preheader or _plain(next((b.text for b in email.blocks if isinstance(b, P)), "")))
    page = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>{html.escape(email.subject)}</title></head>
<body style="margin:0;padding:0;background:{PAGE};font-family:{FONT};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{PAGE};">{pre}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{PAGE};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;"><img src="{html.escape(logo_url(), quote=True)}" width="132" height="28" alt="LSMFit" style="display:block;border:0;outline:none;"></td></tr>
<tr><td style="background:#FFFFFF;border:1px solid {LINE};border-radius:16px;padding:32px 28px;">
{sender}<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:{INK};">{html.escape(email.heading)}</h1>
{body}
</td></tr>
<tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:{MUTED};">{html.escape(footer)}<br>
LSMFit · Riohacha, Colombia · <a href="{html.escape(settings.frontend_url.rstrip('/'), quote=True)}/privacidad" style="color:{MUTED};">Privacidad</a></td></tr>
</table></td></tr></table></body></html>"""
    return Rendered(subject=email.subject, text=text, html=page)
