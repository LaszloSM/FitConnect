'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger';
type Size = 'sm' | 'md' | 'lg';
type Trend = 'up' | 'down' | 'flat';

export type KpiCardProps = {
  /** Small label/title */
  label: string;
  /** Main metric (formatted) */
  value: string | number;
  /** Delta in %, number or string -> shown in green/red */
  delta?: number | string;
  /** Visual trend indicator */
  trend?: Trend;
  /** Sub text under value (e.g., "vs mes anterior") */
  caption?: string;
  /** Optional top-right icon */
  icon?: React.ReactNode;
  /** Visual tone — primary uses brand orange */
  tone?: Tone;
  /** Size */
  size?: Size;
  /** Compact density */
  compact?: boolean;
  className?: string;
};

/** tone -> classes (primary = orange brand color) */
const toneMap: Record<
  Tone,
  { card: string; value: string; deltaUp: string; deltaDown: string }
> = {
  default: {
    card: 'bg-[var(--bg-card)] ring-1 ring-[var(--border-base)]',
    value: 'text-[var(--text-base)]',
    deltaUp: 'text-emerald-600 dark:text-emerald-400',
    deltaDown: 'text-rose-600 dark:text-rose-400',
  },
  primary: {
    card: 'bg-orange-50/80 dark:bg-orange-950/20 ring-1 ring-orange-200/70 dark:ring-orange-800/40',
    value: 'text-orange-700 dark:text-orange-300',
    deltaUp: 'text-emerald-600 dark:text-emerald-400',
    deltaDown: 'text-rose-600 dark:text-rose-400',
  },
  success: {
    card: 'bg-emerald-50/80 dark:bg-emerald-950/20 ring-1 ring-emerald-200/60 dark:ring-emerald-800/40',
    value: 'text-emerald-700 dark:text-emerald-300',
    deltaUp: 'text-emerald-700 dark:text-emerald-300',
    deltaDown: 'text-rose-600 dark:text-rose-400',
  },
  warning: {
    card: 'bg-amber-50/80 dark:bg-amber-950/20 ring-1 ring-amber-200/60 dark:ring-amber-800/40',
    value: 'text-amber-700 dark:text-amber-300',
    deltaUp: 'text-emerald-600 dark:text-emerald-400',
    deltaDown: 'text-rose-600 dark:text-rose-400',
  },
  danger: {
    card: 'bg-rose-50/80 dark:bg-rose-950/20 ring-1 ring-rose-200/60 dark:ring-rose-800/40',
    value: 'text-rose-700 dark:text-rose-300',
    deltaUp: 'text-emerald-600 dark:text-emerald-400',
    deltaDown: 'text-rose-700 dark:text-rose-300',
  },
};

const sizeMap: Record<
  Size,
  { pad: string; label: string; value: string; caption: string; icon: string }
> = {
  sm: { pad: 'p-3', label: 'text-xs', value: 'text-xl', caption: 'text-[11px]', icon: 'h-4 w-4' },
  md: { pad: 'p-4', label: 'text-sm', value: 'text-2xl', caption: 'text-xs', icon: 'h-5 w-5' },
  lg: { pad: 'p-6', label: 'text-sm', value: 'text-3xl', caption: 'text-sm', icon: 'h-6 w-6' },
};

/** 21st Magic KPI card — dependency-light, adapted for FitConnect brand */
export function KpiCard({
  label,
  value,
  delta,
  trend = 'flat',
  caption,
  icon,
  tone = 'primary',
  size = 'md',
  compact = false,
  className,
}: KpiCardProps) {
  const t = toneMap[tone];
  const s = sizeMap[size];

  const deltaValue =
    typeof delta === 'number' ? `${delta > 0 ? '+' : ''}${delta}%` : delta;

  const isUp = trend === 'up';
  const isDown = trend === 'down';
  const DeltaIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl shadow-sm transition-shadow duration-200 hover:shadow-md',
        t.card,
        s.pad,
        !compact && 'min-h-[96px]',
        className,
      )}
    >
      {/* Decorative corner orbs */}
      <span className="pointer-events-none absolute -right-6 -top-6 inline-flex h-16 w-16 rounded-full bg-current opacity-[0.04]" />
      <span className="pointer-events-none absolute -right-2 -top-2 inline-flex h-8 w-8 rounded-full bg-current opacity-[0.04]" />

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className={cn('font-medium text-[var(--text-muted)]', s.label)}>
            {label}
          </div>
          <div className={cn('font-bold tracking-tight', t.value, s.value)}>
            {typeof value === 'number' ? value.toLocaleString('es-CO') : value}
          </div>
          {caption && (
            <div className={cn('text-[var(--text-muted)]', s.caption)}>
              {caption}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {typeof deltaValue !== 'undefined' && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-semibold',
                isUp
                  ? t.deltaUp
                  : isDown
                  ? t.deltaDown
                  : 'text-[var(--text-muted)]',
              )}
            >
              <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
              {deltaValue}
            </div>
          )}
          {icon && (
            <div className="rounded-full bg-white/30 dark:bg-white/10 p-1.5">
              {icon}
            </div>
          )}
        </div>
      </div>

      {/* Baseline accent bar */}
      <div className="mt-3 h-0.5 w-12 rounded-full bg-current opacity-30" />
    </div>
  );
}
