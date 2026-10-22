# LSMFit: sistema de diseño "Calor 2"

**Calor 2 (2026-10-22):** fondo piedra en vez de crema, tarjetas planas con un anillo de 1 px, el botón
primario pasa a tinta casi negra en píldora (`bg-action`) y el coral queda solo para datos, marca y lo que
pide atención. Navegación sin redundancia: un solo riel de iconos a la izquierda en escritorio y barra
inferior en el celular. Movimiento con piezas propias en `components/motion/`. Referencia aprobada:
https://claude.ai/artifact/JAVdBaHVUtp4twTzpWd9JM

Dirección elegida el 2026-09-14, después de descartar Tiza (plano, minimal genérico) y Marcador (cobalto,
banda). Se escogió entre tres direcciones en alta fidelidad (Pesas, Calor, Pase) y tres composiciones del
Hoy. Ganó **1 · Refinado**. Lienzo de referencia: https://claude.ai/code/artifact/09f07a20-6787-4b84-99f4-56bd15a2e083

**Escena:** la recepción de un gimnasio de barrio con luz de tarde. El dueño revisa el día en el portátil
o el celular, muchas veces de noche. Tiene que sentirse cálido, con energía y con capas, nunca plano ni
de plantilla.

**Fuente de verdad de los valores:** `frontend/app/globals.css`. Aquí van las reglas; los números viven en
el CSS y `npm run check:contrast` los verifica. La galería `/diseno` (solo en desarrollo) muestra cada
pieza en claro y oscuro.

---

## 1. Color

Estrategia **comprometida pero con medida**: neutros cálidos, un coral que marca acciones y selección, y
señales de estado aparte.

| Rol | Token / utilidad | Uso |
|---|---|---|
| Fondo (piedra) | `--bg-base` / `bg-surface` | Página |
| Elevado | `--bg-raised` / `bg-raised` | Hover de items, pista de controles |
| **Acción** | `--action` / `bg-action` + `text-action-ink` | Botón primario, chip elegido, indicador activo |
| Tarjeta | `--bg-card` / `bg-panel` | Tarjetas, diálogos, tablas |
| Menú | `--bg-sidebar` / `bg-sidebar` | Barra lateral |
| Campo | `--bg-input` / `bg-field` | Inputs |
| Apagado | `--bg-muted` / `bg-muted` | Hover de filas, pistas de gráficos, esqueletos |
| Atención | `--bg-attention` / `bg-attention` | Un solo bloque que pide atención (ingreso en riesgo) |
| Tinta | `--text-base` / `text-ink` | Texto principal |
| Secundario | `--text-muted` / `text-ink-muted` | Metadatos |
| Línea | `--border-base` / `border-line` | Divisores y bordes de campos |
| **Coral (relleno)** | `--brand` / `bg-primary` | Datos de hoy, la única celda que pide acción, marcadores |
| Tinta sobre coral | `--brand-contrast` / `text-primary-contrast` | Texto sobre el relleno |
| Coral como texto | `--brand-ink` / `text-primary-ink` | Enlaces y acciones en línea |
| Coral suave | `--brand-muted` / `bg-primary-muted` | Fondo de marcadores numerados y rangos |
| Serie de datos | `--data-1..3` | Segmentos (efectivo, tarjeta, transferencia) |

Señales (`--signal-ok|warn|danger|info` con `-bg` y `-line`): verde al día, ámbar por vencer, rojo vencido o
negado, azul hielo para congelado e informativo. **Siempre con icono y texto**, nunca solo color.

**Reglas**
- Un solo botón primario (`bg-action`) por vista. Las acciones de fila son secundarias.
- El coral no es botón: marca datos (la barra del mes en curso), la marca y la única cifra que pide acción.
- Un solo bloque `bg-attention` por vista.
- Nada de tokens de shadcn, hex sueltos, gradientes decorativos, glassmorphism ni `border-l-4`.
- Relleno y tinta son roles distintos: `bg-primary` + `text-primary-contrast`; como texto, `text-primary-ink`.

## 2. Tipografía

- **Bricolage Grotesque** (display, eje `opsz`): títulos de página y todas las cifras. Carga con `next/font`
  como `--font-bricolage`.
- **Figtree**: toda la interfaz que se lee (etiquetas, tablas, formularios). `--font-figtree`.
- **Sin monoespaciada.** Dinero, cédulas, horas y códigos van en Bricolage con `tabular-nums`: clase `num`
  (o `font-mono`, que queda como alias mientras se migra).

| Uso | Tamaño | Peso |
|---|---|---|
| Título de página (`h1`) | 40 px desktop, 32 px móvil | 700 |
| Cifra protagonista de la vista | 52 px | 700 |
| Cifra de sección | 28 a 38 px | 700 |
| Título de sección | 16 px | 650 |
| Cuerpo y celdas | 14 px | 400 a 600 |
| Metadato | 12.5 a 13 px | 400 |
| Mínimo absoluto | 11 px | |

Etiquetas en sentence case. Sin eyebrows en mayúsculas.

## 3. Superficies, forma y profundidad

- **Tarjetas planas.** `card` = `--elev-card` (anillo de 1 px con `--border-soft`), blanco sobre piedra.
  La sombra queda para lo que flota (riel, menús, diálogos).
- Dentro de una tarjeta, las columnas se separan con regla vertical de 1 px y aire; nunca tarjeta dentro de
  tarjeta.
- Radios: chips 8 px (`--radius-sm`), controles 12 px (`--radius-md`), tarjetas 20 px (`--radius-lg`),
  diálogos 24 px (`--radius-xl`). Botones, chips de filtro, buscadores y selectores van en píldora
  (`rounded-full`).

## 4. Composición del Hoy (versión 2)

1. Encabezado: saludo, una frase con el hallazgo del día y el selector Hoy / Este mes.
2. Fila de tres: **Cobrado** (cifra protagonista, Cobrar y Nuevo socio, métodos), **cuadro de cuatro**
   (vencen esta semana en coral, entradas, por confirmar, por cobrar o clases) e **ingresos por mes**
   (barras, el mes en curso en coral con la proyección rayada).
3. **Tarjeta del día:** entradas por hora con marcador "Ahora" y la lista **En vivo**.
4. **Vencen esta semana** y **ingreso en riesgo**; luego **movimientos de hoy** (tabla con búsqueda).
5. Pie: estado de caja y máquinas en una línea.

En el celular la puerta va primero (tarjeta del día), después las cifras.

Esta gramática se reutiliza en el resto de pantallas: una tarjeta protagonista con el instrumento de la
vista, una franja de cifras relacionadas, listas accionables.

## 5. Componentes

- **Botón primario:** `bg-action` en píldora, `font-semibold`, `active:scale-[0.97]`. Secundario: borde
  en píldora con hover `bg-raised`. Destructivo: texto o borde rojo; relleno rojo solo en la confirmación.
- **Chip de estado** (`StatusBadge`): radio 8, fondo de la señal, icono + texto, sin borde.
- **Indicador:** cifra en Bricolage, píldora de variación (verde o roja con flecha), comparación en texto,
  sparkline opcional. Si la fuente falla, "—" y "No se pudo cargar", nunca `$0`.
- **Inputs:** etiqueta arriba, ayuda y error abajo, foco con anillo coral.
- **Vacíos, carga y sin permiso:** igual que antes. Esqueleto con la geometría final; vacío que explica qué
  falta y cómo poblarlo; sin permiso dice quién puede verlo.
- **Iconos:** un solo set de trazo uniforme. Sin iconos en contenedores sobre los títulos.
- **Movimiento (`components/motion/`):** `SegmentedControl` (período, vista: recorte con `clip-path` que se
  desliza), `UnderlineTabs` (pestañas de sección con subrayado deslizante), `RollingNumber` (cifras que
  ruedan; los dígitos los pinta el CSS y el lector de pantalla solo oye el valor), `ThemeToggle` (revelado
  circular con View Transitions) y `useSlidingIndicator` (indicador por `transform`, ejes x, y o ambos).

## 6. Movimiento

Tokens: `--ease-out`, `--ease-in-out`, `--ease-drawer`, `--duration-fast|base|slow` (150/220/320 ms).

- Solo `transform` y `opacity`. Nada de `transition-all`.
- Sin coreografía al navegar entre pantallas frecuentes. Se anima lo que cambia de verdad: una entrada nueva
  en "En vivo", un cobro que suma, una cifra que cambia.
- `prefers-reduced-motion` se respeta globalmente; en Framer Motion además `useReducedMotion`.

## 7. Responsive

- **Móvil (< 768 px):** barra inferior de 5 destinos con Cobrar al centro y pastilla deslizante. Una columna.
- **Tablet y escritorio:** riel flotante de iconos con tooltip (con retraso la primera vez, instantáneo
  después); "Mostrar nombres" lo expande. Sin navegación repetida en el encabezado.
- Targets táctiles de 44 px o más. Las tablas anchas scrollean en su contenedor.

## 8. Marca

Isotipo: dos "C" cortadas en diagonal, simétricas por rotación, con un nodo al centro. Logotipo:
"LSMFit" en Bricolage Grotesque ExtraBold con esquinas suavizadas y el punto de la i redondo.
Componentes `BrandMark` y `BrandLockup` (color `text-logo` = `--brand-logo`, el naranja exacto del
logo `#D8421A`). El naranja del logo es más claro que `--brand`: se usa solo en la marca, nunca como
fondo de un botón con texto blanco. Detalle y generador en `docs/brand/`.

## 9. Cómo se hace cumplir

```bash
cd frontend && npm run check:contrast
cd frontend && npx tsc --noEmit
```

Además, `npx impeccable detect --json` sobre las pantallas renderizadas y revisión en vivo con `/browse`
en claro, oscuro, 375 y 1440 px antes de dar un cambio por terminado.
