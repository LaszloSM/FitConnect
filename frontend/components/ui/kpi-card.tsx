'use client';

import { useId } from 'react';
import * as React from 'react';
import { motion, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AnimatedNumber } from '@/components/common/AnimatedNumber';

type Tone =
  | 'default'
  | 'primary'
  | 'volt'
  | 'teal'
  | 'sky'
  | 'violet'
  | 'amber'
  | 'emerald'
  | 'fuchsia'
  | 'indigo'
  | 'slate'
  | 'success'
  | 'warning'
  | 'danger';
type Size = 'sm' | 'md' | 'lg';
type Trend = 'up' | 'down' | 'flat';

export type KpiCardProps = {
  label: string;
  value: string | number;
  delta?: number | string;
  trend?: Trend;
  caption?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  size?: Size;
  /** Flagship card: solid accent fill, near-black text. Use once per grid. */
  flagship?: boolean;
  compact?: boolean;
  sparklineData?: number[];
  className?: string;
};

type ToneStyle = {
  card: string;
  value: string;
  chip: string;
  spark: string;
};

const DELTA_UP = 'text-emerald-600 dark:text-emerald-400';
const DELTA_DOWN = 'text-rose-600 dark:text-rose-400';

// Calm cards: neutral surface + colored icon chip + colored sparkline.
const toneStyles: Record<Tone, ToneStyle> = {
  default: { card: '', value: 'text-[var(--text-base)]', chip: 'bg-[var(--bg-muted)] text-[var(--text-muted)]', spark: 'oklch(0.55 0.010 150)' },
  primary: { card: '', value: 'text-[var(--text-base)]', chip: 'bg-[var(--color-primary-muted)] text-[var(--color-primary-ink)]', spark: 'oklch(0.78 0.19 128)' },
  volt:    { card: '', value: 'text-[var(--text-base)]', chip: 'bg-[var(--color-primary-muted)] text-[var(--color-primary-ink)]', spark: 'oklch(0.78 0.19 128)' },
  teal:    { card: '', value: 'text-[var(--text-base)]', chip: 'bg-teal-500/15 text-teal-600 dark:text-teal-400', spark: '#14b8a6' },
  sky:     { card: '', value: 'text-[var(--text-base)]', chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', spark: '#0ea5e9' },
  violet:  { card: '', value: 'text-[var(--text-base)]', chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', spark: '#8b5cf6' },
  amber:   { card: '', value: 'text-[var(--text-base)]', chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', spark: '#f59e0b' },
  emerald: { card: '', value: 'text-[var(--text-base)]', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', spark: '#10b981' },
  fuchsia: { card: '', value: 'text-[var(--text-base)]', chip: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400', spark: '#d946ef' },
  indigo:  { card: '', value: 'text-[var(--text-base)]', chip: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400', spark: '#6366f1' },
  slate:   { card: '', value: 'text-[var(--text-base)]', chip: 'bg-slate-500/15 text-slate-600 dark:text-slate-400', spark: '#64748b' },
  success: { card: '', value: 'text-[var(--text-base)]', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', spark: '#22C55E' },
  warning: { card: '', value: 'text-[var(--text-base)]', chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', spark: '#F59E0B' },
  danger:  { card: '', value: 'text-[var(--text-base)]', chip: 'bg-rose-500/15 text-rose-600 dark:text-rose-400', spark: '#EF4444' },
};

const sizeStyles: Record<
  Size,
  { pad: string; label: string; value: string; caption: string; iconWrap: string; icon: string }
> = {
  sm: { pad: 'p-3',  label: 'text-xs',  value: 'text-xl',  caption: 'text-[11px]', iconWrap: 'h-7 w-7',  icon: 'h-3.5 w-3.5' },
  md: { pad: 'p-4',  label: 'text-xs',  value: 'text-3xl', caption: 'text-xs',     iconWrap: 'h-8 w-8',  icon: 'h-4 w-4' },
  lg: { pad: 'p-5',  label: 'text-sm',  value: 'text-4xl', caption: 'text-sm',     iconWrap: 'h-9 w-9',  icon: 'h-[18px] w-[18px]' },
};

function Sparkline({ data, color, gradId }: { data: number[]; color: string; gradId: string }) {
  if (data.length < 2) return null;

  const W = 72;
  const H = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return [x, y] as [number, number];
  });

  const line = `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')}`;
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export function KpiCard({
  label,
  value,
  delta,
  trend = 'flat',
  caption,
  icon,
  tone = 'default',
  size = 'md',
  flagship = false,
  compact = false,
  sparklineData,
  className,
}: KpiCardProps) {
  const gradId = useId();
  const t = toneStyles[tone];
  const s = sizeStyles[size];

  const isUp = trend === 'up';
  const isDown = trend === 'down';
  const DeltaIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  const deltaStr = typeof delta === 'number' ? `${delta > 0 ? '+' : ''}${delta}%` : delta;
  const hasSpark = sparklineData && sparklineData.length >= 2;

  // Flagship: solid Volt fill, near-black ink.
  const labelColor = flagship ? 'text-[var(--color-primary-contrast)]/70' : 'text-[var(--text-muted)]';
  const valueColor = flagship ? 'text-[var(--color-primary-contrast)]' : t.value;
  const captionColor = flagship ? 'text-[var(--color-primary-contrast)]/70' : 'text-[var(--text-muted)]';
  const deltaColor = flagship
    ? 'text-[var(--color-primary-contrast)]'
    : isUp
    ? DELTA_UP
    : isDown
    ? DELTA_DOWN
    : 'text-[var(--text-muted)]';

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
      className={cn(
        'relative overflow-hidden rounded-xl transition-shadow duration-200',
        flagship
          ? 'bg-[linear-gradient(150deg,var(--color-primary),var(--color-primary-hover))] shadow-[var(--shadow-card-elevated)]'
          : 'surface-1 hover:shadow-[var(--shadow-card-elevated)]',
        !compact && 'min-h-[104px]',
        className,
      )}
    >
      <div className={cn('flex flex-col gap-2', s.pad)}>
        {/* Header: label + icon chip */}
        <div className="flex items-start justify-between gap-2">
          <p className={cn('font-semibold uppercase tracking-wide', s.label, labelColor)}>{label}</p>
          {icon && (
            <div
              className={cn(
                'rounded-lg flex items-center justify-center shrink-0',
                s.iconWrap,
                flagship ? 'bg-[var(--color-primary-contrast)]/12 text-[var(--color-primary-contrast)]' : t.chip,
              )}
            >
              <span className={s.icon}>{icon}</span>
            </div>
          )}
        </div>

        {/* Value row + delta + sparkline */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className={cn('font-extrabold tracking-tight leading-none tabular-nums', valueColor, s.value)}>
              {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
            </div>
            {caption && <p className={cn('mt-1.5', s.caption, captionColor)}>{caption}</p>}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {deltaStr !== undefined && (
              <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', deltaColor)}>
                <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
                {deltaStr}
              </span>
            )}
            {hasSpark && !flagship && (
              <div className="opacity-80">
                <Sparkline data={sparklineData} color={t.spark} gradId={gradId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
