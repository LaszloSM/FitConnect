"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCOP, formatCOPCompact, parseDateOnly } from "@/lib/format";
import type { DashboardData } from "@/hooks/useDashboardData";

const H = 220;
const PAD_L = 44;
const PAD_T = 24;
const PAD_B = 26;

/** Ticks redondos (1, 2, 2.5 o 5 × 10ⁿ) cuyo último queda por encima del máximo. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) out.push(v);
  if (out[out.length - 1] <= max) out.push(out[out.length - 1] + step);
  return out;
}

/**
 * Lo cobrado por mes. Los meses cerrados van en tinta; el actual, en coral, con
 * lo que falta para la proyección rayado: lo proyectado nunca se pinta como si
 * ya estuviera cobrado.
 */
export function RevenueMonths({ data }: { data: DashboardData }) {
  const id = useId().replace(/:/g, "");
  // El SVG se dibuja al ancho real: escalado, los textos quedaban de 7 px en el celular.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(460);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rows = data.revenueHistory;
  const failed = data.failed.has("kpis");
  const projection = data.forecast && !data.failed.has("forecast") ? data.forecast.projection : null;

  if (failed || rows.length === 0) {
    return (
      <section className="card p-5 md:p-6">
        <h2 className="text-[15px] font-semibold text-ink">Ingresos por mes</h2>
        <p className="mt-3 text-sm text-ink-muted">{failed ? "No se pudo cargar el historial." : "Todavía no hay meses con cobros."}</p>
      </section>
    );
  }

  const last = rows.length - 1;
  const max = Math.max(...rows.map((r) => r.amount), projection ?? 0);
  const ts = ticks(max);
  const top = ts[ts.length - 1];
  const iw = W - PAD_L;
  const ih = H - PAD_T - PAD_B;
  const slot = iw / rows.length;
  const bw = Math.min(30, slot * 0.56);
  const y = (v: number) => PAD_T + ih - (v / top) * ih;
  const label = (m: string) => format(parseDateOnly(`${m}-01`), "MMM", { locale: es }).replace(".", "");

  return (
    <section className="card flex flex-col p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Ingresos por mes</h2>
        <Link href="/reports" className="text-[13px] font-semibold text-primary-ink hover:underline">
          Informe
        </Link>
      </div>
      <div ref={box} className="mt-4 min-w-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label={`Ingresos de los últimos ${rows.length} meses. Este mes lleva ${formatCOP(rows[last].amount)}${projection ? ` y a este ritmo cierra en ${formatCOP(projection)}` : ""}.`}
      >
        <defs>
          <pattern id={`raya-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--bg-card)" />
            <rect width="2.2" height="6" fill="var(--color-primary)" />
          </pattern>
        </defs>
        {ts.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} stroke={t ? "var(--border-soft)" : "var(--border-base)"} />
            <text x={PAD_L - 8} y={y(t) + 4} textAnchor="end" fontSize="11.5" fill="var(--text-muted)">
              {t ? formatCOPCompact(t).replace("$", "").trim() : "0"}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = PAD_L + slot * i + (slot - bw) / 2;
          const current = i === last;
          return (
            <g key={r.month}>
              {current && projection !== null && projection > r.amount && (
                <rect
                  className="bar-grow"
                  style={{ animationDelay: `${i * 35}ms` }}
                  x={x}
                  y={y(projection)}
                  width={bw}
                  height={y(r.amount) - y(projection)}
                  fill={`url(#raya-${id})`}
                  stroke="var(--color-primary)"
                />
              )}
              {r.amount > 0 && (
                <rect
                  className="bar-grow"
                  style={{ animationDelay: `${i * 35}ms` }}
                  x={x}
                  y={y(r.amount)}
                  width={bw}
                  height={y(0) - y(r.amount)}
                  fill={current ? "var(--color-primary)" : "var(--text-base)"}
                >
                  <title>{`${label(r.month)}: ${formatCOP(r.amount)}`}</title>
                </rect>
              )}
              {current && projection !== null && (
                <text x={x + bw / 2} y={y(Math.max(projection, r.amount)) - 7} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--text-base)">
                  {formatCOPCompact(projection).replace("$", "").trim()}
                </text>
              )}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fill={current ? "var(--text-base)" : "var(--text-muted)"} fontWeight={current ? 600 : 400}>
                {label(r.month)}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-ink" /> Meses cerrados</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-primary" /> Este mes</span>
        {projection !== null && (
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden="true">
              <rect width="10" height="10" rx="2" fill={`url(#raya-${id})`} stroke="var(--color-primary)" />
            </svg>
            A este ritmo
          </span>
        )}
      </div>
    </section>
  );
}
