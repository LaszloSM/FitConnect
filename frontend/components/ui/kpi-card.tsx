"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { GlassCard } from "@/components/common/GlassCard";
import type { ModuleKey } from "@/lib/module-accents";
import { cn } from "@/lib/utils";

type Tono = ModuleKey | "primary" | "success" | "warning" | "danger" | "neutral";

/** En Tiza la etiqueta es neutra; el color solo aparece cuando es una señal. */
function colorDe(tono: Tono): string {
  const semanticos: Record<string, string> = {
    primary: "var(--color-primary-ink)",
    success: "var(--signal-ok)",
    warning: "var(--signal-warn)",
    danger: "var(--signal-danger)",
  };
  return semanticos[tono] ?? "var(--text-muted)";
}

function Sparkline({ values }: { values: number[] }) {
  const w = 72;
  const h = 26;
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (w - 4), 2 + (1 - (v - lo) / span) * (h - 4)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r={3} fill="var(--color-primary)" stroke="var(--bg-card)" strokeWidth={2} />
    </svg>
  );
}

export interface KpiCardProps {
  label: string;
  /** Número: se anima. Texto: se pinta tal cual (por ejemplo un rango). */
  value: number | string;
  /** Prefijo y sufijo del número: "$ " para pesos, " socios" para unidades. */
  prefix?: string;
  suffix?: string;
  caption?: string;
  icon?: LucideIcon;
  tone?: Tono;
  /** Serie corta (por ejemplo, los últimos 7 días) para la línea junto a la cifra. */
  sparkline?: number[];
  /** Variación contra el período anterior, en porcentaje ya calculado. */
  delta?: number | null;
  /** Qué significa que suba. En morosidad, subir es malo. */
  deltaGoodWhen?: "up" | "down";
  deltaLabel?: string;
  loading?: boolean;
  /**
   * La fuente no respondió. Se muestra "—" y se dice por qué: pintar 0
   * afirmaría que no hay plata sin haberlo podido comprobar.
   */
  failed?: boolean;
  href?: string;
  /** La colocación en la rejilla la decide el padre, no la tarjeta. */
  cellClassName?: string;
}

export function KpiCard({
  label,
  value,
  prefix = "",
  suffix = "",
  caption,
  icon: Icon,
  tone = "neutral",
  sparkline,
  delta = null,
  deltaGoodWhen = "up",
  deltaLabel,
  loading = false,
  failed = false,
  href,
  cellClassName,
}: KpiCardProps) {
  const acento = colorDe(tone);

  if (loading) {
    return (
      <GlassCard className={cn("flex flex-col gap-3 p-4", cellClassName)}>
        <div className="skeleton h-3.5 w-24" />
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-3.5 w-20" />
      </GlassCard>
    );
  }

  const sube = (delta ?? 0) > 0;
  const bueno = sube === (deltaGoodWhen === "up");
  const Flecha = sube ? ArrowUpRight : ArrowDownRight;

  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline values={sparkline} />
        ) : (
          Icon && <Icon className="size-4 shrink-0" style={{ color: acento }} aria-hidden />
        )}
      </div>

      <p
        className={cn(
          "num text-[32px] leading-none",
          failed ? "text-ink-muted" : "text-ink"
        )}
      >
        {failed ? (
          "—"
        ) : typeof value === "number" ? (
          <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
        ) : (
          `${prefix}${value}${suffix}`
        )}
      </p>

      <div className="flex min-h-5 items-center gap-2">
        {failed ? (
          <span className="text-sm text-ink-muted">No se pudo cargar</span>
        ) : (
          <>
            {delta !== null && delta !== 0 && (
              <>
                <span
                  className="inline-flex h-6 items-center gap-0.5 rounded-full px-2 text-xs font-semibold tabular-nums"
                  style={{
                    color: bueno ? "var(--signal-ok)" : "var(--signal-danger)",
                    background: bueno ? "var(--signal-ok-bg)" : "var(--signal-danger-bg)",
                  }}
                >
                  <Flecha className="size-3.5" aria-hidden />
                  {Math.abs(delta).toFixed(0)} %
                </span>
                {deltaLabel && <span className="text-xs text-ink-muted">{deltaLabel}</span>}
              </>
            )}
            {caption && <span className="truncate text-sm text-ink-muted">{caption}</span>}
          </>
        )}
      </div>
    </>
  );

  if (href && !failed) {
    return (
      <GlassCard className={cn("p-0", cellClassName)}>
        <Link
          href={href}
          className="flex flex-col gap-3 rounded-[var(--radius-lg)] p-5 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {cuerpo}
        </Link>
      </GlassCard>
    );
  }

  return <GlassCard className={cn("flex flex-col gap-3 p-5", cellClassName)}>{cuerpo}</GlassCard>;
}
