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
        {Icon && <Icon className="size-4 shrink-0" style={{ color: acento }} aria-hidden />}
      </div>

      <p
        className={cn(
          "font-mono text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
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
              <span
                className="inline-flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums"
                style={{ color: bueno ? "var(--signal-ok)" : "var(--signal-danger)" }}
              >
                <Flecha className="size-3.5" aria-hidden />
                {Math.abs(delta).toFixed(0)}%
                {deltaLabel && <span className="ml-0.5 font-sans font-normal text-ink-muted">{deltaLabel}</span>}
              </span>
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
          className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] p-4 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {cuerpo}
        </Link>
      </GlassCard>
    );
  }

  return <GlassCard className={cn("flex flex-col gap-2.5 p-4", cellClassName)}>{cuerpo}</GlassCard>;
}
