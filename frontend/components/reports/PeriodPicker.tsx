"use client";

import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, startOfQuarter, endOfQuarter } from "date-fns";
import { cn } from "@/lib/utils";

export interface Period {
  from: string;
  to: string;
  key: PeriodKey;
}

export type PeriodKey = "today" | "week" | "month" | "last_month" | "quarter" | "custom";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export function periodFor(key: Exclude<PeriodKey, "custom">): Period {
  const now = new Date();
  switch (key) {
    case "today":
      return { key, from: fmt(now), to: fmt(now) };
    case "week":
      return { key, from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: fmt(endOfWeek(now, { weekStartsOn: 1 })) };
    case "month":
      return { key, from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { key, from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)) };
    }
    case "quarter":
      return { key, from: fmt(startOfQuarter(now)), to: fmt(endOfQuarter(now)) };
  }
}

const PRESETS: { key: Exclude<PeriodKey, "custom">; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Este mes" },
  { key: "last_month", label: "Mes pasado" },
  { key: "quarter", label: "Trimestre" },
];

const inputCls =
  "h-8 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-2 text-xs text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--brand)]/30";

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Período">
      <div className="flex gap-1 rounded-xl border border-[var(--border-base)] bg-[var(--bg-card)] p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(periodFor(p.key))}
            aria-pressed={value.key === p.key}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              value.key === p.key
                ? "bg-primary text-primary-contrast"
                : "text-[var(--text-muted)] hover:text-[var(--text-base)]"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ key: "custom", from: e.target.value, to: value.to })} className={inputCls} />
        <span className="text-xs text-[var(--text-muted)]">a</span>
        <input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ key: "custom", from: value.from, to: e.target.value })} className={inputCls} />
      </div>
    </div>
  );
}
