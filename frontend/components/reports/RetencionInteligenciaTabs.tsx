/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Activity, Brain, MessageCircle, Sparkles, TrendingUp, Users } from "lucide-react";
import type { Period } from "./PeriodPicker";
import { Card, Empty, TabSkeleton, Tile, chartTooltipStyle, compact, containerVariants, cardVariants, usePeriodData } from "./shared";
import { Heatmap } from "./SociosAsistenciaTabs";

interface Retention { month: string; ended: number; renewed: number; renewal_rate: number | null; churn_rate: number | null }
interface Cohort { month: string; size: number; active_now: number; renewed: number; active_pct: number | null; renewed_pct: number | null }
interface Risk { member_id: string; full_name: string; phone: string | null; score: number; level: "alto" | "medio" | "bajo"; reasons: string[]; days_since_last_visit: number | null; membership_status: string; plan_name: string | null; end_date: string | null }
interface Forecast { month_to_date: number; elapsed_days: number; days_in_month: number; daily_pace: number; projection: number; projection_low: number; projection_high: number; avg_previous_months: number | null; vs_previous_pct: number | null; daily_so_far: number[] }

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) digits = `57${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function RetencionTab() {
  const { data, loading, error } = usePeriodData<{ retention: Retention[]; cohorts: Cohort[] }>({
    retention: "/api/v1/reports/retention",
    cohorts: "/api/v1/insights/cohorts",
  }, null);
  if (loading && !data.retention) return <TabSkeleton />;
  if (error) return <Empty text={error} />;
  const retention = data.retention ?? [];
  const cohorts = data.cohorts ?? [];
  const last = [...retention].reverse().find((r) => r.renewal_rate !== null) ?? null;
  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={cardVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Tasa de renovación" value={last ? `${last.renewal_rate}%` : "—"} tone={last && (last.renewal_rate ?? 0) >= 70 ? "positive" : "warning"} hint={last ? `${last.month} · ${last.renewed}/${last.ended} renovaron` : "Aún sin vencimientos"} />
        <Tile label="Churn" value={last ? `${last.churn_rate}%` : "—"} tone="muted" />
        <Tile label="Cohorte más reciente" value={cohorts.length ? `${cohorts[cohorts.length - 1].size} socios` : "—"} hint={cohorts.length ? `${cohorts[cohorts.length - 1].active_pct ?? 0}% siguen activos` : undefined} />
        <Tile label="Meses analizados" value={String(retention.length)} tone="muted" />
      </motion.div>
      <Card title="Renovación mensual" icon={<Activity className="h-4 w-4 text-[var(--color-primary)]" />}>
        {retention.every((r) => r.ended === 0) ? <Empty text="Aún no hay vencimientos para medir renovación" /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {retention.map((r) => (
              <div key={r.month} className="rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] p-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase">{r.month}</p>
                <p className={cn("text-lg font-bold font-mono", r.renewal_rate === null ? "text-[var(--text-muted)]" : r.renewal_rate >= 70 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>{r.renewal_rate === null ? "—" : `${r.renewal_rate}%`}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{r.renewed}/{r.ended} renovaron</p>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Cohortes por mes de ingreso" icon={<Users className="h-4 w-4 text-violet-500" />}>
        <p className="text-xs text-[var(--text-muted)] mb-3">De los que entraron cada mes, cuántos siguen con membresía vigente hoy y cuántos renovaron al menos una vez.</p>
        {cohorts.every((c) => c.size === 0) ? <Empty text="Sin cohortes todavía" /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {cohorts.map((c) => (
              <div key={c.month} className="rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] p-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase">{c.month}</p>
                <p className="text-sm font-bold text-[var(--text-base)]">{c.size} {c.size === 1 ? "socio" : "socios"}</p>
                <div className="h-1.5 rounded-full bg-[var(--bg-base)] mt-1.5"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${c.active_pct ?? 0}%` }} /></div>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">{c.active_pct ?? 0}% activos · {c.renewed_pct ?? 0}% renovaron</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export function InteligenciaTab({ period }: { period: Period }) {
  const { data, loading, error } = usePeriodData<{ forecast: Forecast; risk: Risk[]; peak: any }>({
    forecast: "/api/v1/insights/forecast",
    risk: "/api/v1/insights/churn-risk",
    peak: "/api/v1/insights/peak-hours",
  }, period);
  if (loading && !data.forecast) return <TabSkeleton />;
  if (error) return <Empty text={error} />;
  const f = data.forecast!;
  const risk = data.risk ?? [];
  const peak = data.peak;
  const high = risk.filter((r) => r.level === "alto").length;

  const series = f.daily_so_far.map((v, i) => ({ day: i + 1, acumulado: f.daily_so_far.slice(0, i + 1).reduce((a, b) => a + b, 0) }));
  const proj = [...series];
  const lastAcc = series.length ? series[series.length - 1].acumulado : 0;
  for (let d = series.length + 1; d <= f.days_in_month; d++) {
    proj.push({ day: d, acumulado: lastAcc + f.daily_pace * (d - series.length) } as any);
  }
  const chart = proj.map((p, i) => ({ day: p.day, real: i < series.length ? p.acumulado : undefined, proyectado: i >= series.length - 1 ? p.acumulado : undefined }));

  const columns: DataTableColumn<Risk>[] = [
    { key: "member", header: "Socio", cell: (r) => (
      <Link href={`/members/${r.member_id}`} className="hover:text-[var(--color-primary)]">
        <p className="font-medium text-[var(--text-base)]">{r.full_name}</p>
        <p className="text-xs text-[var(--text-muted)]">{r.plan_name ?? "Sin plan"}{r.end_date ? ` · vence ${r.end_date.split("-").reverse().join("/")}` : ""}</p>
      </Link>
    ) },
    { key: "score", header: "Riesgo", cell: (r) => (
      <div className="flex items-center gap-2">
        <StatusBadge status={r.level} label={r.level === "alto" ? "Alto" : r.level === "medio" ? "Medio" : "Bajo"} tone={r.level === "alto" ? "danger" : r.level === "medio" ? "warning" : "neutral"} />
        <span className="font-mono text-xs text-[var(--text-muted)]">{r.score}</span>
      </div>
    ) },
    { key: "why", header: "Por qué", hideOnMobile: true, cell: (r) => <span className="text-xs text-[var(--text-muted)]">{r.reasons.join(" · ")}</span> },
    { key: "act", header: "", cell: (r) => {
      const wa = waLink(r.phone, `Hola ${r.full_name.split(" ")[0]} 👋 hace rato no te vemos en el gym. ¿Todo bien? Te esperamos esta semana 💪`);
      return wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-600 hover:border-emerald-300 transition-ui" title="Escribir por WhatsApp"><MessageCircle className="h-4 w-4" /></a> : null;
    } },
  ];

  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={cardVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Va del mes" value={formatCOP(f.month_to_date)} hint={`${f.elapsed_days} de ${f.days_in_month} días · ${formatCOP(f.daily_pace)}/día`} />
        <Tile label="Cierre proyectado" value={formatCOP(f.projection)} tone={f.vs_previous_pct === null ? "base" : f.vs_previous_pct >= 0 ? "positive" : "negative"} hint={`entre ${compact(f.projection_low)} y ${compact(f.projection_high)}`} />
        <Tile label="Vs. promedio 3 meses" value={f.vs_previous_pct === null ? "—" : `${f.vs_previous_pct >= 0 ? "+" : ""}${f.vs_previous_pct}%`} tone={f.vs_previous_pct === null ? "muted" : f.vs_previous_pct >= 0 ? "positive" : "negative"} hint={f.avg_previous_months ? `promedio ${compact(f.avg_previous_months)}` : "sin historial"} />
        <Tile label="Riesgo alto de abandono" value={String(high)} tone={high > 0 ? "negative" : "positive"} hint={`${risk.length} socios con alguna señal`} />
      </motion.div>

      <Card title="Proyección de ingresos del mes" icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} right={<span className="text-[10px] text-[var(--text-muted)]">ritmo diario + promedio reciente</span>}>
        {f.month_to_date === 0 && f.elapsed_days < 2 ? <Empty text="Todavía no hay datos suficientes este mes" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chart} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={compact} />
              <Tooltip {...chartTooltipStyle} formatter={(v: any, n: any) => [formatCOP(Number(v) || 0), n === "real" ? "Acumulado" : "Proyección"]} labelFormatter={(d) => `Día ${d}`} />
              {f.avg_previous_months ? <ReferenceLine y={f.avg_previous_months} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value: "prom. 3 meses", fill: "var(--text-muted)", fontSize: 10, position: "insideTopLeft" }} /> : null}
              <Area type="monotone" dataKey="real" stroke="#22C55E" strokeWidth={2} fill="#22C55E" fillOpacity={0.15} name="real" connectNulls={false} />
              <Area type="monotone" dataKey="proyectado" stroke="#22C55E" strokeWidth={2} strokeDasharray="5 4" fill="#22C55E" fillOpacity={0.05} name="proyectado" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Socios en riesgo de abandono" icon={<Brain className="h-4 w-4 text-red-500" />} right={<span className="text-[10px] text-[var(--text-muted)]">puntaje por reglas: visitas, mora, vencimiento</span>}>
        {risk.length === 0 ? <Empty text="Ningún socio con señales de abandono. Buen trabajo." /> : <DataTable columns={columns} rows={risk} rowKey={(r) => r.member_id} />}
      </Card>

      {peak && peak.total > 0 && (
        <Card title="Cuándo se llena el gym (período)" icon={<Sparkles className="h-4 w-4 text-[var(--color-primary)]" />}>
          <Heatmap cells={peak.cells} />
          {peak.top?.length > 0 && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Picos: {peak.top.slice(0, 3).map((t: any) => `${t.weekday_label} ${t.hour}:00 (${t.count})`).join(" · ")}
            </p>
          )}
        </Card>
      )}
    </motion.div>
  );
}
