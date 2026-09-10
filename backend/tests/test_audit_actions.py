"""El diccionario de la UI de auditoría debe coincidir con lo que emite el backend.

Antes divergían en las dos direcciones: la pantalla rotulaba `payment.update`,
`payment.delete` y `payment.wompi_confirmed` —acciones que el backend nunca
emitió— y mostraba como texto crudo `payment.void`, `payment.refund` o
`expense.create`, que sí se emiten. Una auditoría que describe un sistema
inexistente es peor que no tenerla.
"""
import os
import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent / "app"

# El contenedor `saasgym-backend-1` solo monta ./backend, así que el frontend
# puede no estar; en ese caso estos tests se saltan en vez de reventar.
FRONTEND = Path(os.environ.get("FRONTEND_DIR", Path(__file__).resolve().parent.parent.parent / "frontend"))
AUDIT_CLIENT = FRONTEND / "app" / "(dashboard)" / "audit" / "AuditClient.tsx"

_CALL = re.compile(r'audit\(\s*[^,]+,\s*[^,]+,\s*"([a-z_]+\.[a-z_]+)"')


def _backend_sources():
    return [f.read_text(encoding="utf-8") for f in BACKEND.rglob("*.py")]


def _emitted_actions() -> set[str]:
    return {m.group(1) for src in _backend_sources() for m in _CALL.finditer(src)}


def _audit_client_source() -> str:
    if not AUDIT_CLIENT.exists():
        pytest.skip(f"AuditClient.tsx no disponible en {AUDIT_CLIENT} (¿corriendo dentro del contenedor backend?)")
    return AUDIT_CLIENT.read_text(encoding="utf-8")


def _ts_block(src: str, name: str) -> str:
    marker = f"const {name}"
    assert marker in src, f"{name} ya no existe en AuditClient.tsx"
    block = src[src.index(marker):]
    return block[: block.index("};")]


def test_regex_parses_every_audit_call():
    """Guardia contra el falso verde: si alguien llama a audit() con kwargs o con
    la acción en una variable, el regex la omitiría en silencio."""
    total = sum(src.count("audit(db,") + src.count("audit(\n") for src in _backend_sources())
    parsed = sum(len(_CALL.findall(src)) for src in _backend_sources())
    assert parsed >= total, (
        f"El regex reconoció {parsed} llamadas de {total}: hay audit() con una forma "
        "que este test no sabe leer. Ajusta _CALL o normaliza la llamada."
    )
    assert parsed, "No se detectó ninguna llamada audit() en app/ — ruta de backend mal resuelta"


def test_ui_labels_cover_every_emitted_action():
    labelled = set(re.findall(r'"([a-z_]+\.[a-z_]+)":', _ts_block(_audit_client_source(), "ACTION_LABELS")))
    missing = _emitted_actions() - labelled
    assert not missing, f"Acciones sin etiqueta en la UI de auditoría: {sorted(missing)}"


def test_ui_has_no_invented_actions():
    labelled = set(re.findall(r'"([a-z_]+\.[a-z_]+)":', _ts_block(_audit_client_source(), "ACTION_LABELS")))
    invented = labelled - _emitted_actions()
    assert not invented, f"La UI rotula acciones que el backend nunca emite: {sorted(invented)}"


def test_every_action_prefix_has_a_color():
    """`ACTION_DOT` tiene un fallback gris, así que un prefijo nuevo pasaría
    desapercibido a simple vista."""
    coloured = set(re.findall(r"^\s+([a-z_]+):", _ts_block(_audit_client_source(), "ACTION_DOT"), re.M))
    missing = {a.split(".")[0] for a in _emitted_actions()} - coloured
    assert not missing, f"Prefijos de acción sin color en ACTION_DOT: {sorted(missing)}"
