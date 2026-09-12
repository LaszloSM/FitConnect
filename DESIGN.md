# FitConnect — Sistema de color

**La fuente de verdad de los valores es `frontend/app/globals.css`.** Este documento
tiene las reglas, no los números: durante meses hubo tres documentos con la paleta
copiada y los tres describían un azul (hue 264) mientras el código era verde
(hue 150), con un `tailwind.config.ts` que Tailwind v4 ni siquiera leía.

## Cómo funcionan los tokens

`globals.css` declara las CSS vars en `:root` (claro) y `.dark` (oscuro), y un
bloque `@theme inline` las publica como utilidades de Tailwind. Por eso
`bg-primary`, `text-ink-muted` o `border-line` existen de verdad **y** cambian
solas al alternar el tema: apuntan a la misma var que `.dark` redefine.

| Utilidad | Var | Para qué |
|---|---|---|
| `bg-primary` / `bg-primary-hover` | `--color-primary` | Rellenos de marca: botón primario, item activo del menú |
| `text-primary-contrast` | `--color-primary-contrast` | **La única** tinta sobre el relleno de marca (casi-negro, nunca blanco) |
| `text-primary-ink` | `--color-primary-ink` | La marca como **texto**: enlaces, acciones en línea, iconos |
| `bg-base` / `bg-card` / `bg-sidebar` / `bg-input` / `bg-muted` | `--bg-*` | Superficies |
| `text-ink` / `text-ink-muted` / `text-ink-subtle` | `--text-*` | Jerarquía de texto |
| `border-line` | `--border-base` | Todos los bordes |
| `font-display` / `font-mono` | — | Cifras grandes / datos tabulares |

### El relleno y la tinta son dos roles, y tienen que serlo

Se buscó un valor único que sirviera para las dos cosas y **no existe para
ningún tono**: la frontera del claro y la del oscuro no se solapan, así que
`--color-primary-ink` se redefine en `.dark` por obligación, no por descuido.

El relleno de marca tiene 2.0:1 contra una tarjeta clara: como relleno es la
identidad del producto, como texto es ilegible. Son dos tokens distintos a
propósito:

```tsx
<button className="bg-primary text-primary-contrast">Cobrar</button>   {/* relleno */}
<Link className="text-primary-ink">Ver caja</Link>                      {/* texto   */}
```

### Acentos por módulo

`--accent-*` colorea el eyebrow y los iconos de cada módulo (`lib/module-accents.ts`).
Están calibrados para leerse **como texto** en ambos temas, así que en claro son
más oscuros de lo que sugiere el nombre del color.

## Reglas

- **Nunca** tokens de shadcn: `text-muted-foreground`, `bg-popover`, `bg-background`,
  `text-primary-foreground`, `border-input`, `bg-secondary`, `text-foreground`,
  `bg-destructive`. Este proyecto no los define y generan cero CSS.
- Sobre el relleno de marca va `text-primary-contrast`, nunca `text-white`.
- Nada de `border-l-4` en banners. Alertas: `bg-{c}-50 dark:bg-{c}-950/20 border border-{c}-200 dark:border-{c}-800/40`.
- `--text-muted` no baja de 12px: a 10-11px queda al límite de legibilidad.
- Superficies claras forzadas (tarjetas de login, QR): si fijas `bg-white`, fija
  también los colores de texto; el ink de marca es claro en modo oscuro y
  desaparecería.
- Todo overlay decorativo lleva `pointer-events-none`.

## Cómo se hace cumplir

```bash
cd frontend && npm run check:contrast
```

Lee los tokens de `globals.css`, calcula el ratio WCAG de cada par que el
producto usa de verdad —en claro y en oscuro— y falla si alguno baja del mínimo
(4.5:1 texto, 3:1 pistas como el placeholder, 1.3:1 bordes). Corre en CI en cada
push. Si cambias un token y el script pasa, el contraste está bien; si lo cambias
y no corres el script, no lo sabes.

Para ver la tabla completa, incluidos los pares que pasan:

```bash
cd frontend && node scripts/check-contrast.mjs --all
```

---

Las reglas de tipografía, espaciado, layout y movimiento están en
`FITCONNECT_DESIGN_SYSTEM.md`.
