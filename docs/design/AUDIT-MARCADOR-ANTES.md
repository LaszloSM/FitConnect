# Línea base del rediseño Marcador (F0, 2026-09-13)

Foto del producto en Tiza antes de tocar nada. Sirve para medir en F11 si Marcador quedó mejor con números y no con opiniones. Plan completo: `~/.claude/plans/impeccable-taste-skill-con-esas-melodic-pinwheel.md`.

## Capturas de referencia

Tiza real a 1440 px, gym demo, rol dueño: `frontend/public/landing/panel.png`, `socios.png`, `cobro.png`, `asistencia.png`, `inteligencia.png`. Las capturas en oscuro y a 375 px se toman en la primera sesión con navegador autenticado y se guardan en `~/.gstack/projects/LaszloSM-LSMFit/designs/marcador-antes/`.

## Detector de impeccable

| Objetivo | Hallazgos | Detalle |
|---|---|---|
| Código (`frontend/app`, `frontend/components`) | 2 | Geist como fuente sobreusada (`globals.css:1`, `:195`) |
| Landing renderizada (`localhost:3000`) | 19 | 9 líneas de texto de 96 a 110 caracteres (meta: menos de 80), 5 bordes de 1 px con sombra de 24 px, 3 tarjetas dentro de tarjeta, 1 transición de `height`, Geist en el 91 % del texto |

Salida completa en `docs/design/baseline/impeccable-detect*.json`. El detector estático sobre TSX ve poco; la medida que cuenta es la de páginas renderizadas, que se repetirá en F11 sobre landing y, con sesión, sobre el panel.

## Deuda medida en el código

| Señal | Antes | Meta en F11 |
|---|---|---|
| Raya larga "—" en TSX | 91 en 39 archivos | 0 |
| Archivos que importan `lucide-react` | 77 | 0 |
| `font-mono` | 96 | solo códigos con `data-code` |
| `border-line` (paneles con borde) | 110 | la mitad o menos |
| `rounded-full` | 80 | solo marcadores de gráfico |
| `GlassCard` (usos) | 33 archivos | 0 |
| `transition-all` | 4 activos | 0 |
| `window.confirm/alert/prompt` | 3 | 0 |
| Hex escritos a mano en TSX | 11 | 0 en componentes |
| Archivos con Framer Motion | 27 | los que tengan motivo |
| Archivos con `recharts` | 5 | solo donde la forma lo pida |
| Archivos TSX | 138 | |

`metadata.title` en `app/layout.tsx`: "LSMFit — Conecta tu gimnasio. Potencia tu negocio." (raya y verbo vacío).

## Tipografía candidata verificada

Archivo desde Google Fonts, medido en el navegador a 40 px:

| Prueba | Resultado |
|---|---|
| "1111" y "0000" con `tabular-nums` | 90,89 px y 90,89 px: cifras tabulares reales |
| Los mismos con `proportional-nums` | 83,38 px y 91,69 px: cifras proporcionales reales |
| "0000" a `font-stretch` 66 % y 125 % | 65,28 px y 118,41 px: el eje de ancho responde |

No hace falta el plan B (Mona Sans). `next/font` admite `axes: ['wdth']` en esta versión (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`). Base UI 1.4.1 trae `autocomplete`, `drawer` y `meter`.

## Movimiento (vara de emil-design-eng)

| # | Severidad | Categoría | Dónde | Hallazgo | Arreglo en Marcador |
|---|---|---|---|---|---|
| 1 | Alta | Propósito y frecuencia | 17 pantallas con `initial="hidden"` en la raíz (Socios, Caja, Check-ins, Clases, Ficha, Reportes, Ajustes...) | Coreografía de entrada en pantallas que se abren decenas de veces al día: cada visita espera a que el contenido aparezca | Sin entrada en navegación frecuente; solo el primer contenido asíncrono de la sesión |
| 2 | Alta | Accesibilidad | 0 archivos con `useReducedMotion` | La regla global de `globals.css` apaga transiciones CSS pero no las de Framer, que corren en JS: con movimiento reducido las entradas se siguen desplazando | `useReducedMotion` en cada componente con Framer o migrar a CSS |
| 3 | Media | Rendimiento | `ClassesClient.tsx:488`, `ExerciseFigure.tsx:109`, `AppearanceSection.tsx:67`, `PlanSection.tsx:88` | `transition-all`, uno con `ease-in-out` en una imagen | Propiedades explícitas; `check-motion.mjs` en CI |
| 4 | Media | Fisicalidad | `ui/weekday-picker.tsx:31` | `whileTap={{ scale: 0.9 }}`: presión exagerada | `scale(0.97)`, 120 ms |
| 5 | Media | Propósito y frecuencia | `reports/ReportsClient.tsx:89` | Indicador de pestaña con `layoutId`, se usa decenas de veces por sesión | Subrayado sin viaje o transición de 150 ms en CSS |
| 6 | Baja | Cohesión | `TrainerClient.tsx:63`, `PlansClient.tsx:117`, `reports/shared.tsx:19` | Tres stagger distintos (40, 80 y 60 ms) sin token | Un solo valor de 30 ms y máximo 6 ítems |
| 7 | Baja | Estados | 40 `animate-spin` en contenido (Ficha, Caja, Reportes, Ajustes) | Spinner donde el esqueleto con la forma final comunica mejor | Esqueletos con la geometría final; spinner solo dentro de botones |

Lo que ya está bien y se conserva: tokens `--ease-out`, `--ease-in-out` y `--duration-*` con las curvas de Emil; el botón ya no usa `transition-all`; el diálogo nunca entra desde `scale(0)`.

**Oportunidades perdidas** (entran como trabajo nuevo en el plan):
- Una entrada nueva en recepción teletransporta la lista: sin marca que caiga en la línea del día ni cifra que cambie.
- Anular un pago o cancelar una membresía confirma con un diálogo; manteniendo presionado es más deliberado y más rápido.
- Pasar de la fila del socio a su ficha es un corte seco; una transición de vista con la foto y el nombre explica el recorrido.

## Diagnóstico visual (resumen)

El detalle está en la sección "Diagnóstico" del plan. Tiza se lee como plantilla por: franja de 4 cifras iguales, paneles con borde idénticos, dinero en monoespaciada, Geist + tiza + un acento apagado, rayas largas en el copy, Lucide e icono en cada pestaña, pills con punto, avatares de inicial gris, "Buenos días" como título, gráficos de Recharts por defecto y jerga de ML para el dueño.
