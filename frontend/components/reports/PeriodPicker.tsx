"use client";

import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, startOfQuarter, endOfQuarter } from "date-fns";
import { SegmentedControl } from "@/components/motion/SegmentedControl";

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
  "h-9 rounded-full border border-line bg-panel px-3 text-[13px] text-ink outline-none transition-[border-color] duration-150 focus:border-ink-muted";

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  // Un rango a mano no coincide con ningún atajo: el control queda sin selección.
  const preset = PRESETS.some((p) => p.key === value.key) ? (value.key as Exclude<PeriodKey, "custom">) : ("" as Exclude<PeriodKey, "custom">);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
      <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
        <SegmentedControl
          size="sm"
          label="Período del informe"
          value={preset}
          onChange={(k) => onChange(periodFor(k))}
          options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <input type="date" aria-label="Desde" value={value.from} max={value.to} onChange={(e) => onChange({ key: "custom", from: e.target.value, to: value.to })} className={inputCls} />
        <span className="text-xs text-ink-muted">a</span>
        <input type="date" aria-label="Hasta" value={value.to} min={value.from} onChange={(e) => onChange({ key: "custom", from: value.from, to: e.target.value })} className={inputCls} />
      </div>
    </div>
  );
}
