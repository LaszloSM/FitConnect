# Marca LSMFit

Referencia original: `lsmfit-referencia.webp` (el dibujo entregado por el dueño).
Todo lo demás sale de `lsmfit.py`, que redibuja la marca en vectores.

## Isotipo

Dos "C" de trazo uniforme sobre un estadio de 56 × 36, cortadas en diagonal y
simétricas por rotación de 180° alrededor del centro, con un nodo circular en
medio. Un trazo fino del mismo color redondea las esquinas, como en el dibujo.

Parámetros en `lsmfit.py`: `STROKE` (grosor), `NODE_R` (nodo), `K` (pendiente de
los cortes), `H` (mitad del hueco), `TOP_X`/`BOT_X` (dónde caen los cortes).

Vive en `frontend/components/common/BrandMark.tsx` (una sola tinta en
`currentColor`) y hay una copia mínima en `platform/components/BrandMark.tsx`.

## Logotipo

"LSMFit" en **Bricolage Grotesque ExtraBold** (la display del producto) con las
esquinas suavizadas y el punto de la i cambiado por un círculo, el nodo del
isotipo. Es un trazado, no texto: vive en `BrandLockup.tsx`.

## Regenerar

```bash
pip install fonttools brotli shapely cairosvg pillow
curl -o bricolage-800.ttf "<TTF de Bricolage Grotesque 800 en fonts.gstatic.com>"
python lsmfit.py out            # SVG + out.json con los trazados para los .tsx
python render_icons.py ../..    # favicon, iconos de la web y de la app móvil
```

`out.json` trae `iso_d`, `iso_vb`, `node`, `word_d`, `lock_word_d`, `lock_w`,
`lock_h` y `lock_iso_tf`, que van tal cual en `BrandMark.tsx` y `BrandLockup.tsx`.

## Colores

| | Uso | Hex | Token |
|---|---|---|---|
| Naranja del logo | Solo la marca | `#D8421A` | `--brand-logo` `oklch(0.592 0.193 35)` |
| Coral de interfaz | Botones, selección | `#C4360C` | `--brand` `oklch(0.545 0.185 35)` |
| Tinta | Logotipo, texto | `#2A1911` | — |
| Crema | Fondo de iconos | `#FCF6ED` | — |

El naranja del logo es el mismo tono que el coral de la interfaz pero más claro:
con texto blanco encima da 4,46:1 y no llega al 4,5:1 de AA. Por eso los botones
siguen en `--brand` y el naranja exacto queda para el logo.

## Archivos

| Archivo | Qué es |
|---|---|
| `frontend/public/lsmfit-mark.svg` | Isotipo naranja |
| `frontend/public/lsmfit-icon.svg` | Isotipo sobre cuadrado crema redondeado |
| `frontend/public/lsmfit-wordmark.svg` | Logotipo solo |
| `frontend/public/lsmfit-lockup.svg` | Lockup horizontal |
| `frontend/public/lsmfit-lockup-stacked.svg` | Lockup vertical (como el dibujo) |
| `frontend/app/favicon.ico`, `icon.png`, `apple-icon.png`, `public/app-icon-512.png` | Iconos web |
| `mobile/assets/images/*` | Icono, adaptativo de Android, splash y favicon de la app |
| `lockup.png` | Vista previa del lockup vertical |
