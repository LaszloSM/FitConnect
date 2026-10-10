"""Genera la marca LSMFit: isotipo, logotipo, lockups e iconos.

    pip install fonttools brotli shapely cairosvg pillow
    curl -o bricolage-800.ttf "<TTF de Bricolage Grotesque 800 en fonts.gstatic.com>"
    python lsmfit.py <carpeta-de-salida>

Escribe los SVG y PNG en la carpeta y deja en out.json los trazados que van en
`frontend/components/common/BrandMark.tsx` y `BrandLockup.tsx`.
"""
import json
import sys
from pathlib import Path

from shapely.affinity import scale, translate
from shapely.geometry import Point
from shapely.ops import unary_union

import wmlib as W

ORANGE, INK, CREAM = "#D8421A", "#2A1911", "#FCF6ED"

# ── Isotipo ───────────────────────────────────────────────────────────────
# Dos "C" de trazo uniforme sobre un estadio de 56 x 36, cortadas en diagonal
# y simétricas por rotación de 180° alrededor del centro, con un nodo en medio.
# K es la pendiente de los cortes (dx/dy) y H la mitad del hueco horizontal.
ISO_W, ISO_H, STROKE, NODE_R = 56.0, 36.0, 7.0, 7.3
K, H, TOP_X, BOT_X = -0.65, 2.2, 30.0, 26.0
R_OUT, R_IN = ISO_H / 2, ISO_H / 2 - STROKE


def _cut(xc, y_mid, y):
    return round(xc - H + K * (y - y_mid), 3)


def iso_paths():
    cy = ISO_H / 2
    lx = R_OUT
    a, b = _cut(TOP_X, 3.5, 0), _cut(TOP_X, 3.5, STROKE)
    c, d = _cut(BOT_X, ISO_H - 3.5, ISO_H - STROKE), _cut(BOT_X, ISO_H - 3.5, ISO_H)
    left = (
        f"M{lx} 0A{R_OUT} {R_OUT} 0 0 0 {lx} {ISO_H}L{d} {ISO_H}L{c} {ISO_H - STROKE}"
        f"L{lx} {ISO_H - STROKE}A{R_IN} {R_IN} 0 0 1 {lx} {STROKE}L{b} {STROKE}L{a} 0Z"
    )
    rot = lambda x: round(ISO_W - x, 3)  # noqa: E731
    rx = rot(lx)
    right = (
        f"M{rx} {ISO_H}A{R_OUT} {R_OUT} 0 0 0 {rx} 0L{rot(d)} 0L{rot(c)} {STROKE}"
        f"L{rx} {STROKE}A{R_IN} {R_IN} 0 0 1 {rx} {ISO_H - STROKE}L{rot(b)} {ISO_H - STROKE}"
        f"L{rot(a)} {ISO_H}Z"
    )
    return left + right, (ISO_W / 2, cy, NODE_R)


ISO_D, (NX, NY, NR) = iso_paths()
# Un trazo fino del mismo color redondea las esquinas, como en el dibujo original.
SOFT = 0.8
ISO_VB = f"{-SOFT} {-SOFT} {ISO_W + 2 * SOFT} {ISO_H + 2 * SOFT}"


def iso_group(fill="currentColor"):
    return (
        f'<path d="{ISO_D}" fill="{fill}" stroke="{fill}" stroke-width="{SOFT}" '
        f'stroke-linejoin="round"/><circle cx="{NX}" cy="{NY}" r="{NR}" fill="{fill}"/>'
    )


# ── Logotipo ──────────────────────────────────────────────────────────────
TEXT, TRACK, ROUND = "LSMFit", -18.0, 16.0
W.FONT = "bricolage-800.ttf"


def wordmark():
    _f, gs, cmap, hmtx = W.load()
    x, parts = 0.0, []
    for ch in TEXT:
        gn = cmap[ord(ch)]
        g = W.glyph_shape(gs, gn)
        if ch == "i":  # el punto de la i es el nodo del isotipo
            pieces = sorted(g.geoms, key=lambda p: p.bounds[1])
            stem, dot = pieces[0], pieces[-1]
            sx = (stem.bounds[0] + stem.bounds[2]) / 2
            dy = (dot.bounds[1] + dot.bounds[3]) / 2
            dd = max(dot.bounds[2] - dot.bounds[0], dot.bounds[3] - dot.bounds[1]) * 1.05
            g = unary_union([stem, Point(sx, dy).buffer(dd / 2, quad_segs=48)])
        parts.append(translate(g, xoff=x))
        x += hmtx[gn][0] + TRACK
    geom = unary_union(parts)
    # Esquinas suaves: erosionar y dilatar redondea las convexas.
    geom = geom.buffer(-ROUND, join_style=1).buffer(ROUND, join_style=1)
    geom = scale(geom, yfact=-1, origin=(0, 0)).simplify(0.6)
    return translate(geom, xoff=-geom.bounds[0], yoff=-geom.bounds[1])


def svg(vb, body, label="LSMFit"):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" '
        f'aria-label="{label}">{body}</svg>'
    )


def main(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    word = wordmark()
    ww, wh = word.bounds[2], word.bounds[3]
    word_d = W.to_path(word, precision=1)

    # Lockup horizontal: isotipo a 1.25 veces la caja alta, centrado en la palabra.
    cap = wh
    s = cap * 1.25 / ISO_H
    iso_w = ISO_W * s
    gap = cap * 0.42
    lock_h = max(ISO_H * s, wh)
    iso_ty = (lock_h - ISO_H * s) / 2
    word_ty = (lock_h - wh) / 2
    lock_w = iso_w + gap + ww
    lock_word_d = W.to_path(translate(word, xoff=iso_w + gap, yoff=word_ty), precision=1)
    iso_tf = f"translate(0 {iso_ty:.1f}) scale({s:.4f})"

    # Lockup vertical (como el dibujo): isotipo arriba, palabra abajo.
    sv = ww * 0.9 / (ISO_W + 2 * SOFT)
    st_iso_w, st_iso_h = (ISO_W + 2 * SOFT) * sv, (ISO_H + 2 * SOFT) * sv
    st_gap = wh * 0.5
    st_h = st_iso_h + st_gap + wh
    st_word_d = W.to_path(translate(word, yoff=st_iso_h + st_gap), precision=1)
    st_tf = f"translate({(ww - st_iso_w) / 2 + SOFT * sv:.1f} {SOFT * sv:.1f}) scale({sv:.4f})"

    files = {
        "lsmfit-mark.svg": svg(ISO_VB, iso_group(ORANGE)),
        "lsmfit-wordmark.svg": svg(f"0 0 {ww:.1f} {wh:.1f}", f'<path d="{word_d}" fill="{INK}"/>'),
        "lsmfit-lockup.svg": svg(
            f"{-SOFT * s:.1f} {-SOFT * s:.1f} {lock_w + 2 * SOFT * s:.1f} {lock_h + 2 * SOFT * s:.1f}",
            f'<g transform="{iso_tf}">{iso_group(ORANGE)}</g><path d="{lock_word_d}" fill="{INK}"/>',
        ),
        "lsmfit-lockup-stacked.svg": svg(
            f"0 0 {ww:.1f} {st_h:.1f}",
            f'<g transform="{st_tf}">{iso_group(ORANGE)}</g><path d="{st_word_d}" fill="{INK}"/>',
        ),
    }
    # Icono de app: isotipo naranja sobre crema, en un cuadrado redondeado.
    icon_body = (
        f'<rect width="64" height="64" rx="14" fill="{CREAM}"/>'
        f'<g transform="translate(8 {32 - ISO_H * 48 / ISO_W / 2:.2f}) scale({48 / ISO_W:.4f})">'
        f"{iso_group(ORANGE)}</g>"
    )
    files["lsmfit-icon.svg"] = svg("0 0 64 64", icon_body)
    for name, content in files.items():
        (out / name).write_text(content)

    json.dump(
        dict(
            iso_d=ISO_D, iso_vb=ISO_VB, node=[NX, NY, NR], soft=SOFT,
            word_d=word_d, word_w=round(ww, 1), word_h=round(wh, 1),
            lock_word_d=lock_word_d, lock_w=round(lock_w, 1), lock_h=round(lock_h, 1),
            lock_iso_tf=iso_tf,
        ),
        open(out / "out.json", "w"),
    )
    print(f"wordmark {ww:.0f}x{wh:.0f} | lockup {lock_w:.0f}x{lock_h:.0f} | stacked {ww:.0f}x{st_h:.0f}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "out"))
