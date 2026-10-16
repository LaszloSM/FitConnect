from datetime import datetime, timezone

from app.services.money_words import pesos_en_letras
from app.services.receipts import format_issued


def test_pesos_en_letras():
    assert pesos_en_letras(0) == "Cero pesos m/cte"
    assert pesos_en_letras(1) == "Un peso m/cte"
    assert pesos_en_letras(21000) == "Veintiún mil pesos m/cte"
    assert pesos_en_letras(101) == "Ciento un pesos m/cte"
    assert pesos_en_letras(120000) == "Ciento veinte mil pesos m/cte"
    assert pesos_en_letras(1_000_000) == "Un millón de pesos m/cte"
    assert pesos_en_letras(31_000_000) == "Treinta y un millones de pesos m/cte"
    assert pesos_en_letras(1_250_500) == "Un millón doscientos cincuenta mil quinientos pesos m/cte"


def test_fecha_del_comprobante_en_hora_de_bogota():
    # 01:30 UTC del 17 es 8:30 p. m. del 16 en Bogotá
    assert format_issued(datetime(2026, 10, 17, 1, 30, tzinfo=timezone.utc)) == "16 oct 2026 · 8:30 p. m."
    assert format_issued(datetime(2026, 10, 16, 17, 5)) == "16 oct 2026 · 12:05 p. m."
