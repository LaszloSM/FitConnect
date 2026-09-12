"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { GlassCard } from "@/components/common/GlassCard";
import type { ModuleKey } from "@/lib/module-accents";
import { MODULE_ACCENTS } from "@/lib/module-accents";
import { cn } from "@/lib/utils";

type Tono = ModuleKey | "primary" | "success" | "warning" | "danger" | "neutral";

/** El color del acento: los módulos toman el suyo; el resto, el semántico. */
function colorDe(tono: Tono): string {
  if (tono in MODULE_ACCENTS) return `var(${MODULE_ACCENTS[tono as ModuleKey].cssVar})`;
  const semanticos: Record<string, string> = {
    primary: "var(--color-primary-ink)",
    success: "var(--accent-payments)",
    warning: "var(--accent-machines)",
    danger: "var(--accent-dashboard)",
    neutral: "var(--text-muted)",
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
      <GlassCard className={cn("p-4 flex flex-col gap-2.5", cellClassName)}>
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-8 w-32 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </GlassCard>
    );
  }

  const sube = (delta ?? 0) > 0;
  const bueno = sube === (deltaGoodWhen === "up");
  const Flecha = sube ? ArrowUpRight : ArrowDownRight;

  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.07em]"
          style={{ color: acento }}
        >
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: acento }} aria-hidden />}
      </div>

      <p
        className={cn(
          "font-display text-2xl font-bold tabular-nums leading-none",
          failed ? "text-[var(--text-muted)]" : "text-[var(--text-base)]"
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

      <div className="flex items-center gap-2 min-h-[18px]">
        {failed ? (
          <span className="text-xs text-[var(--text-muted)]">No se pudo cargar</span>
        ) : (
          <>
            {delta !== null && delta !== 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-semibold",
                  bueno
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                <Flecha className="h-3 w-3" aria-hidden />
                {Math.abs(delta).toFixed(0)}%
                {deltaLabel && <span className="font-normal text-[var(--text-muted)] ml-0.5">{deltaLabel}</span>}
              </span>
            )}
            {caption && <span className="text-xs text-[var(--text-muted)] truncate">{caption}</span>}
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
          className="flex flex-col gap-2 p-4 rounded-xl transition-colors hover:bg-[var(--bg-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2"
        >
          {cuerpo}
        </Link>
      </GlassCard>
    );
  }

  return <GlassCard className={cn("p-4 flex flex-col gap-2", cellClassName)}>{cuerpo}</GlassCard>;
}
