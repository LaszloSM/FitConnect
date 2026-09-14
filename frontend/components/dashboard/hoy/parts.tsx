import Link from "next/link";
import { cn } from "@/lib/utils";

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const AVATAR_TINTS = [
  "bg-primary-muted text-primary-ink",
  "bg-[var(--signal-ok-bg)] text-[var(--signal-ok)]",
  "bg-[var(--signal-warn-bg)] text-[var(--signal-warn)]",
  "bg-[var(--signal-info-bg)] text-[var(--signal-info)]",
];

/** Iniciales mientras no haya foto: el tono sale del nombre para que cada persona se reconozca. */
export function Avatar({ name, size = 36 }: { name: string | null | undefined; size?: number }) {
  const seed = [...(name ?? "")].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center font-bold", AVATAR_TINTS[seed % AVATAR_TINTS.length])}
      style={{ width: size, height: size, borderRadius: size * 0.33, fontSize: Math.max(11, Math.round(size * 0.34)) }}
    >
      {initials(name)}
    </span>
  );
}

export function CardHead({
  title,
  count,
  href,
  link,
  aside,
}: {
  title: React.ReactNode;
  count?: number;
  href?: string;
  link?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        {title}
        {count !== undefined && <span className="num text-sm text-ink-muted">{count}</span>}
      </h2>
      {aside}
      {href && link && (
        <Link href={href} className="shrink-0 text-[13px] font-semibold text-primary-ink hover:underline">
          {link}
        </Link>
      )}
    </div>
  );
}

export function Sparkline({ values, width = 76, height = 30 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const pts = values.map((v, i) => [3 + (i / (values.length - 1)) * (width - 6), 3 + (1 - (v - lo) / span) * (height - 6)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible" aria-hidden="true">
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r={3.5} fill="var(--color-primary)" stroke="var(--bg-card)" strokeWidth={2} />
    </svg>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Partes de un total en una barra; los segmentos vacíos no ocupan lugar. */
export function SegmentBar({ parts, height = 8 }: { parts: Segment[]; height?: number }) {
  const shown = parts.filter((p) => p.value > 0);
  if (shown.length === 0) return <div className="rounded-full bg-muted" style={{ height }} />;
  return (
    <div className="flex gap-[3px]" style={{ height }}>
      {shown.map((p) => (
        <div key={p.key} className="rounded-[4px]" style={{ flex: p.value, background: p.color }} title={p.label} />
      ))}
    </div>
  );
}

/** Bullet graph del mes: lo cobrado contra la proyección, su rango y el promedio. */
export function BulletGauge({
  value,
  projection,
  low,
  high,
  reference,
  referenceLabel,
  formatShort,
}: {
  value: number;
  projection: number;
  low: number;
  high: number;
  reference: number | null;
  referenceLabel: string;
  formatShort: (n: number) => string;
}) {
  if (Math.max(high, reference ?? 0, projection, value) <= 0) return null;
  const max = Math.max(high, reference ?? 0, projection, value) * 1.06;
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <div className="relative mt-3 h-[66px]" role="img" aria-label={`Cobrado ${formatShort(value)}, proyección ${formatShort(projection)}`}>
      <span
        className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-ink"
        style={{ left: pct(projection) }}
      >
        Proyección {formatShort(projection)}
      </span>
      <div className="absolute inset-x-0 top-6 h-3.5 rounded-full bg-muted" />
      <div
        className="absolute top-6 h-3.5 rounded-[4px] bg-primary-muted"
        style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }}
      />
      <div className="absolute left-0 top-6 h-3.5 rounded-full bg-primary" style={{ width: pct(value) }} />
      <div className="absolute top-[18px] h-[26px] w-0.5 -translate-x-1/2 rounded bg-ink" style={{ left: pct(projection) }} />
      {reference !== null && (
        <div className="absolute top-[18px] h-[26px] w-0.5 -translate-x-1/2 rounded bg-ink-subtle" style={{ left: pct(reference) }} />
      )}
      <span className="absolute left-0 top-12 text-xs text-ink-muted">$0</span>
      {reference !== null && (
        <span
          className="absolute top-12 -translate-x-full whitespace-nowrap pr-1.5 text-xs text-ink-muted"
          style={{ left: pct(reference) }}
        >
          {referenceLabel} {formatShort(reference)}
        </span>
      )}
    </div>
  );
}

export function Pill({ value, goodWhenUp = true }: { value: number; goodWhenUp?: boolean }) {
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span
      className="inline-flex h-6 items-center gap-0.5 rounded-full px-2 text-xs font-semibold tabular-nums"
      style={{
        color: good ? "var(--signal-ok)" : "var(--signal-danger)",
        background: good ? "var(--signal-ok-bg)" : "var(--signal-danger-bg)",
      }}
    >
      {up ? "↑" : "↓"} {Math.abs(value)} %
    </span>
  );
}
