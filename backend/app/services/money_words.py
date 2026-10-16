"""Valor en letras para comprobantes: «Ciento veinte mil pesos m/cte»."""

_UNIDADES = [
    "", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
    "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
    "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis",
    "veintisiete", "veintiocho", "veintinueve",
]
_DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]
_CENTENAS = [
    "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
    "seiscientos", "setecientos", "ochocientos", "novecientos",
]


def _hasta_999(n: int) -> str:
    if n == 100:
        return "cien"
    c, r = divmod(n, 100)
    if r < 30:
        resto = _UNIDADES[r]
    else:
        d, u = divmod(r, 10)
        resto = _DECENAS[d] + (f" y {_UNIDADES[u]}" if u else "")
    return " ".join(p for p in (_CENTENAS[c], resto) if p)


def _hasta_999999(n: int) -> str:
    miles, r = divmod(n, 1000)
    partes = []
    if miles:
        partes.append("mil" if miles == 1 else f"{_hasta_999(miles)} mil")
    if r:
        partes.append(_hasta_999(r))
    return " ".join(partes)


def pesos_en_letras(valor: float) -> str:
    n = int(round(valor))
    if n == 0:
        return "Cero pesos m/cte"
    millones, r = divmod(n, 1_000_000)
    partes = []
    if millones:
        partes.append("un millón" if millones == 1 else f"{_hasta_999999(millones)} millones")
    if r:
        partes.append(_hasta_999999(r))
    texto = " ".join(partes)
    if n == 1:
        texto += " peso"
    elif r == 0:
        texto += " de pesos"
    else:
        texto += " pesos"
    return texto[0].upper() + texto[1:] + " m/cte"
