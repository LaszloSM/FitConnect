"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { buttonVariants } from "@/components/ui/button";
import { formatCOP, todayInGym } from "@/lib/format";
import type { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";
import { Avatar, CardHead } from "./parts";

function when(days: number): string {
  if (days <= 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  return `vence en ${days} días`;
}

export function ExpiringWeek({ data, className }: { data: DashboardData; className?: string }) {
  const ops = data.operations;
  const failed = data.failed.has("operations") || !ops;
  const items = ops?.expiring_this_week ?? [];
  const priceOf = (planName: string) => data.plans.find((p) => p.name === planName)?.price;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = todayInGym();
    d.setDate(d.getDate() + i);
    return {
      label: i === 0 ? "Hoy" : format(d, "EEEEEE", { locale: es }).replace(/^./, (c) => c.toUpperCase()),
      count: items.filter((m) => Math.max(0, m.days_left) === i).length,
    };
  });
  const peak = Math.max(1, ...days.map((d) => d.count));

  return (
    <section className={cn("card p-5 md:p-6", className)}>
      <CardHead
        title="Vencen esta semana"
        count={failed ? undefined : items.length}
        href={items.length > 4 ? "/payments?tab=receivables" : undefined}
        link={`Ver los ${items.length}`}
      />
      {failed ? (
        <p className="mt-4 text-sm text-[var(--signal-warn)]">No se pudo cargar.</p>
      ) : (
        <>
          <div className="mt-5 flex items-end gap-2">
            {days.map((d, i) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-14 w-full items-end justify-center">
                  <div
                    className={cn("w-full max-w-[34px] rounded-[8px]", i === 0 ? "bg-primary" : "bg-line")}
                    style={{ height: `${8 + (d.count / peak) * 48}px` }}
                  />
                </div>
                <span className={cn("num text-[13px]", i === 0 ? "text-ink" : "text-ink-muted")}>{d.count}</span>
                <span className={cn("text-xs font-semibold", i === 0 ? "text-primary-ink" : "text-ink-muted")}>{d.label}</span>
              </div>
            ))}
          </div>

          {items.length === 0 ? (
            <p className="mt-5 border-t border-line/60 pt-4 text-sm text-ink-muted">Nadie vence en los próximos 7 días.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line/60 border-t border-line/60">
              {items.slice(0, 4).map((m) => {
                const price = priceOf(m.plan_name);
                return (
                  <li key={m.membership_id} className="flex items-center gap-3 py-3">
                    <Avatar name={m.member_name} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/members/${m.member_id}`} className="block truncate text-sm font-semibold text-ink hover:text-primary-ink">
                        {m.member_name}
                      </Link>
                      <p className="truncate text-[13px] text-ink-muted">
                        {m.plan_name}, {when(m.days_left)}
                      </p>
                    </div>
                    {price !== undefined && <span className="num hidden text-[14.5px] text-ink sm:inline">{formatCOP(price)}</span>}
                    <Link href={`/payments?member=${m.member_id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Cobrar
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {ops.in_grace.length > 0 && (
            <p className="mt-3 text-[13px] text-ink-muted">
              Además, <span className="font-semibold text-[var(--signal-warn)]">{ops.in_grace.length}</span>{" "}
              {ops.in_grace.length === 1 ? "socio sigue" : "socios siguen"} en período de gracia.{" "}
              <Link href="/payments?tab=receivables" className="font-semibold text-primary-ink hover:underline">
                Cobrarles
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}
