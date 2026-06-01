# FitConnect — Design System

## Colors

Strategy: **Restrained** with committed Volt accent on primary actions and active states.

### CSS Variables (already defined in globals.css)
- `--bg-base`: oklch(0.98 0.003 264) / dark: oklch(0.12 0.010 264)
- `--bg-card`: oklch(1.00 0.00 0) / dark: oklch(0.16 0.008 264)
- `--bg-sidebar`: oklch(1.00 0.00 0) / dark: oklch(0.14 0.009 264)
- `--bg-input`: oklch(1.00 0.00 0) / dark: oklch(0.18 0.008 264)
- `--bg-muted`: oklch(0.96 0.003 264) / dark: oklch(0.19 0.007 264)
- `--border-base`: oklch(0.90 0.005 264) / dark: oklch(0.25 0.008 264)
- `--text-base`: oklch(0.20 0.015 264) / dark: oklch(0.95 0.005 264)
- `--text-muted`: oklch(0.50 0.010 264) / dark: oklch(0.65 0.008 264)
- `--color-primary`: oklch(0.78 0.19 128) — Volt brand accent
- `--color-primary-hover`: oklch(0.72 0.20 128)
- `--color-primary-muted`: oklch(0.96 0.05 128) / dark: oklch(0.20 0.05 47)

### Tailwind semantic colors (tailwind.config.ts)
- `primary`, `primary-hover`, `primary-light`, `primary-dark`
- `success` #22C55E, `danger` #EF4444, `warning` #F59E0B, `info` #3B82F6
- `bg-base`, `bg-card`, `bg-sidebar`, `border-base`, `text-base`, `text-muted`, `text-subtle`

## Typography
- **Font:** Plus Jakarta Sans (display + body), DM Mono (code/numbers)
- **Scale:** sm(12)/base(14)/md(16)/lg(18)/xl(20)/2xl(24)/3xl(30)
- **Weights:** 400 (body), 500 (labels), 600 (headings), 700 (display KPIs)

## Spacing
8pt grid. Common values: 4/8/12/16/24/32/48px.

## Shadows
- `--shadow-sm`: subtle lift
- `--shadow-card` / `--shadow-card-elevated`: card surfaces
- `--shadow-dialog`: modal/dialog panels
- `--shadow-md/lg`: intermediate elevation

## Border Radius
- `--radius-sm`: 0.375rem (6px) — badges, inputs
- `--radius-md`: 0.625rem (10px) — buttons
- `--radius-lg`: 0.875rem (14px) — cards
- `--radius-xl`: 1rem (16px) — dialogs, panels

## Transitions
- `--transition-fast`: 150ms expo
- `--transition-base`: 250ms expo
- `--transition-slow`: 350ms expo

## Components

### Surfaces
- `.surface-0`: page background
- `.surface-1`: cards (border + shadow-card)
- `.surface-2`: elevated cards (shadow-card-elevated)

### Forms
- Input height: h-9 (36px)
- All inputs use CSS vars (not Tailwind hardcoded colors)
- Focus ring: `--color-primary` with /20 ring

### Animations
- Page entrance: `animate-fade-in-up` (35ms, expo)
- List stagger: delay 0.05s per item
- Sidebar nav: `slide-in-left`

## Layout
- Sidebar: fixed left, 240px width on desktop
- Header: sticky top, 56px height
- Content: ml-[240px] on desktop, full-width mobile with hamburger
