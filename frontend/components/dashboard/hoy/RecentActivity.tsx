"use client";

import { useState } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon as Search } from "@phosphor-icons/react";
import { formatCOP, formatDateTime } from "@/lib/format";
import type { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";

const KIND: Record<string, string> = {
  membership: "Membresía",
  day_pass: "Pase del día",
  product: "Venta",
  other: "Otro cobro",
};
const METHOD: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  wompi: "Wompi",
};
const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "muted" }> = {
  paid: { label: "Cobrado", tone: "ok" },
  pending: { label: "Por confirmar", tone: "warn" },
  refunded: { label: "Devuelto", tone: "muted" },
  voided: { label: "Anulado", tone: "muted" },
};

/** Los movimientos de caja de hoy, filtrables sin salir del Hoy. */
export function RecentActivity({ data }: { data: DashboardData }) {
  const [query, setQuery] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const failed = data.failed.has("recentPayments");
  const q = query.trim().toLowerCase();
  const rows = data.recentPayments.filter((p) => {
    if (onlyPending && p.status !== "pending") return false;
    if (!q) return true;
    return [KIND[p.kind] ?? "", p.concept ?? "", p.member_name ?? "", METHOD[p.method] ?? ""].join(" ").toLowerCase().includes(q);
  });

  return (
    <section className="card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Movimientos de hoy</h2>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-line px-3 text-sm text-ink-placeholder focus-within:border-ink-muted sm:w-56 sm:flex-none">
            <Search className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en los movimientos"
              aria-label="Buscar en los movimientos de hoy"
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-placeholder"
            />
          </label>
          <button
            type="button"
            aria-pressed={onlyPending}
            onClick={() => setOnlyPending((v) => !v)}
            className={cn(
              "h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40",
              onlyPending ? "border-action bg-action text-action-ink" : "border-line text-ink hover:bg-raised",
            )}
          >
            Por confirmar
          </button>
          <Link href="/payments?tab=history" className="hidden shrink-0 text-[13px] font-semibold text-primary-ink hover:underline md:inline">
            Ir a caja
          </Link>
        </div>
      </div>

      {failed ? (
        <p className="mt-4 text-sm text-[var(--signal-warn)]">No se pudieron cargar los movimientos.</p>
      ) : data.recentPayments.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Todavía no hay cobros hoy. Cada cobro aparece aquí con su estado.</p>
      ) : (
        <div className="-mx-1 mt-3 overflow-x-auto px-1">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[12.5px] text-ink-muted">
                <th className="hidden py-2 pr-3 font-normal sm:table-cell">Hora</th>
                <th className="py-2 pr-3 font-normal">Concepto</th>
                <th className="hidden py-2 pr-3 font-normal md:table-cell">Socio</th>
                <th className="hidden py-2 pr-3 font-normal sm:table-cell">Medio</th>
                <th className="hidden py-2 pr-3 font-normal sm:table-cell">Estado</th>
                <th className="py-2 text-right font-normal">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border-t border-line-soft py-6 text-center text-ink-muted">
                    Nada coincide{query ? ` con «${query}»` : ""}{onlyPending ? " entre lo que está por confirmar" : ""}.
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const st = STATUS[p.status] ?? { label: p.status, tone: "muted" as const };
                  const kind = KIND[p.kind] ?? "Cobro";
                  // "Venta Agua 600 ml" bajo "Venta" repite la palabra: se quita del detalle.
                  const detail = p.concept?.startsWith(kind + " ") ? p.concept.slice(kind.length + 1) : p.concept;
                  return (
                    <tr key={p.id} className="border-t border-line-soft">
                      <td className="num hidden whitespace-nowrap py-3 pr-3 text-[13px] font-semibold text-ink-muted sm:table-cell">{formatDateTime(p.created_at, "HH:mm")}</td>
                      <td className="py-3 pr-3">
                        <span className="block text-ink">{kind}</span>
                        {detail && <span className="block max-w-[28ch] truncate text-[12.5px] text-ink-muted">{detail}</span>}
                      </td>
                      <td className="hidden max-w-[18ch] truncate py-3 pr-3 text-ink md:table-cell">{p.member_name ?? "—"}</td>
                      <td className="hidden whitespace-nowrap py-3 pr-3 text-ink sm:table-cell">{METHOD[p.method] ?? p.method}</td>
                      <td className="hidden py-3 pr-3 sm:table-cell">
                        <span
                          className={cn(
                            "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium",
                            st.tone === "ok" && "bg-[var(--signal-ok-bg)] text-[var(--signal-ok)]",
                            st.tone === "warn" && "bg-[var(--signal-warn-bg)] text-[var(--signal-warn)]",
                            st.tone === "muted" && "bg-muted text-ink-muted",
                          )}
                        >
                          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                          {st.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3 text-right">
                        <span className="num block text-ink">{formatCOP(Number(p.amount) - Number(p.refunded_amount ?? 0))}</span>
                        {/* En el celular el estado viaja bajo el valor: no hay ancho para su columna. */}
                        <span className={cn("block text-xs sm:hidden", st.tone === "ok" ? "text-[var(--signal-ok)]" : st.tone === "warn" ? "text-[var(--signal-warn)]" : "text-ink-muted")}>
                          {st.label} · {formatDateTime(p.created_at, "HH:mm")}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
