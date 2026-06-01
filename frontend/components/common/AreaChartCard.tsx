'use client';

import { useId } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { GlassCard } from '@/components/common/GlassCard';

export type AreaChartCardProps = {
  title: string;
  /** Accent color — accepts a CSS var() expression or hex. */
  color?: string;
  data: Array<Record<string, unknown>>;
  xKey: string;
  dataKey: string;
  height?: number;
  valueFormatter?: (v: number) => string;
  yTickFormatter?: (v: number) => string;
  seriesName?: string;
  /** Optional period selector rendered in the header. */
  periods?: { key: string; label: string }[];
  activePeriod?: string;
  onPeriodChange?: (key: string) => void;
  className?: string;
};

export function AreaChartCard({
  title,
  color = 'var(--color-primary)',
  data,
  xKey,
  dataKey,
  height = 200,
  valueFormatter,
  yTickFormatter,
  seriesName,
  periods,
  activePeriod,
  onPeriodChange,
  className,
}: AreaChartCardProps) {
  const gradId = useId().replace(/:/g, '');

  return (
    <GlassCard className={className ?? 'p-5'}>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2 w-2 rounded-full inline-block shrink-0"
            style={{ background: color }}
          />
          <h3 className="text-sm font-semibold text-[var(--text-base)] truncate">{title}</h3>
        </div>
        {periods && periods.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            {periods.map((p) => {
              const active = p.key === activePeriod;
              return (
                <button
                  key={p.key}
                  onClick={() => onPeriodChange?.(p.key)}
                  aria-pressed={active}
                  className={
                    active
                      ? 'rounded-md px-2 py-1 text-[11px] font-semibold bg-[var(--bg-muted)] text-[var(--text-base)] transition-colors'
                      : 'rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors'
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={yTickFormatter}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-base)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--text-base)' }}
            itemStyle={{ color }}
            formatter={(value) =>
              [valueFormatter ? valueFormatter(Number(value) || 0) : value, seriesName ?? title] as [string, string]
            }
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            name={seriesName ?? title}
          />
        </AreaChart>
      </ResponsiveContainer>
    </GlassCard>
  );
}
