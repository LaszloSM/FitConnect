"""Áreas de máquinas como slugs estables.

La pantalla guardaba la ETIQUETA en español ("Peso libre") como dato. Renombrarla
a "Pesos libres" dejaba huérfanas todas las filas y rompía el filtro sin un solo
error: el mismo modo de fallo que tuvieron los colores de las clases.
"""
AREA_LABELS: dict[str, str] = {
    "cardio": "Cardio",
    "fuerza": "Fuerza",
    "peso_libre": "Peso libre",
    "funcional": "Funcional",
    "cross_training": "Cross-training",
    "estiramiento": "Estiramiento",
    "otra": "Otra",
}

_POR_ETIQUETA = {label.casefold(): slug for slug, label in AREA_LABELS.items()}


def normalize_area(value: object) -> str | None:
    """Acepta el slug o la etiqueta vieja; cualquier otra cosa es un error."""
    if value is None:
        return None
    texto = str(value).strip()
    if not texto:
        return None
    if texto in AREA_LABELS:
        return texto
    slug = _POR_ETIQUETA.get(texto.casefold())
    if slug is None:
        raise ValueError(f"Área inválida. Válidas: {', '.join(AREA_LABELS.values())}")
    return slug
