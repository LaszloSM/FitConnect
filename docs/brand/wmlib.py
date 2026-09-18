import math
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

FONT = "bricolage-700.ttf"

def quad(p0, p1, p2, n=20):
    return [((1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t*t*p2[0],
             (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t*t*p2[1])
            for t in (i/n for i in range(1, n+1))]

def cubic(p0, p1, p2, p3, n=24):
    return [((1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t*t*p2[0] + t**3*p3[0],
             (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t*t*p2[1] + t**3*p3[1])
            for t in (i/n for i in range(1, n+1))]

def rings(glyphset, name):
    pen = DecomposingRecordingPen(glyphset)
    glyphset[name].draw(pen)
    out, cur = [], []
    for op, args in pen.value:
        if op == "moveTo":
            if len(cur) > 2: out.append(cur)
            cur = [args[0]]
        elif op == "lineTo":
            cur.append(args[0])
        elif op == "qCurveTo":
            pts = list(args); on = pts[-1]; offs = pts[:-1]
            if on is None:
                on = ((offs[0][0]+offs[-1][0])/2, (offs[0][1]+offs[-1][1])/2)
            prev = cur[-1]
            for i, c in enumerate(offs):
                nxt = on if i == len(offs)-1 else ((c[0]+offs[i+1][0])/2, (c[1]+offs[i+1][1])/2)
                cur += quad(prev, c, nxt); prev = nxt
        elif op == "curveTo":
            cur += cubic(cur[-1], *args)
        elif op == "closePath":
            if len(cur) > 2: out.append(cur)
            cur = []
    if len(cur) > 2: out.append(cur)
    return out

def signed_area(r):
    return sum((r[i][0]*r[(i+1) % len(r)][1] - r[(i+1) % len(r)][0]*r[i][1]) for i in range(len(r))) / 2

def glyph_shape(glyphset, name):
    """Poligono relleno del glifo: union de contornos exteriores menos los huecos."""
    outers, holes = [], []
    for r in rings(glyphset, name):
        p = Polygon(r)
        if not p.is_valid: p = p.buffer(0)
        if p.is_empty: continue
        (holes if signed_area(r) > 0 else outers).append(p)
    shape = unary_union(outers)
    if holes: shape = shape.difference(unary_union(holes))
    return shape

def to_path(geom, precision=2):
    """Geometria shapely -> atributo d de un <path> SVG."""
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    parts = []
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            pts = list(ring.coords)[:-1]
            if len(pts) < 3: continue
            d = f"M{pts[0][0]:.{precision}f} {pts[0][1]:.{precision}f}"
            d += "".join(f"L{x:.{precision}f} {y:.{precision}f}" for x, y in pts[1:])
            parts.append(d + "Z")
    return "".join(parts)

def load():
    f = TTFont(FONT)
    return f, f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
