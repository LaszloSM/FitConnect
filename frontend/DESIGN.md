# FitConnect — Design System

## Visual Style
Athletic Premium — geometric structure, bold typography, committed orange identity, purposeful animations via Framer Motion.

## Color Strategy
Committed (30-60% orange surface weight on primary surfaces). Orange is THE identity, not a 10% accent.

## Color Palette

### Brand
- Primary: `oklch(0.70 0.20 47)` (#F97316) — main orange
- Primary Hover: `oklch(0.63 0.21 47)` (#EA580C)
- Primary Light: `oklch(0.97 0.02 47)` (#FFF7ED) — tinted backgrounds
- Primary Dark: `oklch(0.58 0.22 47)` — pressed states

### Status
- Success: #22C55E (green)
- Danger: #EF4444 (red)
- Warning: #F59E0B (amber)
- Info: #3B82F6 (blue)

### Semantic (CSS vars — light/dark auto-switch)
- `--bg-base`: page background
- `--bg-card`: card/panel background
- `--bg-sidebar`: sidebar background
- `--border-base`: all borders
- `--text-base`: primary text
- `--text-muted`: secondary text
- `--text-subtle`: tertiary text/placeholders

## Typography

### Fonts
- Display + Body: **Plus Jakarta Sans** (400, 500, 600, 700) — all UI text
- Mono: **DM Mono** (400, 500) — numbers, KPIs, code, tabular data

### Scale
- xs: 12px | sm: 14px | base: 16px | lg: 18px | xl: 20px | 2xl: 24px | 3xl: 30px | 4xl: 36px

### Hierarchy Rules
- Page titles: `text-2xl font-bold font-display text-[var(--text-base)]`
- Section headers: `text-lg font-semibold font-display`
- Body: `text-sm text-[var(--text-muted)]`
- KPI values: `font-mono text-3xl font-semibold`

## Spacing
8pt grid system. Use multiples of 4/8/12/16/24/32/48px.

## Shadows & Elevation
```
surface-0: no shadow (page background)
surface-1: var(--shadow-card) — cards, panels
surface-2: var(--shadow-card-elevated) — elevated cards, dropdowns
glow: 0 0 20px oklch(0.70 0.20 47 / 0.25) — orange elements
```

## Animations (Framer Motion)
- Spring: `{ type: "spring", stiffness: 300, damping: 30 }` — component entrances
- Stagger: `{ staggerChildren: 0.05 }` — lists and grids
- Ease: `[0.16, 1, 0.3, 1]` (expo-out) — page transitions
- Micro duration: 150ms | Base: 250ms | Page: 350ms
- Exit animations: 70% of enter duration
- Always wrap page content in `<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`

## Components

### Buttons
- Primary: orange fill, white text, hover scale(1.01)
- Ghost: transparent, orange text/border on hover
- Destructive: red, visually separated from primary actions
- Loading: spinner replaces icon while async

### Cards
- Use `surface-1` class (not raw Tailwind card classes)
- No nested cards
- Rounded-xl (12px radius)

### Navigation
- Sidebar: 256px wide, fixed, orange filled pill for active item
- Active state: full orange background + white text (NOT subtle bg-orange-50)
- User footer at bottom of sidebar

### Forms
- Labels always visible (never placeholder-only)
- Error messages below the field
- React Hook Form + Zod validation
- Loading state on submit

## Dark Mode
- Implemented via next-themes with `attribute="class"`
- `.dark` class on `<html>` triggers CSS var overrides
- Never hardcode light-mode colors in components — always use CSS vars or Tailwind's `dark:` prefix

## Absolute Bans
- No gradient text (`background-clip: text`)
- No glassmorphism as default
- No side-stripe borders (border-left > 1px as decorative accent)
- No identical card grids (icon + heading + text repeated)
- No emoji as icons — use lucide-react SVG icons only
