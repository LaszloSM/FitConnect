"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Notice, StatusPill } from "@/components/StatusPill";
import { api } from "@/lib/api";
import { money, moment, STATUS_LABEL } from "@/lib/format";
import type { Overview, TenantRow } from "@/lib/types";

const FILTERS = ["", "trialing", "active", "comp", "past_due", "read_only", "suspended"];

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className="num mt-1 break-words text-[22px] font-bold leading-none md:text-[28px]">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export default function HomePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const query = (offset: number) => {
    const params = new URLSearchParams({ q, limit: "50", offset: String(offset) });
    if (status) params.set("status", status);
    return api<{ items: TenantRow[]; total: number }>(`/tenants?${params}`);
  };

  const more = async () => {
    setLoadingMore(true);
    try {
      const r = await query(rows?.length ?? 0);
      setRows((cur) => [...(cur ?? []), ...r.items]);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    api<Overview>("/tenants/overview").then(setOverview).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      query(0)
        .then((r) => {
          setRows(r.items);
          setTotal(r.total);
        })
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status]);

  return (
    <Shell>
      <h1 className="font-display text-[32px] font-bold tracking-tight md:text-[40px]">Gimnasios</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Solo metadatos y conteos: este panel nunca muestra datos de los socios de cada gimnasio.
      </p>

      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}

      <section className="card mt-6 grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
        <Stat label="Gimnasios" value={overview?.total ?? "—"} hint={overview ? `${overview.new_30d} nuevos en 30 días` : undefined} />
        <Stat label="Pagando" value={overview?.by_status.active ?? 0} />
        <Stat label="En prueba o cortesía" value={(overview?.by_status.trialing ?? 0) + (overview?.by_status.comp ?? 0)} />
        <Stat label="Ingreso mensual estimado" value={overview ? money(overview.mrr_cop) : "—"} hint="Solo gimnasios activos" />
      </section>

      {overview && overview.ending_soon.length > 0 && (
        <section className="mt-4 rounded-[var(--radius-lg)] border border-[var(--signal-warn-line)] bg-[var(--signal-warn-bg)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--signal-warn)]">Se vence en los próximos 7 días</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {overview.ending_soon.map((t) => (
              <li key={t.id}>
                <Link href={`/gimnasios/${t.id}`} className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-panel px-2.5 py-1 text-sm hover:underline">
                  {t.name} <StatusPill status={t.status} daysLeft={t.days_left} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="field max-w-[320px]"
            placeholder="Buscar por nombre, ciudad o correo del dueño"
            aria-label="Buscar gimnasio"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="field max-w-[200px]" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f ? STATUS_LABEL[f] : "Todos los estados"}
              </option>
            ))}
          </select>
          <span className="text-sm text-ink-muted">
            {rows === null ? "Cargando…" : (
              <>
                <span className="num">{total}</span> {total === 1 ? "gimnasio" : "gimnasios"}
              </>
            )}
          </span>
        </div>

        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-ink-muted">
                <th className="px-4 py-3 font-medium">Gimnasio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 text-right font-medium">Socios activos</th>
                <th className="px-4 py-3 text-right font-medium">Entradas 30 d</th>
                <th className="px-4 py-3 font-medium">Torniquete</th>
                <th className="px-4 py-3 font-medium">Última actividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows === null && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-ink-muted">Cargando gimnasios y sus cifras…</td>
                </tr>
              )}
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-ink-muted">Ningún gimnasio coincide.</td>
                </tr>
              )}
              {rows?.map((t) => {
                const m = t.metrics;
                return (
                  <tr key={t.id} className="hover:bg-muted/60">
                    <td className="px-4 py-3">
                      <Link href={`/gimnasios/${t.id}`} className="font-semibold hover:underline">
                        {t.name}
                      </Link>
                      <p className="text-xs text-ink-muted">{[t.city, t.owner_email].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={t.subscription.status} daysLeft={t.subscription.days_left} />
                    </td>
                    <td className="px-4 py-3">{t.subscription.plan_label}</td>
                    <td className="num px-4 py-3 text-right">{m?.error ? "—" : m?.active_members ?? "—"}</td>
                    <td className="num px-4 py-3 text-right">{m?.error ? "—" : m?.checkins_30d ?? "—"}</td>
                    <td className="px-4 py-3">
                      {m?.error ? (
                        <span className="text-[var(--signal-danger)]">Base no responde</span>
                      ) : m?.turnstiles ? (
                        <span className="num">{m.turnstiles_online}/{m.turnstiles} en línea</span>
                      ) : (
                        <span className="text-ink-muted">Sin equipo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{moment(m?.last_checkin ?? m?.last_payment ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows && rows.length < total && (
          <div className="mt-4 flex justify-center">
            <button className="btn btn-outline" onClick={more} disabled={loadingMore}>
              {loadingMore ? "Cargando…" : `Ver más (${total - rows.length} restantes)`}
            </button>
          </div>
        )}
      </section>
    </Shell>
  );
}
