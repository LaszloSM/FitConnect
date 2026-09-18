# Marca FitConnect

## Isotipo

Dos arcos enfrentados de grosor uniforme unidos por un nodo central, sobre una
retícula de 64. La apertura de cada arco es de 144° (±72° desde el eje) y los
terminales quedan cortados sobre radios.

Vive en `frontend/components/common/BrandMark.tsx`. Una sola tinta en
`currentColor`: coral en el producto, blanco en las superficies oscuras fijas
(kiosko, pantalla del salón).

## Logotipo

No es texto en una fuente. Parte de **Bricolage Grotesque Bold** (la display del
producto) y le aplica tres cambios que lo atan al isotipo:

1. **C, c y e**: los terminales se cortan sobre radios desde el centro del
   glifo, igual que los arcos del isotipo. C y c comparten una apertura de 90°
   (±45°), más abierta que la de la fuente y, sobre todo, la misma para las dos.
   En la `e` el corte se limita a la zona bajo la barra, que queda intacta.
2. **Punto de la i**: un círculo, no el rectángulo redondeado de la fuente. Su
   diámetro respeta la proporción del nodo del isotipo — nodo/trazo = 11/7.5 =
   1,467 — así que sobre un asta de 145 unidades mide 213.
3. **Tracking** de −28 unidades por 1000 em.

## Regenerar

```bash
pip install fonttools brotli shapely
curl -o bricolage-700.ttf "<url del TTF de Bricolage Grotesque 700 en fonts.gstatic.com>"
python emit2.py          # escribe out.json con los paths y los viewBox
```

`emit2.py` imprime las dimensiones y deja en `out.json`:

- `word_d` / `word_w` / `word_h` — el logotipo suelto.
- `lock_d` + `iso_g` / `lock_w` / `lock_h` — el lockup completo.

El `lock_d` (no el `word_d`) es el que va en `BrandLockup.tsx`: lleva el
desplazamiento horizontal que lo separa del isotipo.

Los parámetros están en `CFG` de `wordmark.py` (apertura, punto, tracking) y en
las constantes de `emit2.py` (`MARK_RATIO` = altura del isotipo respecto a la
caja alta, `GAP_RATIO` = aire entre isotipo y palabra, `TOL` = simplificación
del trazado en unidades de em).

## Colores

Salen de los tokens de Calor en `frontend/app/globals.css`. Los assets
estáticos no pueden leer CSS vars, así que los llevan escritos:

| | Token | Hex |
|---|---|---|
| Coral | `--brand` `oklch(0.545 0.185 35)` | `#C4360C` |
| Tinta | `--text-base` `oklch(0.230 0.020 45)` | `#251A15` |
| Crema | `--bg-base` `oklch(0.972 0.009 65)` | `#FAF5F0` |

Si la marca cambia de color, hay que regenerar `frontend/app/favicon.ico`,
`icon.png`, `apple-icon.png` y los SVG de `frontend/public/`.

## Archivos

| Archivo | Qué es |
|---|---|
| `frontend/components/common/BrandMark.tsx` | Isotipo solo |
| `frontend/components/common/BrandLockup.tsx` | Isotipo + logotipo |
| `frontend/public/fitconnect-mark.svg` | Isotipo, coral |
| `frontend/public/fitconnect-icon.svg` | Isotipo calado sobre squircle tinta |
| `frontend/public/fitconnect-wordmark.svg` | Logotipo solo |
| `frontend/public/fitconnect-lockup.svg` | Lockup a dos tintas |
| `frontend/app/favicon.ico` `icon.png` `apple-icon.png` | Iconos, del squircle |
| `logo-fitconnect-referencia.png` | El boceto original del que salió el isotipo |
