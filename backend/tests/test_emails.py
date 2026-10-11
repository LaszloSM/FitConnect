"""Correos: plantillas con HTML y texto, y cada flujo que debe enviar uno."""
import re
import uuid

import pytest

from app.core.config import settings
from app.services import emails, mailer
from app.services.email_templates import render
from tests.helpers import create_member, create_plan
from tests.test_app_mobile import _set_module
from tests.test_users import create_owner_token


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _mails_to(email: str) -> list[mailer.Mail]:
    return [m for m in mailer.OUTBOX if m.to == email]


ALL_TEMPLATES = [
    emails.password_reset("https://x.co/restablecer?token=abc", 60, "Ana Pérez"),
    emails.staff_invite("https://x.co/aceptar-invitacion?token=abc", "Gym Sol", "recepción", 48, "Laura"),
    emails.mfa_email_code("123456", 10, "Ana"),
    emails.security_code("654321", 10, "cambiar tu contraseña"),
    emails.security_notice("password_changed", "Ana"),
    emails.profile_link("ANA PEREZ", "Gym Sol", "https://x.co/completar/gym/abc", 7),
    emails.member_app_welcome("Ana", "Gym Sol", "ana@correo.com", "ABCD-2345", 48),
    emails.app_login_code("111222", 10),
    emails.subscription_extended("Ana", "Gym Sol", "10/12/2026", "comp", "Gimnasio piloto"),
]


@pytest.mark.parametrize("email", ALL_TEMPLATES, ids=lambda e: e.subject[:40])
def test_every_template_renders_html_and_text(email):
    out = render(email)
    assert out.html.startswith("<!doctype html>") and "lsmfit-logo.png" in out.html
    assert email.heading in out.html and email.heading in out.text
    # Lo que importa (enlaces y códigos) está en las dos versiones.
    for url in re.findall(r"https://\S+", out.text):
        assert url in out.html
    for code in re.findall(r"\b\d{6}\b|\b[A-Z]{4}-\d{4}\b", out.text):
        assert code in out.html
    assert "**" not in out.text and "**" not in out.html
    assert "<script" not in out.html


def test_user_text_is_escaped_in_html():
    out = render(emails.profile_link("<b>Ana</b>", "Gym <img src=x>", "https://x.co/a", 7))
    assert "<img src=x>" not in out.html and "&lt;img src=x&gt;" in out.html


async def test_mailer_reports_failure_in_production_without_sender(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "mail_backend", "auto")
    monkeypatch.setattr(settings, "ses_from_email", "")
    assert await mailer.send("a@correo.com", "Hola", "texto") is False
    assert mailer.configured() is False


async def test_staff_invite_sends_the_link_by_email(client):
    token = await create_owner_token(client)
    email = f"recep-{uuid.uuid4().hex[:8]}@correo.com"
    r = await client.post("/api/v1/users/invite", json={"email": email, "full_name": "Rosa Recepción",
                                                         "role": "receptionist"}, headers=_h(token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email_sent"] is True
    mail = _mails_to(email)[-1]
    assert body["invite_url"] in mail.text and body["invite_url"] in mail.html
    assert "recepción" in mail.text


async def test_new_member_gets_app_invite_only_when_the_plan_includes_the_app(client):
    token = await create_owner_token(client)
    plan_id = await create_plan(client, _h(token))

    await _set_module(token, False)
    without = await create_member(client, _h(token), plan_id=plan_id)
    assert not [m for m in _mails_to(without["email"]) if "app de socios" in m.subject]

    await _set_module(token, True)
    member = await create_member(client, _h(token), plan_id=plan_id)
    invites = [m for m in _mails_to(member["email"]) if "app de socios" in m.subject]
    assert len(invites) == 1
    code = re.search(r"\b([A-Z0-9]{4}-[A-Z0-9]{4})\b", invites[0].text).group(1)
    assert code in invites[0].html and member["email"] in invites[0].text


async def test_app_code_can_be_sent_by_email(client):
    token = await create_owner_token(client)
    await _set_module(token, True)
    member = await create_member(client, _h(token))
    r = await client.post(f"/api/v1/members/{member['id']}/app-code", json={"send_email": True}, headers=_h(token))
    assert r.status_code == 200, r.text
    assert r.json()["sent"] is True
    assert r.json()["code"] in _mails_to(member["email"])[-1].text
    # Sin cuerpo sigue funcionando como antes: solo devuelve el código.
    plain = await client.post(f"/api/v1/members/{member['id']}/app-code", headers=_h(token))
    assert plain.status_code == 200 and plain.json()["sent"] is False


async def test_import_batch_can_be_invited_to_the_app(client):
    token = await create_owner_token(client)
    await _set_module(token, True)
    tag = uuid.uuid4().hex[:6]
    cedula = str(uuid.uuid4().int)[:9]
    r = await client.post("/api/v1/members/import/commit", headers=_h(token), files={
        "file": ("socios.csv", (
            "Cédula;Nombre;Email\n"
            f"{cedula};ANA PEREZ;imp-{tag}@correo.com\n"
            f"{str(uuid.uuid4().int)[:9]};LUIS SIN CORREO;\n"
        ).encode("utf-8"), "text/csv"),
    })
    assert r.status_code == 200, r.text
    batch_id = r.json()["batch_id"]
    res = await client.post(f"/api/v1/members/import/batches/{batch_id}/app-invites", headers=_h(token))
    assert res.status_code == 200, res.text
    assert res.json() == {"queued": 1, "without_email": 1}
    assert [m for m in _mails_to(f"imp-{tag}@correo.com") if "app de socios" in m.subject]
