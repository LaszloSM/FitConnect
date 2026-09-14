# FitConnect: sistema de diseño "Calor"

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
| Fondo | `--bg-base` / `bg-surface` | Página |
| Tarjeta | `--bg-card` / `bg-panel` | Tarjetas, diálogos, tablas |
| Menú | `--bg-sidebar` / `bg-sidebar` | Barra lateral |
| Campo | `--bg-input` / `bg-field` | Inputs |
| Apagado | `--bg-muted` / `bg-muted` | Hover de filas, pistas de gráficos, esqueletos |
| Atención | `--bg-attention` / `bg-attention` | Un solo bloque que pide atención (ingreso en riesgo) |
| Tinta | `--text-base` / `text-ink` | Texto principal |
| Secundario | `--text-muted` / `text-ink-muted` | Metadatos |
| Línea | `--border-base` / `border-line` | Divisores y bordes de campos |
| **Coral (relleno)** | `--brand` / `bg-primary` | Botón primario, item activo, barras de hoy |
| Tinta sobre coral | `--brand-contrast` / `text-primary-contrast` | Texto sobre el relleno |
| Coral como texto | `--brand-ink` / `text-primary-ink` | Enlaces y acciones en línea |
| Coral suave | `--brand-muted` / `bg-primary-muted` | Fondo de marcadores numerados y rangos |
| Serie de datos | `--data-1..3` | Segmentos (efectivo, tarjeta, transferencia) |

Señales (`--signal-ok|warn|danger|info` con `-bg` y `-line`): verde al día, ámbar por vencer, rojo vencido o
negado, azul hielo para congelado e informativo. **Siempre con icono y texto**, nunca solo color.

**Reglas**
- Un solo botón primario coral por vista. Las acciones de fila son secundarias.
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

- **Las tarjetas se separan por sombra, no por borde.** `surface-1` / `card` = `--shadow-card` (sombra cálida
  en dos capas + brillo interior de 1 px). `surface-2` = elevación alta.
- Dentro de una tarjeta, las columnas se separan con regla vertical de 1 px y aire; nunca tarjeta dentro de
  tarjeta.
- Radios: chips 8 px (`--radius-sm`), controles 11 px (`--radius-md`), tarjetas 18 px (`--radius-lg`),
  diálogos 20 px (`--radius-xl`). `rounded-full` solo para puntos y avatares de persona.
- El botón primario lleva `--shadow-primary` (sombra teñida de coral); en oscuro solo el brillo interior.

## 4. Composición del Hoy (1 · Refinado)

1. Encabezado: "Hoy" + Nuevo socio (secundario) + Cobrar (primario).
2. **Tarjeta del día:** cifra de entradas con variación y comparación en frase ("un jueves normal lleva 36"),
   gráfico de entradas por hora sobre la curva de un día normal con marcador "Ahora", y a la derecha la lista
   **En vivo** con hora, persona y estado.
3. **Franja de plata** (una tarjeta, cuatro columnas con reglas): cobrado hoy con sparkline y métodos,
   por confirmar, por cobrar por antigüedad, cierre del mes con bullet graph.
4. Abajo: **vencen esta semana** (tira de 7 días + filas con Cobrar) y **ingreso en riesgo** (bloque de
   atención con las personas y el motivo en palabras).
5. Pie: estado de caja y máquinas en una línea.

Esta gramática se reutiliza en el resto de pantallas: una tarjeta protagonista con el instrumento de la
vista, una franja de cifras relacionadas, listas accionables.

## 5. Componentes

- **Botón primario:** coral, 40 px, radio 11, `font-semibold`, `active:scale-[0.97]`. Secundario: tarjeta con
  borde. Destructivo: texto o borde rojo; relleno rojo solo en la confirmación.
- **Chip de estado** (`StatusBadge`): radio 8, fondo de la señal, icono + texto, sin borde.
- **Indicador:** cifra en Bricolage, píldora de variación (verde o roja con flecha), comparación en texto,
  sparkline opcional. Si la fuente falla, "—" y "No se pudo cargar", nunca `$0`.
- **Inputs:** etiqueta arriba, ayuda y error abajo, foco con anillo coral.
- **Vacíos, carga y sin permiso:** igual que antes. Esqueleto con la geometría final; vacío que explica qué
  falta y cómo poblarlo; sin permiso dice quién puede verlo.
- **Iconos:** un solo set de trazo uniforme. Sin iconos en contenedores sobre los títulos.

## 6. Movimiento

Tokens: `--ease-out`, `--ease-in-out`, `--ease-drawer`, `--duration-fast|base|slow` (150/220/320 ms).

- Solo `transform` y `opacity`. Nada de `transition-all`.
- Sin coreografía al navegar entre pantallas frecuentes. Se anima lo que cambia de verdad: una entrada nueva
  en "En vivo", un cobro que suma, una cifra que cambia.
- `prefers-reduced-motion` se respeta globalmente; en Framer Motion además `useReducedMotion`.

## 7. Responsive

- **Móvil (< 768 px):** barra inferior de 5 destinos con Cobrar al centro. Una columna.
- **Tablet (768 a 1279 px):** menú colapsado a iconos.
- **Escritorio (>= 1280 px):** menú expandido.
- Targets táctiles de 44 px o más. Las tablas anchas scrollean en su contenedor.

## 8. Marca

El logo está en rediseño por parte del dueño. Mientras tanto: wordmark "FitConnect" en Bricolage 700 y el
monograma neutro.

## 9. Cómo se hace cumplir

```bash
cd frontend && npm run check:contrast
cd frontend && npx tsc --noEmit
```

Además, `npx impeccable detect --json` sobre las pantallas renderizadas y revisión en vivo con `/browse`
en claro, oscuro, 375 y 1440 px antes de dar un cambio por terminado.
