"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Notice, StatusPill } from "@/components/StatusPill";
import { api } from "@/lib/api";
import { day, money } from "@/lib/format";
import type { Billing } from "@/lib/types";

const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className="num mt-1 break-words text-[22px] font-bold leading-none md:text-[28px]">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function dueText(days: number | null, status: string) {
  if (days == null) return status === "read_only" ? "Sin pagos · solo lectura" : "Sin pagos registrados";
  if (days < 0) return `Venció hace ${-days} ${days === -1 ? "día" : "días"}`;
  if (days === 0) return "Vence hoy";
  return `Vence en ${days} ${days === 1 ? "día" : "días"}`;
}

export default function BillingPage() {
  const [data, setData] = useState<Billing | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Billing>("/tenants/-/billing").then(setData).catch((e) => setError(e.message));
  }, []);

  const max = Math.max(1, ...(data?.series.map((s) => s.amount_cop) ?? [1]));

  return (
    <Shell>
      <h1 className="font-display text-[32px] font-bold tracking-tight md:text-[40px]">Cobros</h1>
      <p className="mt-1 text-sm text-ink-muted">Lo que te pagan los gimnasios por LSMFit. Los pagos se registran en la ficha de cada gimnasio.</p>

      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}

      <section className="card mt-6 grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="Cobrado este mes" value={data ? money(data.collected_month) : "—"} />
        <Stat label="Esperado cada mes" value={data ? money(data.expected_monthly) : "—"} hint="Gimnasios que pagan, al precio acordado" />
        <Stat label="Cobrado en 12 meses" value={data ? money(data.collected_12m) : "—"} />
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-semibold">Cobrado por mes</h2>
        {!data ? (
          <div className="mt-4 h-[160px] animate-pulse rounded-[var(--radius-md)] bg-muted" aria-busy="true" />
        ) : (
          <div className="mt-4 flex h-[180px] items-end gap-1.5 sm:gap-3" role="img" aria-label="Cobrado por mes en los últimos 12 meses">
            {data.series.map((s) => {
              const [, m] = s.month.split("-").map(Number);
              const h = Math.round((s.amount_cop / max) * 140);
              return (
                <div key={s.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="num hidden text-[11px] text-ink-muted md:block">{s.amount_cop ? money(s.amount_cop).replace(/\s/g, "") : ""}</span>
                  <div
                    className="w-full rounded-t-[4px] bg-[var(--brand)]"
                    style={{ height: `${Math.max(h, s.amount_cop ? 4 : 1)}px`, opacity: s.amount_cop ? 1 : 0.2 }}
                    title={`${MONTH[m - 1]}: ${money(s.amount_cop)}`}
                  />
                  <span className="text-[11px] text-ink-muted">{MONTH[m - 1]}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Por cobrar</h2>
          <p className="text-xs text-ink-muted">Vencidos o que vencen en los próximos 10 días.</p>
          {!data ? (
            <p className="mt-3 text-sm text-ink-muted">Cargando…</p>
          ) : data.due.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nadie debe ni vence pronto.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {data.due.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/gimnasios/${d.id}`} className="font-medium hover:underline">{d.name}</Link>
                    <p className="text-xs text-ink-muted">{dueText(d.days, d.status)} · <span className="num">{money(d.monthly_price)}</span>/mes</p>
                  </div>
                  <StatusPill status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Últimos pagos registrados</h2>
          {!data ? (
            <p className="mt-3 text-sm text-ink-muted">Cargando…</p>
          ) : data.recent.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Todavía no hay pagos. Regístralos desde la ficha de cada gimnasio.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {data.recent.map((p) => (
                <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${p.voided_at ? "opacity-60" : ""}`}>
                  <div>
                    <Link href={`/gimnasios/${p.tenant_id}`} className="font-medium hover:underline">{p.tenant ?? "Gimnasio"}</Link>
                    <p className="text-xs text-ink-muted">
                      {p.method_label} · {day(p.paid_on)} · hasta {day(p.period_end)}
                      {p.voided_at ? " · anulado" : ""}
                    </p>
                  </div>
                  <span className={`num font-semibold ${p.voided_at ? "line-through" : ""}`}>{money(p.amount_cop)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
