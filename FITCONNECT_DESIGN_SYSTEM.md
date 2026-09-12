# FitConnect Design System

Design register: **product** — design serves the workflow, not the other way around.
Aesthetic target: **"Energía Atleta"** — high contrast, bold display, motion with intent. Hierro (rust orange) is the brand; each module carries its own functional accent.

**Light is designed first, dark is derived.** The product has two real scenes: a receptionist at the counter at 6am under hard light and an open window (the most-used screen), and the owner reviewing the month at 11pm with the room lights off. The first one forces light.

> **Identidad de marca:** Hierro `oklch(0.700 0.200 45)`. Texto sobre el relleno: `--color-primary-contrast` (casi-negro, 6.3:1), NUNCA blanco. Los acentos por módulo salen del código de color de los discos olímpicos —un sistema real del gimnasio físico— y cada uno es el valor más vivo que aún se lee como texto a 4.5:1: `lib/module-accents.ts` + tokens `--accent-*` en `globals.css`.
>
> Ningún valor se eligió a ojo: cada token salió de un barrido sobre OKLCH y `npm run check:contrast` verifica los 60+ pares en claro y en oscuro.

---

## 1. Visual Philosophy

FitConnect is operational software for gym professionals. Every design decision answers: does this make the receptionist faster or the owner smarter?

The UI should disappear into the task. A receptionist checking in a member at 7am should not be aware of the interface — only of the result. A gym owner reviewing revenue should reach the number in one glance.

This means: predictable structure, earned density, restrained color, and zero decoration that doesn't carry meaning.

---

## 2. Design Principles

| Principle | Application |
|-----------|-------------|
| **Speed over beauty** | Receptionist workflows: 2-3 clicks max. No confirmation dialogs for low-risk actions. |
| **Information first** | Data density is a feature. Don't pad KPIs with whitespace to feel "premium." |
| **Consistent affordances** | Same button shape everywhere. Same table pattern. Same form vocabulary. Users navigate faster when the structure doesn't surprise them. |
| **Dark mode first** | Designed dark, adapted light. Not the inverse. |
| **No false UI** | If a button exists, it works. If a field exists, it saves. Hide unimplemented features entirely. |

---

## 3. Typography Scale

Font: **Plus Jakarta Sans** (display + body). Monospace: **DM Mono** (numbers, codes, values).

```
Size token     rem       px      Usage
──────────────────────────────────────────────────
text-xs        0.75rem   12px    badges, timestamps, footer labels
text-sm        0.875rem  14px    body, table cells, form labels
text-base      1rem      16px    medium emphasis body
text-lg        1.125rem  18px    section subtitles
text-xl        1.25rem   20px    page subtitles, modal titles
text-2xl       1.5rem    24px    page titles, KPI sm
text-3xl       1.875rem  30px    KPI md
text-4xl+      2.25rem+  36px+   landing only — never in admin UI
```

Weight usage:
- `font-normal` (400) — body text, table data
- `font-medium` (500) — form labels, nav items
- `font-semibold` (600) — section headings, card titles, button text
- `font-bold` (700) — KPI values, page titles, key numbers

Rules:
- DM Mono (`font-mono`) for: currency amounts, IDs, check-in counts, dates in tables
- Line length cap at 65–75ch for prose. Data columns can run wider.
- No fluid (clamp) type scaling — product UI at fixed DPI

---

## 4. Color System

Strategy: **Restrained**. Hierro carries primary actions and active states; each module adds one functional accent for identity. Color as signal, not decoration.

### Dónde viven los colores

Los valores están en `frontend/app/globals.css` y las reglas en `DESIGN.md`.
No se copian aquí: esta sección tuvo la paleta duplicada describiendo un azul
(hue 264) mientras el código ya era verde (hue 150), y nadie lo notó en meses.

Lo mínimo que hay que saber:

- El **relleno** (`bg-primary`) y la **tinta** (`text-primary-ink`)
  son tokens distintos: el de relleno da 1.9:1 como texto.
- Sobre el relleno de marca siempre `text-primary-contrast` (casi-negro), nunca blanco.
- Prohibidos los tokens de shadcn (`text-muted-foreground`, `bg-popover`,
  `text-foreground`…): este proyecto no los define y generan cero CSS.
- `npm run check:contrast` mide todos los pares en claro y oscuro, y corre en CI.

### Colores de estado

```
success   emerald-500    membresía activa, pago registrado
danger    red-500        membresía vencida, máquina dañada
warning   amber-500      por vencer, pago pendiente
info      blue-500       informativo, check-ins, datos neutros
```

Se usan por su significado, nunca como decoración. Alertas y banners:
`bg-{c}-50 dark:bg-{c}-950/20 border border-{c}-200 dark:border-{c}-800/40`
(sin `border-l-4`).

---

## 5. Spacing System

**8pt grid.** All spacing values are multiples of 4px.

```
Token     px    Usage
─────────────────────────────────────
space-1   4px   icon gap, tight label spacing
space-2   8px   icon padding, compact item gap
space-3   12px  small card gap, form row gap
space-4   16px  card padding (sm), section gap
space-5   20px  card padding (md)
space-6   24px  card padding (lg), section header gap
space-8   32px  between major sections
space-12  48px  page-level vertical rhythm
```

Never use random pixel values. If you need 14px, use 12px or 16px. Vary spacing intentionally for rhythm — same padding everywhere is monotony.

---

## 6. Border Radius System

```
Token        rem        px     Usage
─────────────────────────────────────────────────────
--radius-sm  0.375rem   6px    badges, input fields, small chips
--radius-md  0.625rem   10px   buttons
--radius-lg  0.875rem   14px   cards, panels
--radius-xl  1rem       16px   modals, dialogs, large panels
rounded-full           n/a    avatar, icon circles, pills
```

---

## 7. Shadows

```
Token                   Usage
─────────────────────────────────────────────────────────────────
--shadow-sm             subtle lift: table row hover, small chips
--shadow-card           default card elevation
--shadow-card-elevated  card hover state, focused cards
--shadow-md             dropdowns, tooltips
--shadow-lg             floating panels
--shadow-dialog         modals and sheets
```

Dark mode shadows are more pronounced (higher opacity) to compensate for reduced luminance contrast.

---

## 8. Table Standards

Tables are the core of FitConnect — members, payments, check-ins, staff. They must be fast to scan.

Structure:
```
thead: text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]
       border-b border-[var(--border-base)]
tbody tr: text-sm, border-b border-[var(--border-base)]/60
          hover:bg-[var(--bg-muted)] transition-colors
td: py-3 px-4 (comfortable density — not cramped, not padded)
```

Rules:
- Sticky header on long tables
- Row click area: full-width, cursor-pointer when clickable
- Status badges: inline, color-semantic, rounded-full pill
- Currency/numbers: DM Mono, tabular-nums, right-aligned
- Dates: DM Mono, text-muted, consistent format (DD/MM/YYYY or "Hace 3 días")
- Empty state: centered, icon + title + optional CTA — not just "No hay datos"
- Loading: skeleton rows, same height as data rows (not spinner in center)
- Actions: icon buttons appear on row hover (opacity-0 group-hover:opacity-100)

---

## 9. Form Standards

Forms must be fillable in under 60 seconds (receptionist creating a member).

```
Input height:     h-9 (36px) — consistent across all fields
Label:            text-sm font-medium text-[var(--text-muted)] mb-1
Input:            bg-[var(--bg-input)] border border-[var(--border-base)]
                  rounded-[var(--radius-sm)] px-3 text-sm
                  focus:ring-2 focus:ring-[var(--color-primary)]/20
                  focus:border-[var(--color-primary)]
Error:            text-xs text-red-600 dark:text-red-400 mt-1
Helper:           text-xs text-[var(--text-muted)] mt-1
```

Rules:
- One column on mobile, max two columns on desktop for complex forms
- Required fields: asterisk after label (*), not before
- Tab order follows visual top-to-bottom, left-to-right
- Autofocus on first field when dialog opens
- Submit on Enter in single-field forms
- Disable submit button while loading, show spinner inside button
- Never clear the form on API error — preserve user input

---

## 10. Modal Patterns

First ask: can this be inline? Modals are a last resort for tasks that need full context isolation.

Use modal for: creating a record, editing detailed data, confirming destructive actions.
Use sheet/drawer for: extended forms, detail views, quick edits on mobile.
Use inline for: simple toggles, single-field edits, confirmations that can be undone.

Structure:
```
Dialog:  rounded-[var(--radius-xl)] shadow-[var(--shadow-dialog)]
         max-w-lg (form), max-w-2xl (detail view)
Header:  title text-lg font-semibold + close button top-right
Body:    p-6, space-y-4 between fields
Footer:  flex justify-end gap-2, primary action right, cancel left
```

Rules:
- Close on Escape and backdrop click (unless unsaved changes)
- Trap focus inside modal
- Loading state: disable all inputs + show spinner on primary button
- Error state: inline error below the triggering field, not a toast

---

## 11. Empty States

Empty states teach users what to do next. Never just "No hay datos aquí."

Structure:
```
centered container, py-16
  icon (lucide, 40px, text-[var(--text-muted)])
  title: text-base font-semibold text-[var(--text-base)] mt-3
  description: text-sm text-[var(--text-muted)] mt-1 max-w-xs mx-auto text-center
  CTA (optional): primary button, mt-4
```

Examples by context:
- Members table empty: "Aún no hay miembros — [Agregar primer miembro]"
- Payments filtered empty: "Sin pagos en este período — intenta otro rango de fechas"
- Check-ins empty: "Nadie ha hecho check-in hoy todavía"

---

## 12. Loading States

Skeletons over spinners everywhere except button-level loading.

```
Skeleton class: .skeleton (defined in globals.css)
  background: shimmer gradient animated 2s linear infinite
  border-radius: 0.5rem

Page loading:    skeleton blocks matching the shape of real content
Table loading:   4-8 skeleton rows at the same height as data rows
Card loading:    skeleton at exact card height (h-28 for KPI cards)
Button loading:  spinner inside button, button disabled, same size
```

Never show a spinner in the center of a content area where skeleton rows would fit.

---

## 13. Sidebar Behavior

```
Width:         256px expanded / 64px collapsed
Animation:     spring (stiffness: 260, damping: 28) via Framer Motion
Mobile:        overlay drawer, full width, z-50
Breakpoint:    collapse at lg (1024px)

Nav item (inactive):  text-[var(--text-muted)] hover:bg-[var(--bg-muted)]
                      hover:text-[var(--text-base)]
Nav item (active):    bg-[var(--color-primary-muted)] text-[var(--color-primary)]
                      font-semibold

Icon:          20px, consistent lucide stroke-width=2
Label:         text-sm, hidden when collapsed
Section label: text-[10px] uppercase tracking-widest text-[var(--text-subtle)]
               shown only when expanded
```

---

## 14. Dashboard Layout Rules

The dashboard is operational, not decorative. Owners need 4 things at a glance: active members, revenue, alerts, and today's activity.

```
Page structure:
  Period filter pills           (top, flex-wrap gap-2)
  KPI cards grid                (2 cols mobile / 4 cols desktop, gap-4)
  Charts row                    (1 col mobile / 2 cols desktop, gap-4)
  Contextual widgets            (classes today, alerts — conditional)
```

KPI card rules:
- 4 cards max in the primary grid
- Cards with trend data get sparklines
- Cards with percentage change get delta badge
- No decorative blobs, no bottom accent bars, no glassmorphism

Chart rules:
- Recharts with CSS var tokens for colors
- Horizontal grid lines only (no vertical)
- No legend inside chart area — use header label instead
- Tooltip: bg-[var(--bg-card)] border border-[var(--border-base)] rounded-lg

Alert/widget rules:
- Conditional — only render when there's data worth alerting about
- Full-border treatment: `border border-{color}-200 dark:border-{color}-800/40 bg-{color}-50 dark:bg-{color}-950/20`
- Never use side-stripe borders (`border-l-4`) — full border or nothing

---

## 15. Card Hierarchy

Three surface levels, each with distinct elevation:

```css
.surface-0   /* page background — bg-base, no border */
.surface-1   /* standard card — bg-card + border + shadow-card */
.surface-2   /* elevated card — bg-card + border + shadow-card-elevated */
```

Rules:
- Nest at most one level: surface-1 content can have surface-0 insets, never surface-1 inside surface-1
- KPI cards: use tone-specific background (not generic surface-1) + ring-1 instead of border
- Charts/tables: surface-1 or GlassCard (which wraps surface-1)
- Hover: transition from shadow-card to shadow-card-elevated (200ms)

---

## 16. Responsive Rules

Desktop-first. Tablet must be functional (receptions use tablets).

```
Sidebar:       256px → 64px → overlay drawer (lg breakpoint)
Content area:  ml-[256px] → ml-[64px] → full-width mobile
KPI grid:      4 cols → 2 cols → 2 cols (sm breakpoint)
Tables:        horizontal scroll on mobile — never collapse columns
Charts:        1 col → 2 cols (lg breakpoint)
Forms:         1 col always on mobile, max 2 cols on desktop
Modals:        full-screen on mobile (inset-x-4 bottom-0 rounded-b-none)
```

Touch targets: minimum 44px height for interactive elements on mobile/tablet.

---

## 17. Accessibility Basics

- Focus ring: 2px solid `--color-primary`, 2px offset — via `.focus-ring` utility
- Color alone never conveys meaning — always pair with icon or text
- All icon-only buttons: `aria-label` required
- Tables: `<caption>` or `aria-label`, `scope="col"` on headers
- Dialogs: `role="dialog" aria-modal="true" aria-labelledby`
- Loading states: `aria-busy="true"` on the container
- Status badges: include text content, not just color (e.g., "Activa" not just green dot)
- Keyboard nav: tab order matches visual order; modals trap focus

---

## 18. Reusable Component Patterns

### KpiCard (`components/ui/kpi-card.tsx`)

Props: `label`, `value` (number → AnimatedNumber, string → raw), `delta`, `trend`, `caption`, `icon`, `tone`, `size`, `compact`, `sparklineData`, `trendLabel`

Tones: `primary` (la marca), las nueve claves de módulo (`dashboard`, `members`, `checkins`, `classes`, `machines`, `payments`, `plans`, `reports`, `settings`), y `success`/`warning`/`danger`/`neutral`.

`failed` es el estado que importa: cuando la fuente no respondió la tarjeta muestra «—» y «No se pudo cargar», nunca un 0 que afirmaría que no hay plata sin haberlo comprobado.

When to use: any scalar metric on a dashboard or summary panel. Pass `sparklineData` whenever historical series data is available.

### GlassCard (`components/common/GlassCard`)

Light wrapper: `surface-1` + optional className. Use for charts, grouped content, section containers.

### AnimatedNumber (`components/common/AnimatedNumber`)

Props: `value`, `prefix`, `suffix`, `decimals`, `duration`. Always uses `font-display font-bold tabular-nums`. Inherits font-size from parent.

### Alert Banners (inline pattern)

```tsx
<div className="rounded-xl border border-{color}-200 dark:border-{color}-800/40
                bg-{color}-50 dark:bg-{color}-950/20 p-4 flex items-center gap-3">
  <div className="w-9 h-9 rounded-full bg-{color}-100 dark:bg-{color}-900/40
                  flex items-center justify-center shrink-0">
    <Icon className="h-4 w-4 text-{color}-600 dark:text-{color}-400" />
  </div>
  <div className="flex-1">
    <p className="text-sm font-semibold text-{color}-800 dark:text-{color}-300">Title</p>
    <p className="text-xs text-{color}-700/80 dark:text-{color}-400/80 mt-0.5">Detail</p>
  </div>
</div>
```

### EmptyState (`components/common/EmptyState`)

Props: `icon`, `title`, `description`, optional `action`. Centers content, provides consistent empty state layout.

---

## Absolute Bans

These patterns are permanently banned. Match-and-rewrite:

| Pattern | Why | Alternative |
|---------|-----|-------------|
| `border-l-4` / `border-r-4` as accent | Side-stripe border cliché | Full border + background tint |
| `background-clip: text` gradient | Decorative, never meaningful | Solid color, weight or size for emphasis |
| Glassmorphism (`backdrop-blur` decorative) | Visual noise | Clean surface with proper shadow |
| Hero-metric template | SaaS cliché: big number + blob + bottom bar | KpiCard without decorative elements |
| shadcn tokens (`text-muted-foreground`, `bg-popover`) | Not in this project | `var(--text-muted)`, `var(--bg-card)` |
| Fixed SVG gradient IDs | Duplicates cause visual glitch | `useId()` from React |
| Emoji icons in UI | Inconsistent rendering | Lucide icons only |
| Display fonts in buttons/labels/data | Mismatched register | Plus Jakarta Sans for all UI text |
