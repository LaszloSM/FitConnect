"""Los nombres de capacidad que usa la UI tienen que existir en el backend.

La matriz no se duplica —el login devuelve las capacidades del rol—, pero los
NOMBRES sí se escriben en los dos lados. Un permiso renombrado en Python deja
en el frontend una cadena que ya no existe: `can("cash.read")` pasa a ser
siempre falso y la pantalla se oculta para todo el mundo, sin un solo error.

Mismo patron que test_audit_actions.py y test_class_form_contract.py.
"""
import os
import re
from pathlib import Path

import pytest

from app.core.permissions import ALL_PERMISSIONS

FRONTEND = Path(os.environ.get("FRONTEND_DIR", Path(__file__).resolve().parent.parent.parent / "frontend"))
PERMISSIONS_TS = FRONTEND / "lib" / "permissions.ts"

_ENTRY = re.compile(r'^\s+([A-Z][A-Z0-9_]*):\s*"([a-z_]+\.[a-z_]+)",', re.M)


def _entries() -> dict[str, str]:
    if not PERMISSIONS_TS.exists():
        pytest.skip(f"permissions.ts no disponible en {PERMISSIONS_TS}")
    pares = dict(_ENTRY.findall(PERMISSIONS_TS.read_text(encoding="utf-8")))
    assert pares, (
        "El regex no leyó ninguna capacidad de permissions.ts: cambió la forma "
        "del objeto y este test se volvería un verde falso."
    )
    return pares


def test_toda_capacidad_de_la_ui_existe_en_el_backend():
    inventadas = set(_entries().values()) - set(ALL_PERMISSIONS)
    assert not inventadas, (
        f"La UI usa capacidades que el backend no declara: {sorted(inventadas)}. "
        "Un nombre que no existe hace que can() sea siempre falso y la pantalla "
        "se oculte para todos, sin ningún error."
    )


def test_cada_constante_vale_lo_mismo_que_en_el_backend():
    """`MACHINES_WRITE: "machines.read"` es un typo que nadie ve hasta producción.

    Se compara contra la constante homónima de Python, no contra una convención
    de nombres: el backend tiene casos deliberados como
    `MEMBER_MONEY_READ = "members.money_read"` y exigirle regularidad sería
    inventarse una regla que no sigue.
    """
    from app.core import permissions as perm

    desajustes = []
    for constante, valor in _entries().items():
        esperado = getattr(perm, constante, None)
        if esperado is None:
            desajustes.append(f"{constante} no existe en app.core.permissions")
        elif esperado != valor:
            desajustes.append(f"{constante}: la UI dice «{valor}», el backend «{esperado}»")
    assert not desajustes, "; ".join(desajustes)
