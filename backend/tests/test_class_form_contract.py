"""El formulario de clases debe ofrecer exactamente los valores que el backend acepta.

El `<select>` de categoría enviaba "Spinning" mientras `ClassCategory` declara
"spinning": CUALQUIER alta de clase con categoría moría en 422 y el módulo quedó
inutilizado. Ningún test lo vio porque todos escriben "yoga" a mano en el JSON,
que sí coincide; el contrato real —lo que el formulario POSTea— nunca se ejercía.

Mismo patrón que `test_audit_actions.py`: se lee el TSX porque es lo único que
representa lo que el usuario realmente envía.
"""
import os
import re
import uuid
from pathlib import Path

import pytest

from app.models.tenant.gym_class import ClassCategory, ClassDifficulty

# El contenedor `saasgym-backend-1` solo monta ./backend, así que el frontend
# puede no estar; en ese caso estos tests se saltan en vez de reventar.
FRONTEND = Path(os.environ.get("FRONTEND_DIR", Path(__file__).resolve().parent.parent.parent / "frontend"))
CLASSES_CLIENT = FRONTEND / "app" / "(dashboard)" / "classes" / "ClassesClient.tsx"

_VALUE = re.compile(r'value:\s*"([^"]*)"')

_TOKENS: dict[str, str] = {}


def _classes_client_source() -> str:
    if not CLASSES_CLIENT.exists():
        pytest.skip(f"ClassesClient.tsx no disponible en {CLASSES_CLIENT} (¿corriendo dentro del contenedor backend?)")
    return CLASSES_CLIENT.read_text(encoding="utf-8")


def _const_values(name: str) -> set[str]:
    src = _classes_client_source()
    marker = f"const {name} = ["
    assert marker in src, f"{name} ya no existe en ClassesClient.tsx"
    block = src[src.index(marker):]
    block = block[: block.index("];")]
    values = set(_VALUE.findall(block))
    # Guardia contra el falso verde: si el array cambia de forma, el regex
    # devolvería vacío y el test compararía dos conjuntos vacíos sin quejarse.
    assert values, (
        f"El regex no leyó ningún value de {name}: cambió la forma del array. "
        "Ajusta _VALUE o normaliza la declaración."
    )
    return values


def test_las_categorias_del_formulario_son_las_del_enum():
    del_form = _const_values("CATEGORIES")
    del_enum = {c.value for c in ClassCategory}
    assert del_form == del_enum, (
        f"El formulario ofrece {sorted(del_form - del_enum)}, que el backend rechaza con 422; "
        f"y no ofrece {sorted(del_enum - del_form)}"
    )


def test_las_dificultades_del_formulario_son_las_del_enum():
    del_form = _const_values("DIFFICULTIES")
    del_enum = {d.value for d in ClassDifficulty}
    assert del_form == del_enum, (
        f"El formulario ofrece {sorted(del_form - del_enum)}; falta {sorted(del_enum - del_form)}"
    )


def test_los_colores_del_formulario_son_hex():
    # `gym_classes.color` es String(7): "orange" mide 6 y entraba sin chistar.
    for color in _const_values("COLOR_OPTIONS"):
        assert re.fullmatch(r"#[0-9A-Fa-f]{6}", color), f"{color} no es un hex de 7 caracteres"


# ─── El contrato de punta a punta ───

async def _owner_token(client, email="formcontract@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Contrato", "gym_name": "Contrato Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _payload(**overrides):
    base = {
        "name": f"Clase {uuid.uuid4().hex[:6]}", "instructor": "Ana",
        "max_capacity": 10, "duration_minutes": 60,
    }
    base.update(overrides)
    return base


@pytest.mark.parametrize("categoria", sorted(c.value for c in ClassCategory))
async def test_toda_categoria_del_enum_se_puede_crear(client, categoria):
    token = await _owner_token(client)
    r = await client.post("/api/v1/classes", json=_payload(category=categoria), headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["category"] == categoria


async def test_una_categoria_capitalizada_es_422(client):
    """El bug exacto: el formulario mandaba "Spinning" y toda alta moría."""
    token = await _owner_token(client)
    r = await client.post("/api/v1/classes", json=_payload(category="Spinning"), headers=_auth(token))
    assert r.status_code == 422, r.text


async def test_un_color_hex_se_acepta_y_se_normaliza(client):
    token = await _owner_token(client)
    r = await client.post("/api/v1/classes", json=_payload(color="#f97316"), headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["color"] == "#F97316"


@pytest.mark.parametrize("color", ["orange", "blue", "rojo", "#GGGGGG", "#F973", "F97316"])
async def test_un_color_que_no_es_hex_se_rechaza(client, color):
    """"orange" mide 6 y pasaba el max_length=7: la columna aceptó nombres CSS."""
    token = await _owner_token(client)
    r = await client.post("/api/v1/classes", json=_payload(color=color), headers=_auth(token))
    assert r.status_code == 422, r.text


async def test_sin_color_sigue_siendo_valido(client):
    token = await _owner_token(client)
    r = await client.post("/api/v1/classes", json=_payload(), headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["color"] is None
