import json
from shapely.affinity import scale, translate
import wordmark as WM, wmlib as W

CAP, TOL, MARK_RATIO, GAP_RATIO = 660.0, 0.8, 1.18, 0.46
ISO = dict(stroke=7.5, d1="M25.94 47.22 A16 16 0 1 1 25.94 16.78",
           d2="M38.06 47.22 A16 16 0 1 0 38.06 16.78", node=(32, 32, 5.5),
           minx=1.25, maxx=62.75, miny=12.25, maxy=51.75)
r = lambda v: round(v, 1)

w = WM.build({**WM.CFG, "dot": 213.0}).simplify(TOL)
w = scale(w, yfact=-1, origin=(0, 0))
w = translate(w, xoff=-w.bounds[0])
wx1, wy0, wy1 = w.bounds[2], w.bounds[1], w.bounds[3]

s = (CAP * MARK_RATIO) / (ISO["maxy"] - ISO["miny"])
iso_h, iso_w = (ISO["maxy"] - ISO["miny"]) * s, (ISO["maxx"] - ISO["minx"]) * s
word_dx = iso_w + CAP * GAP_RATIO
top = min(wy0, -CAP / 2 - iso_h / 2)
bot = max(wy1, -CAP / 2 + iso_h / 2)

def iso_group(dy):
    tx, ty = -ISO["minx"] * s, dy - CAP / 2 - (ISO["miny"] + ISO["maxy"]) / 2 * s
    return (f'<g transform="translate({r(tx)} {r(ty)}) scale({s:.4f})">'
            f'<g fill="none" stroke="currentColor" stroke-width="{ISO["stroke"]}" stroke-linecap="round">'
            f'<path d="{ISO["d1"]}"/><path d="{ISO["d2"]}"/></g>'
            f'<circle cx="32" cy="32" r="5.5" fill="currentColor"/></g>')

word_only = W.to_path(translate(w, yoff=-wy0), precision=1)
word_lock = W.to_path(translate(w, xoff=word_dx, yoff=-top), precision=1)
json.dump(dict(
    word_d=word_only, word_w=r(wx1), word_h=r(wy1 - wy0),
    lock_d=word_lock, lock_w=r(word_dx + wx1), lock_h=r(bot - top),
    iso_g=iso_group(-top),
), open("out.json", "w"))
print(f"wordmark {r(wx1)}x{r(wy1-wy0)}  |  lockup {r(word_dx+wx1)}x{r(bot-top)}")
