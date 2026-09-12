"""La migración de colores escribe en TODAS las tenant DBs.

La rama peligrosa es el color sin equivalente: un `dict.get` que devuelve None
y termina en un `UPDATE ... SET color = NULL` borra en silencio una decisión del
gimnasio. Aquí se fija que esa rama no migra nada, y que correr el script dos
veces no deshace lo que ya hizo.
"""
import pytest

from scripts.migrate_class_colors import COLOR_MAP, normalize_color


@pytest.mark.parametrize("nombre,esperado", sorted(COLOR_MAP.items()))
def test_cada_nombre_css_mapea_a_su_hex(nombre, esperado):
    assert normalize_color(nombre) == esperado


def test_todo_hex_del_mapa_cabe_en_la_columna():
    # `gym_classes.color` es String(7): un hex con alpha reventaría el UPDATE.
    for hexa in COLOR_MAP.values():
        assert len(hexa) == 7 and hexa.startswith("#")


def test_un_color_desconocido_no_se_migra():
    assert normalize_color("chartreuse") is None
    assert normalize_color("") is None
    assert normalize_color(None) is None


def test_un_color_ya_migrado_no_se_toca():
    """Idempotencia: correr el script dos veces no puede vaciar lo ya migrado."""
    assert normalize_color("#F97316") == "#F97316"
