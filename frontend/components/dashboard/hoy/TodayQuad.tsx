"use client";

import Link from "next/link";
import { RollingNumber } from "@/components/motion/RollingNumber";
import { formatCOP } from "@/lib/format";
import type { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";

function Cell({ label, value, note, href, hot, className }: {
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
  href?: string;
  hot?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span className={cn("text-[13px]", hot ? "text-primary-contrast" : "text-ink-muted")}>{label}</span>
      <span className={cn("num mt-auto pt-4 text-[26px] leading-none tracking-[-0.015em]", hot ? "text-primary-contrast" : "text-ink")}>{value}</span>
      <span className={cn("mt-1.5 text-[12.5px]", hot ? "text-primary-contrast" : "text-ink-muted")}>{note}</span>
    </>
  );
  const base = cn(
    "flex min-h-[8.5rem] min-w-0 flex-col p-4",
    hot && "rounded-[calc(var(--radius-lg)-6px)] bg-primary",
    className,
  );
  if (!href) return <div className={base}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(base, "transition-[background-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40", !hot && "rounded-[calc(var(--radius-lg)-6px)] hover:bg-raised", hot && "hover:bg-primary-hover")}
    >
      {body}
    </Link>
  );
}

/**
 * Cuatro cifras del día en una sola tarjeta separada por reglas. Solo una
 * celda va en coral: la que pide acción (lo que vence esta semana).
 */
export function TodayQuad({ data, entriesCount, typicalSoFar, canMoney }: {
  data: DashboardData;
  entriesCount: number;
  typicalSoFar: number | null;
  canMoney: boolean;
}) {
  const expiring = data.operations?.expiring_this_week ?? [];
  const priceOf = (plan: string) => data.plans.find((p) => p.name === plan)?.price;
  const priced = expiring.map((m) => priceOf(m.plan_name)).filter((p): p is number => p !== undefined);
  const expiringAmount = priced.reduce((a, b) => a + b, 0);
  const pendingTotal = data.pendingTransfers.reduce((a, p) => a + Number(p.amount), 0);
  const receivableTotal = data.receivables.reduce((a, r) => a + Number(r.amount_due), 0);

  return (
    <section className="card grid grid-cols-2 p-1.5" aria-label="Indicadores del día">
      <Cell
        hot
        href="#vencen"
        label="Vencen esta semana"
        value={data.failed.has("operations") ? "—" : priced.length ? <RollingNumber value={formatCOP(expiringAmount)} /> : expiring.length}
        note={data.failed.has("operations") ? "No se pudo cargar" : `${expiring.length} ${expiring.length === 1 ? "socio" : "socios"} por renovar`}
      />
      <Cell
        href="/checkins"
        className="border-l border-line-soft"
        label="Entradas hoy"
        value={<RollingNumber value={String(entriesCount)} />}
        note={typicalSoFar !== null ? `Un día normal lleva ${Math.round(typicalSoFar)} a esta hora` : "Sin historia para comparar"}
      />
      <Cell
        href={data.pendingTransfers.length ? "/payments?tab=receivables" : undefined}
        className="border-t border-line-soft"
        label="Por confirmar"
        value={data.failed.has("pendingTransfers") ? "—" : <RollingNumber value={formatCOP(pendingTotal)} />}
        note={
          data.failed.has("pendingTransfers")
            ? "No se pudo cargar"
            : data.pendingTransfers.length === 0
              ? "Ninguna transferencia pendiente"
              : `${data.pendingTransfers.length} ${data.pendingTransfers.length === 1 ? "transferencia" : "transferencias"}`
        }
      />
      {canMoney ? (
        <Cell
          href="/payments?tab=receivables"
          className="border-l border-t border-line-soft"
          label="Por cobrar"
          value={data.failed.has("receivables") ? "—" : <RollingNumber value={formatCOP(receivableTotal)} />}
          note={data.failed.has("receivables") ? "No se pudo cargar" : `${data.receivables.length} ${data.receivables.length === 1 ? "socio" : "socios"} con saldo`}
        />
      ) : (
        <Cell
          href="/classes/agenda"
          className="border-l border-t border-line-soft"
          label="Clases hoy"
          value={data.todayClasses.length}
          note={data.todayClasses.length ? "Ver la agenda del día" : "No hay clases programadas"}
        />
      )}
    </section>
  );
}
