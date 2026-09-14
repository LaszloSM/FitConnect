"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatCOP, formatCOPCompact } from "@/lib/format";
import type { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";
import { BulletGauge, CardHead, SegmentBar, Sparkline } from "./parts";

const METHODS = [
  { key: "cash", label: "Efectivo", color: "var(--data-1)" },
  { key: "card", label: "Tarjeta", color: "var(--data-2)" },
  { key: "transfer", label: "Transferencia", color: "var(--data-3)" },
  { key: "wompi", label: "Wompi", color: "var(--signal-info)" },
];

function Missing() {
  return (
    <>
      <p className="num mt-2 text-[28px] leading-none text-ink-muted">—</p>
      <p className="mt-1.5 text-[12.5px] text-[var(--signal-warn)]">No se pudo cargar</p>
    </>
  );
}

function Column({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col py-4 first:pt-0 md:px-6 md:py-0 md:first:pl-0 xl:border-l xl:border-line xl:first:border-l-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function MoneyStrip({
  data,
  canMoney,
  canReports,
}: {
  data: DashboardData;
  canMoney: boolean;
  canReports: boolean;
}) {
  const { cash, pendingTransfers, receivables, forecast, revenueDaily, failed } = data;
  const pendingTotal = pendingTransfers.reduce((a, p) => a + Number(p.amount), 0);
  const receivableTotal = receivables.reduce((a, r) => a + Number(r.amount_due), 0);
  const aging = [
    { key: "a", label: "0 a 7 días", value: 0, color: "var(--signal-ok)" },
    { key: "b", label: "8 a 30 días", value: 0, color: "var(--signal-warn)" },
    { key: "c", label: "Más de 30 días", value: 0, color: "var(--signal-danger)" },
  ];
  for (const r of receivables) {
    const bucket = r.days_overdue > 30 ? 2 : r.days_overdue > 7 ? 1 : 0;
    aging[bucket].value += Number(r.amount_due);
  }
  const previousDays = revenueDaily.slice(0, -1).map((d) => d.amount);
  const weekAverage = previousDays.length ? previousDays.reduce((a, b) => a + b, 0) / previousDays.length : null;

  const columns: React.ReactNode[] = [];

  if (canMoney) {
    columns.push(
      <Column
        key="cobrado"
        label="Cobrado hoy"
        aside={revenueDaily.length > 2 && !failed.has("revenueDaily") ? <Sparkline values={revenueDaily.map((d) => d.amount)} /> : undefined}
      >
        {failed.has("cash") || !cash ? (
          <Missing />
        ) : (
          <>
            <p className="num mt-2 text-[34px] leading-none text-ink">{formatCOP(cash.total)}</p>
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
              {cash.count} {cash.count === 1 ? "cobro" : "cobros"}
              {weekAverage !== null && weekAverage > 0 && `. Promedio diario de la semana: ${formatCOP(Math.round(weekAverage))}`}
            </p>
            <div className="mt-4">
              <SegmentBar parts={METHODS.map((m) => ({ ...m, value: Number(cash.by_method?.[m.key] ?? 0) }))} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
              {METHODS.filter((m) => Number(cash.by_method?.[m.key] ?? 0) > 0).map((m) => (
                <span key={m.key} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[3px]" style={{ background: m.color }} />
                  <span className="text-ink-muted">{m.label}</span>
                  <span className="num text-ink">{formatCOP(Number(cash.by_method[m.key]))}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </Column>
    );
  }

  columns.push(
    <Column key="confirmar" label="Por confirmar">
      {failed.has("pendingTransfers") ? (
        <Missing />
      ) : (
        <>
          <p className="num mt-2 text-[28px] leading-none text-ink">{formatCOP(pendingTotal)}</p>
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            {pendingTransfers.length === 0
              ? "Ninguna transferencia pendiente"
              : `${pendingTransfers.length} ${pendingTransfers.length === 1 ? "transferencia" : "transferencias"} por revisar`}
          </p>
          {pendingTransfers.length > 0 && (
            <Link
              href="/payments?tab=receivables"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-auto self-start pt-0")}
            >
              Confirmar
            </Link>
          )}
        </>
      )}
    </Column>
  );

  if (canMoney) {
    columns.push(
      <Column key="cobrar" label="Por cobrar">
        {failed.has("receivables") ? (
          <Missing />
        ) : (
          <>
            <p className="num mt-2 text-[28px] leading-none text-ink">{formatCOP(receivableTotal)}</p>
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
              {receivables.length} {receivables.length === 1 ? "socio" : "socios"} con saldo
            </p>
            {receivableTotal > 0 && (
              <>
                <div className="mt-4">
                  <SegmentBar parts={aging} />
                </div>
                {aging[2].value > 0 && (
                  <p className="mt-2.5 text-[12.5px] font-semibold text-[var(--signal-danger)]">
                    {formatCOP(aging[2].value)} llevan más de 30 días
                  </p>
                )}
              </>
            )}
          </>
        )}
      </Column>
    );
  }

  if (canReports) {
    columns.push(
      <Column
        key="cierre"
        label="Cierre del mes"
        aside={forecast ? <span className="text-xs text-ink-muted">Día {forecast.elapsed_days} de {forecast.days_in_month}</span> : undefined}
      >
        {failed.has("forecast") || !forecast ? (
          <Missing />
        ) : (
          <>
            <p className="num mt-2 text-[28px] leading-none text-ink">{formatCOP(forecast.month_to_date)}</p>
            <BulletGauge
              value={forecast.month_to_date}
              projection={forecast.projection}
              low={forecast.projection_low}
              high={forecast.projection_high}
              reference={forecast.avg_previous_months}
              referenceLabel="Promedio"
              formatShort={formatCOPCompact}
            />
            <p className="text-[12.5px] text-ink-muted">
              {forecast.month_to_date <= 0 && forecast.projection <= 0
                ? "Todavía no hay cobros este mes. "
                : ""}
              {forecast.vs_previous_pct === null
                ? "Aún no hay meses anteriores para comparar."
                : `Al ritmo de hoy, ${Math.abs(Math.round(forecast.vs_previous_pct))} % ${forecast.vs_previous_pct < 0 ? "bajo" : "sobre"} tus últimos tres meses.`}
              {forecast.method === "reglas" && " Estimado con reglas."}
            </p>
          </>
        )}
      </Column>
    );
  }

  return (
    <section className="card p-5 md:p-6">
      <CardHead title="Plata" href={canMoney ? "/payments/cash" : undefined} link={canMoney ? "Ir a caja" : undefined} />
      <div
        className={cn(
          "mt-4 grid divide-y divide-line/60 md:divide-y-0",
          columns.length >= 3 ? "md:grid-cols-2 md:gap-y-6 xl:grid-cols-[1.2fr_0.85fr_1fr_1.25fr] xl:gap-y-0" : "md:grid-cols-2"
        )}
      >
        {columns}
      </div>
    </section>
  );
}
