# FitConnect — Sistema de diseño "Tiza"

Dirección elegida el 2026-09-12, tras la auditoría de la Fase 0 (`docs/design/AUDIT-2026-09.md`) y la
comparación de tres direcciones en Stitch (proyecto "FitConnect Premium Prototyping System",
design system `A · Tiza`).

**Atmósfera:** la pizarra de un box limpia a las 5:30 am. Calmada, precisa, legible bajo luz dura
en la recepción. Densidad media-alta, poco movimiento, cero decoración que no signifique algo.

**Fuente de verdad de los valores:** `frontend/app/globals.css`. Este documento tiene las reglas;
los números viven en el CSS y `npm run check:contrast` los verifica.

---

## 1. Color

Un solo acento. Todo lo demás es neutro o es una señal semántica.

| Rol | Token / utilidad | Uso |
|---|---|---|
| Fondo (tiza) | `--bg-base` / `bg-surface` | Fondo de página |
| Superficie | `--bg-card` / `bg-panel` | Solo lo que se toca o se lee como bloque: tablas, formularios, diálogos |
| Menú | `--bg-sidebar` / `bg-sidebar` | Sidebar |
| Campo | `--bg-input` / `bg-field` | Inputs |
| Apagado | `--bg-muted` / `bg-muted` | Hover de filas, chips, esqueletos |
| Tinta (grafito) | `--text-base` / `text-ink` | Texto principal |
| Secundario | `--text-muted` / `text-ink-muted` | Metadatos, descripciones |
| Línea | `--border-base` / `border-line` | Todos los divisores y bordes, 1 px |
| **Pino (relleno)** | `--brand` / `bg-primary` | Botón primario, item activo, foco |
| Tinta sobre pino | `--brand-contrast` / `text-primary-contrast` | Único texto sobre el relleno (casi blanco) |
| Pino como texto | `--brand-ink` / `text-primary-ink` | Enlaces, acciones en línea |
| Pino sobre oscuro fijo | `--brand-on-dark` | Kiosko y pantalla del gym |

Señales (`--signal-ok|warn|danger|info` + `-bg` + `-line`): solo para estado. Nunca decoran.

**Reglas**
- Los acentos por módulo desaparecieron: `--accent-*` apunta a `--text-muted` hasta que cada
  flujo se rediseñe y deje de usarlos. No introducir colores por módulo.
- Nada de tokens de shadcn (`text-muted-foreground`, `bg-popover`…): no existen aquí.
- Nada de hex ni `bg-[#…]` en componentes. Si falta un color, falta un token.
- Relleno y tinta son roles distintos: `bg-primary` con `text-primary-contrast`; el pino como
  texto es `text-primary-ink`.
- Nada de gradientes, glow, glassmorphism ni `border-l-4`. Alertas: fondo `-bg` + borde `-line`
  completo.

## 2. Tipografía

- **Geist** para toda la UI. **Geist Mono** con `tabular-nums` para dinero (COP), cédulas, horas,
  códigos y cualquier columna numérica.
- Un solo estilo de cifra grande: Geist Mono 600, tracking -0.02em. No mezclar sans y mono para
  montos en la misma pantalla.
- Títulos en peso 600, tracking -0.015em, `text-wrap: balance`. Nunca 800.
- Etiquetas y encabezados de sección en **sentence case**. Las MAYÚSCULAS con tracking quedan solo
  para cabeceras de tabla, y con moderación.

| Uso | Tamaño | Peso |
|---|---|---|
| Título de página | 24 px | 600 |
| Título de sección | 16 px | 600 |
| Cuerpo / celdas | 14 px | 400 |
| Metadato | 13 px | 400 |
| Mínimo absoluto | 12 px | — |
| Cifra KPI | 28–32 px mono | 600 |

## 3. Espaciado y layout

- Escala de 4 px (4, 8, 12, 16, 24, 32, 48).
- **32 px de aire entre el header y el contenido de la página.** Siempre.
- Las secciones se separan con divisores y aire, no con tarjetas. Una tarjeta existe solo si el
  bloque es la interacción (una fila de "Vencen esta semana", un producto del POS).
- Nunca tarjeta dentro de tarjeta.
- Panel: franja de cifras continua con divisores verticales, luego dos columnas (trabajo vivo a la
  izquierda, pendientes y caja a la derecha).
- Contenido con ancho máximo de 1440 px.

## 4. Radios y elevación

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | 6 px | Chips, badges, esqueletos |
| `--radius-md` | 8 px | Botones e inputs (**nunca pill**) |
| `--radius-lg` | 10 px | Paneles, tablas |
| `--radius-xl` | 12 px | Diálogos, popovers |

`rounded-full` solo para avatares y puntos de estado. Sombras mínimas y teñidas; la jerarquía la
dan fondo y línea, no la sombra. Diálogos y popovers sí llevan sombra.

## 5. Componentes

- **Botón primario:** relleno pino, texto casi blanco, radio 8 px, `active:translate-y-px`.
  Uno por vista.
- **Secundario:** borde línea sobre superficie. **Terciario:** texto `text-primary-ink`.
- **Destructivo:** texto o borde de `--signal-danger`; relleno rojo solo en la confirmación.
- **Inputs:** etiqueta arriba, ayuda y error debajo, foco con anillo pino. Nunca solo placeholder.
- **Estados de acceso** (Permitido / Vencido / Bloqueado): chip pequeño con icono + texto.
- **Tablas:** filas de 44–52 px, hora absoluta (`06:41`) en mono, acciones visibles en la fila
  cuando son la tarea (Cobrar), en menú cuando son secundarias.
- **Confirmaciones:** diálogo propio, nunca `window.confirm()`.
- **Vacíos:** qué falta, por qué importa y la acción para poblarlo.
- **Sin permiso:** explicar quién puede verlo; nunca "Sin permisos suficientes" pelado.
- **Carga:** esqueleto con la misma rejilla que el contenido final.

## 6. Movimiento

Tokens: `--ease-out`, `--ease-in-out`, `--duration-fast|base|slow` (150/220/320 ms).

- Solo `transform` y `opacity`. Nada de `transition-all`.
- Entradas: fade + 8 px de desplazamiento, stagger corto en listas.
- Nada que arranque invisible esperando un observer: el primer frame siempre se lee.
- `prefers-reduced-motion` se respeta globalmente (`globals.css`); en Framer Motion además
  `useReducedMotion`.

## 7. Responsive

- **Móvil (< 768 px):** el sidebar no existe; barra inferior de 5 destinos (Panel, Socios,
  Cobrar, Check-ins, Más). Todo a una columna. Nada de scroll horizontal del body; las tablas
  anchas scrollean en su propio contenedor.
- **Tablet (768–1279 px):** sidebar colapsado a iconos, abre como drawer.
- **Escritorio (≥ 1280 px):** sidebar expandido, colapsable.
- Targets táctiles ≥ 44 px.

## 8. Marca y logo

El logo está en rediseño por parte del dueño. Mientras tanto: wordmark de texto "FitConnect" en
Geist 600 y un slot neutro de 28 px. Nada de verde lima ni del logo "FC" anterior en superficies
nuevas.

## 9. Landing

Muestra el producto real, como los SaaS de referencia (Linear, Stripe, Attio):

1. Nav: wordmark, Producto, Precios, Clientes, Preguntas, Ingresar, "Prueba 30 días gratis".
2. Hero alineado a la izquierda: qué es y para quién en una frase, subtítulo con los tres trabajos
   (acceso, cobro, caja) y el contexto colombiano, un solo CTA.
3. Captura grande y nítida de la app real dentro de un marco de navegador.
4. Clientes reales (cuando existan; nunca cifras ni logos inventados).
5. Tres secciones en zig-zag, cada una con una captura real: check-in por cédula, cobro con
   recibo, cierre de caja.
6. Precios en COP y preguntas frecuentes.

Sin fotos de personas ni músculos, sin narrativa abstracta.

## 10. Cómo se hace cumplir

```bash
cd frontend && npm run check:contrast     # pares WCAG en claro y oscuro
cd frontend && npx tsc --noEmit
```

Contraste confirmado también en el navegador con color computado (ver CLAUDE.md). Todo cambio de UI
se verifica en vivo con `/browse` antes de darlo por terminado.
