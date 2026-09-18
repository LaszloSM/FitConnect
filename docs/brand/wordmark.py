import math, sys, json
from shapely.geometry import Polygon, Point
from shapely.affinity import translate, scale
from shapely.ops import unary_union
import wmlib as W

TEXT = "FitConnect"
STROKE = 145.0          # grosor del trazo de Bricolage Bold a 1000 upm
CFG = dict(
    aperture=45.0,      # medio angulo del hueco radial de C y c
    e_gap=(-45.0, 10.0),  # sector abierto de la e
    e_below=230.0,        # la barra de la e queda intacta por encima de esta altura
    dot=180.0,          # diametro del punto de la i
    dot_y=664.0,        # centro vertical del punto
    track=-28.0,        # tracking en unidades de 1000 upm
    kern={},            # ajustes por par
)

def radial_gap(geom, lo, hi, below=None):
    """Recorta el sector angular [lo, hi] desde el centro del glifo: los
    terminales quedan cortados sobre radios, igual que los arcos del isotipo."""
    minx, miny, maxx, maxy = geom.bounds
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    R = (maxx - minx + maxy - miny)
    pts = [(cx, cy)]
    steps = max(2, int(abs(hi - lo)))
    for i in range(steps + 1):
        a = math.radians(lo + (hi - lo) * i / steps)
        pts.append((cx + R * math.cos(a), cy + R * math.sin(a)))
    cut = Polygon(pts)
    if below is not None:   # no tocar la barra de la e: recorta solo por debajo
        cut = cut.intersection(Polygon([(cx - R, cy - R), (cx + R, cy - R),
                                        (cx + R, below), (cx - R, below)]))
    return geom.difference(cut)

def brand_dot(geom, diameter, cy):
    """Cambia el punto de la i por un circulo: el nodo del isotipo."""
    parts = sorted(geom.geoms, key=lambda g: g.bounds[1])
    stem, _dot = parts[0], parts[-1]
    sx = (stem.bounds[0] + stem.bounds[2]) / 2
    return unary_union([stem, Point(sx, cy).buffer(diameter / 2, quad_segs=64)])

def build(cfg):
    f, gs, cmap, hmtx = W.load()
    x, parts = 0.0, []
    for idx, ch in enumerate(TEXT):
        gn = cmap[ord(ch)]
        g = W.glyph_shape(gs, gn)
        if ch in "Cc":
            g = radial_gap(g, -cfg["aperture"], cfg["aperture"])
        elif ch == "e":
            g = radial_gap(g, *cfg["e_gap"], below=cfg["e_below"])
        elif ch == "i":
            g = brand_dot(g, cfg["dot"], cfg["dot_y"])
        parts.append(translate(g, xoff=x))
        x += hmtx[gn][0] + cfg["track"] + cfg["kern"].get(TEXT[idx:idx+2], 0)
    return unary_union(parts)

def emit(geom, path, fill="#251A15", pad=0):
    flipped = scale(geom, yfact=-1, origin=(0, 0))
    minx, miny, maxx, maxy = flipped.bounds
    vb = f"{minx-pad:.1f} {miny-pad:.1f} {maxx-minx+2*pad:.1f} {maxy-miny+2*pad:.1f}"
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" '
           f'aria-label="FitConnect"><path d="{W.to_path(flipped)}" fill="{fill}"/></svg>')
    open(path, "w").write(svg)
    return [round(v) for v in flipped.bounds]

if __name__ == "__main__":
    cfg = dict(CFG)
    if len(sys.argv) > 2: cfg.update(json.loads(sys.argv[2]))
    print("bbox", emit(build(cfg), sys.argv[1] if len(sys.argv) > 1 else "wordmark.svg"))
