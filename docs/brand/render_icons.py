"""Renderiza los iconos de la web y de la app móvil desde el isotipo de lsmfit.py.

    python render_icons.py <raiz-del-repo>
"""
import io
import sys
from pathlib import Path

import cairosvg
from PIL import Image

import lsmfit as L

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "../..")
FRONT, MOBILE = ROOT / "frontend", ROOT / "mobile" / "assets" / "images"


def iso_svg(canvas, iso_width, fill, bg=None, radius=0):
    """Isotipo centrado en un lienzo cuadrado `canvas`, de ancho `iso_width`."""
    s = iso_width / (L.ISO_W + 2 * L.SOFT)
    h = (L.ISO_H + 2 * L.SOFT) * s
    tx, ty = (canvas - iso_width) / 2 + L.SOFT * s, (canvas - h) / 2 + L.SOFT * s
    back = f'<rect width="{canvas}" height="{canvas}" rx="{radius}" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas}" height="{canvas}" '
        f'viewBox="0 0 {canvas} {canvas}">{back}'
        f'<g transform="translate({tx:.2f} {ty:.2f}) scale({s:.4f})">{L.iso_group(fill)}</g></svg>'
    )


def png(svg, size):
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=size)))


def main():
    # Web: el favicon va sin fondo para que se lea en pestañas claras y oscuras.
    small = [png(iso_svg(64, 60, L.ORANGE), n) for n in (16, 32, 48)]
    small[2].save(FRONT / "app" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=small[:2])
    png(iso_svg(512, 400, L.ORANGE, L.CREAM, 112), 512).save(FRONT / "app" / "icon.png")
    png(iso_svg(512, 400, L.ORANGE, L.CREAM, 112), 512).save(FRONT / "public" / "app-icon-512.png")
    # iOS recorta las esquinas solo: el icono va a sangre.
    png(iso_svg(180, 130, L.ORANGE, L.CREAM), 180).save(FRONT / "app" / "apple-icon.png")

    # Móvil (Expo).
    png(iso_svg(1024, 760, L.ORANGE, L.CREAM), 512).save(MOBILE / "icon.png")
    png(iso_svg(1024, 560, L.ORANGE), 1024).save(MOBILE / "android-icon-foreground.png")
    png(iso_svg(1024, 560, "#FFFFFF"), 1024).save(MOBILE / "android-icon-monochrome.png")
    Image.new("RGBA", (1024, 1024), L.CREAM).save(MOBILE / "android-icon-background.png")
    png(iso_svg(512, 400, L.ORANGE), 512).save(MOBILE / "splash-icon.png")
    png(iso_svg(512, 400, L.ORANGE), 512).save(MOBILE / "splash-icon-dark.png")
    png(iso_svg(48, 44, L.ORANGE), 48).save(MOBILE / "favicon.png")

    # Logo de los correos: PNG (Gmail y Outlook no muestran SVG), a 2x de 132 px.
    lockup = (FRONT / "public" / "lsmfit-lockup.svg").read_text()
    (FRONT / "public" / "email").mkdir(exist_ok=True)
    png(lockup, 264).save(FRONT / "public" / "email" / "lsmfit-logo.png")


if __name__ == "__main__":
    main()
