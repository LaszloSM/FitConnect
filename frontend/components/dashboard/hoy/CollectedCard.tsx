"use client";

import Link from "next/link";
import { CashRegisterIcon, PlusIcon } from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import { RollingNumber } from "@/components/motion/RollingNumber";
import { formatCOP, formatCOPCompact } from "@/lib/format";
import type { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";
import { BulletGauge } from "./parts";

export type Period = "hoy" | "mes";

const METHODS = [
  { key: "cash", label: "Efectivo" },
  { key: "card", label: "Tarjeta" },
  { key: "transfer", label: "Transferencia" },
] as const;

/**
 * La tarjeta protagonista del Hoy: lo cobrado en el período elegido, la acción
 * de cobrar a un clic y cómo pagaron. Sin permiso de caja (recepción) muestra
 * solo las acciones: el monto del día no es suyo de ver.
 */
export function CollectedCard({ data, period, canMoney, canReports, monthName }: {
  data: DashboardData;
  period: Period;
  canMoney: boolean;
  canReports: boolean;
  monthName: string;
}) {
  const totals = period === "hoy" ? data.cash : data.cashMonth;
  const failed = data.failed.has("cash");
  const previousDays = data.revenueDaily.slice(0, -1).map((d) => d.amount);
  const weekAverage = previousDays.length ? previousDays.reduce((a, b) => a + b, 0) / previousDays.length : null;
  const { forecast } = data;

  const actions = (
    <div className="grid grid-cols-2 gap-2">
      <Link href="/payments?tab=pos" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
        <CashRegisterIcon weight="bold" /> Cobrar
      </Link>
      <Link href="/members" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
        <PlusIcon weight="bold" /> Nuevo socio
      </Link>
    </div>
  );

  if (!canMoney) {
    return (
      <section className="card flex flex-col gap-5 p-5 md:p-6">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Recepción</h2>
          <p className="mt-1 text-sm text-ink-muted">Cobra una renovación, un pase o un producto, o registra a alguien nuevo.</p>
        </div>
        {actions}
      </section>
    );
  }

  return (
    <section className="card flex flex-col p-5 md:p-6" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">{period === "hoy" ? "Cobrado hoy" : `Cobrado en ${monthName}`}</h2>
        {totals && <span className="text-[12.5px] text-ink-muted">{totals.count} {totals.count === 1 ? "cobro" : "cobros"}</span>}
      </div>

      {failed || !totals ? (
        <>
          <p className="num mt-3 text-[40px] leading-none text-ink-muted">—</p>
          <p className="mt-2 text-[12.5px] text-[var(--signal-warn)]">No se pudo cargar</p>
        </>
      ) : (
        <>
          <RollingNumber value={formatCOP(totals.total)} className="num mt-3 text-[40px] leading-none tracking-[-0.025em] text-ink" />
          <p className="mt-2 min-h-[1.25rem] text-[13px] text-ink-muted">
            {period === "hoy"
              ? weekAverage !== null && weekAverage > 0
                ? `Promedio diario de la semana: ${formatCOP(Math.round(weekAverage))}`
                : "Todavía no hay días anteriores para comparar."
              : forecast && canReports && !data.failed.has("forecast")
                ? `A este ritmo, el mes cierra en ${formatCOPCompact(forecast.projection)}.`
                : ""}
          </p>
        </>
      )}

      <div className="mt-5">{actions}</div>

      {totals && !failed && (
        <div className="mt-5 grid grid-cols-3 border-t border-line-soft pt-4">
          {METHODS.map((m, i) => {
            const v = Number(totals.by_method?.[m.key] ?? 0);
            return (
              <div key={m.key} className={cn("min-w-0 pr-2", i > 0 && "border-l border-line-soft pl-3")}>
                <p className="truncate text-[12.5px] text-ink-muted">{m.label}</p>
                <RollingNumber value={formatCOP(v)} className="num mt-0.5 text-[15px] text-ink" />
              </div>
            );
          })}
        </div>
      )}

      {period === "mes" && canReports && forecast && !data.failed.has("forecast") && (
        <div className="-mb-2 mt-1">
          <BulletGauge
            value={forecast.month_to_date}
            projection={forecast.projection}
            low={forecast.projection_low}
            high={forecast.projection_high}
            reference={forecast.avg_previous_months}
            referenceLabel="Promedio"
            formatShort={formatCOPCompact}
          />
        </div>
      )}
    </section>
  );
}
