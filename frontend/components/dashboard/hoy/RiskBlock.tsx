"use client";

import Link from "next/link";
import { WarningIcon } from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";
import type { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";
import { Avatar } from "./parts";

/** Lo que se puede perder: socios con riesgo alto y lo que pagan al mes. */
export function RiskBlock({ data, className }: { data: DashboardData; className?: string }) {
  const failed = data.failed.has("churnRisk");
  const high = data.churnRisk.filter((r) => r.level === "alto");
  const monthly = (planName: string | null) => {
    const plan = data.plans.find((p) => p.name === planName);
    return plan && plan.duration_days > 0 ? (Number(plan.price) / plan.duration_days) * 30 : 0;
  };
  const atRisk = Math.round(high.reduce((a, r) => a + monthly(r.plan_name), 0));
  const byValue = [...high].sort((a, b) => monthly(b.plan_name) - monthly(a.plan_name) || b.score - a.score);
  const byModel = data.churnRisk[0]?.method === "modelo";

  return (
    <section className={cn("flex flex-col rounded-[var(--radius-lg)] bg-attention p-5 shadow-[inset_0_1px_0_oklch(1_0_0/0.6)] md:p-6", className)}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <WarningIcon className="size-[18px] text-[var(--signal-warn)]" weight="bold" aria-hidden="true" />
        Ingreso en riesgo
      </h2>

      {failed ? (
        <p className="mt-4 text-sm text-[var(--signal-warn)]">No se pudo cargar.</p>
      ) : high.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Ningún socio con riesgo alto de irse. {byModel ? "El modelo" : "La revisión"} corre cada noche con tus datos.
        </p>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="num text-[32px] leading-none text-ink">{formatCOP(atRisk)}</span>
            <span className="text-sm text-ink-muted">al mes</span>
          </p>
          <p className="mt-1.5 text-[13.5px] text-ink">
            {high.length} {high.length === 1 ? "socio con señales" : "socios con señales"} de irse. Los que más pagan:
          </p>
          <ul className="mt-2">
            {byValue.slice(0, 4).map((r) => (
              <li key={r.member_id} className="flex items-center gap-2.5 py-2">
                <Avatar name={r.full_name} size={32} />
                <div className="min-w-0">
                  <Link href={`/members/${r.member_id}`} className="block truncate text-[13.5px] font-semibold text-ink hover:text-primary-ink">
                    {r.full_name}
                  </Link>
                  <p className="truncate text-[12.5px] text-ink-muted">
                    {r.reasons[0] ? r.reasons[0].charAt(0).toUpperCase() + r.reasons[0].slice(1) : "Viene menos que antes"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
            <Link href="/reports?tab=inteligencia" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Ver y escribirles
            </Link>
            {!byModel && <span className="text-xs text-ink-muted">Estimado con reglas</span>}
          </div>
        </>
      )}
    </section>
  );
}
