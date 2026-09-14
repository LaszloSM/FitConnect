"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP, formatDate, formatDateTime, parseDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActivityIcon as Activity, WarningIcon as AlertTriangle, CubeIcon as Boxes, BrainIcon as Brain, CalendarDotsIcon as CalendarClock, CpuIcon as Cpu, SpinnerGapIcon as Loader2, ChatCircleIcon as MessageCircle, ArrowsClockwiseIcon as RefreshCw, SparkleIcon as Sparkles, TagIcon as Tags, TrendDownIcon as TrendingDown, TrendUpIcon as TrendingUp, UsersIcon as Users } from "@phosphor-icons/react";
import type { Period } from "./PeriodPicker";
import { Card, Empty, TabSkeleton, Tile, chartTooltipStyle, compact, containerVariants, cardVariants, usePeriodData } from "./shared";
import { Heatmap } from "./SociosAsistenciaTabs";

interface Retention { month: string; ended: number; renewed: number; renewal_rate: number | null; churn_rate: number | null }
interface Cohort { month: string; size: number; active_now: number; renewed: number; active_pct: number | null; renewed_pct: number | null }
interface Risk {
  member_id: string; full_name: string; phone: string | null; score: number; probability: number | null;
  level: "alto" | "medio" | "bajo"; reasons: string[]; days_since_last_visit: number | null; membership_status: string;
  plan_name: string | null; end_date: string | null; method: "modelo" | "reglas";
}
interface Forecast {
  month_to_date: number; elapsed_days: number; days_in_month: number; daily_pace: number; projection: number;
  projection_low: number; projection_high: number; avg_previous_months: number | null; vs_previous_pct: number | null;
  daily_so_far: number[]; daily_forecast?: number[]; method: "modelo" | "reglas"; method_detail: string;
  backtest?: { model_error_pct: number | null; pace_error_pct: number | null } | null;
}
interface ModelStatus {
  name: string; label: string; method: string; status: string; detail: string | null; trained_at: string | null;
  n_samples: number; metrics: Record<string, any>;
}
interface Stored<T> { status: string; detail: string | null; trained_at: string | null; result: T | null }
interface Segment {
  cluster: number; name: string; description: string; size: number; avg_recency_days: number; avg_visits_90: number;
  avg_paid_180: number; avg_tenure_days: number; avg_hour: number; members: { member_id: string; full_name: string; phone: string | null }[];
}
interface Anomaly { date: string; revenue: number; checkins: number; direction: "up" | "down"; explanation: string }
interface PricePlan { plan_name: string; memberships: number; elasticity: number | null; reading: string; points: { price: number; count: number; renewal_rate: number }[] }
interface Stock { product_id: string; name: string; stock: number; daily_velocity: number; days_left: number | null; runs_out_on: string | null; method?: string }

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) digits = `57${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const STATUS_TEXT: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  trained: { label: "Entrenado", tone: "success" },
  weak: { label: "Poco confiable", tone: "warning" },
  insufficient_data: { label: "Faltan datos", tone: "neutral" },
  failed: { label: "Falló", tone: "danger" },
  never_trained: { label: "Sin entrenar", tone: "neutral" },
};

function metricLine(m: ModelStatus): string {
  const x = m.metrics ?? {};
  if (m.status !== "trained" && m.status !== "weak") return m.detail ?? "";
  if (m.name === "churn" && x.auc != null) return `${m.n_samples.toLocaleString("es-CO")} casos · AUC ${String(x.auc).replace(".", ",")}`;
  if (m.name === "forecast" && x.backtest?.model_error_pct != null) {
    return `error ${x.backtest.model_error_pct}% en 2 semanas (el ritmo lineal: ${x.backtest.pace_error_pct}%)`;
  }
  if (m.name === "segments") return `${x.members} socios en ${x.groups} grupos`;
  if (m.name === "anomalies") return `${x.days} días revisados`;
  if (m.name === "occupancy") return `${x.days_with_visits} días con entradas`;
  if (m.name === "pricing") return `${x.plans_measured} plan(es) medibles`;
  return `${m.n_samples} datos`;
}

function MethodTag({ method }: { method?: string }) {
  if (!method) return null;
  return (
    <span
      className="text-xs font-medium px-1.5 py-0.5 rounded-[var(--radius-sm)]"
      style={method === "modelo"
        ? { color: "var(--signal-info)", background: "var(--signal-info-bg)" }
        : { color: "var(--text-muted)", background: "var(--bg-muted)" }}
    >
      {method === "modelo" ? "Modelo" : "Reglas"}
    </span>
  );
}

function NotTrained<T>({ stored }: { stored?: Stored<T> }) {
  return <Empty text={stored?.detail ?? "Se entrena cada noche con los datos del gimnasio."} />;
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
      <Card title="Renovación mensual" icon={<Activity className="h-4 w-4 text-ink-muted" />}>
        {retention.every((r) => r.ended === 0) ? <Empty text="Aún no hay vencimientos para medir renovación" /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {retention.map((r) => (
              <div key={r.month} className="rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] p-3">
                <p className="text-xs text-[var(--text-muted)]">{r.month}</p>
                <p className={cn("text-lg font-bold font-mono", r.renewal_rate === null ? "text-[var(--text-muted)]" : r.renewal_rate >= 70 ? "text-[var(--signal-ok)]" : "text-[var(--signal-warn)]")}>{r.renewal_rate === null ? "—" : `${r.renewal_rate}%`}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{r.renewed}/{r.ended} renovaron</p>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Cohortes por mes de ingreso" icon={<Users className="h-4 w-4 text-[var(--accent-members)]" />}>
        <p className="text-xs text-[var(--text-muted)] mb-3">De los que entraron cada mes, cuántos siguen con membresía vigente hoy y cuántos renovaron al menos una vez.</p>
        {cohorts.every((c) => c.size === 0) ? <Empty text="Sin cohortes todavía" /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {cohorts.map((c) => (
              <div key={c.month} className="rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] p-3">
                <p className="text-xs text-[var(--text-muted)]">{c.month}</p>
                <p className="text-sm font-bold text-[var(--text-base)]">{c.size} {c.size === 1 ? "socio" : "socios"}</p>
                <div className="h-1.5 rounded-full bg-[var(--bg-base)] mt-1.5"><div className="h-1.5 rounded-full bg-[var(--signal-ok)]" style={{ width: `${c.active_pct ?? 0}%` }} /></div>
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
  const { data: session } = useSession();
  // Cambiar la versión cambia las URLs y el hook vuelve a pedir todo.
  const [version, setVersion] = useState(0);
  const [training, setTraining] = useState(false);
  const v = `?v=${version}`;
  const { data, loading, error } = usePeriodData<{
    forecast: Forecast; risk: Risk[]; peak: any; models: ModelStatus[]; drivers: { method: string; drivers: { feature: string; weight: number }[] };
    segments: Stored<{ groups: Segment[] }>; anomalies: Stored<{ items: Anomaly[] }>; occupancy: Stored<any>;
    pricing: Stored<{ plans: PricePlan[] }>; stock: Stock[];
  }>({
    forecast: `/api/v1/insights/forecast${v}`,
    risk: `/api/v1/insights/churn-risk${v}`,
    peak: `/api/v1/insights/peak-hours${v}`,
    models: `/api/v1/insights/models${v}`,
    drivers: `/api/v1/insights/churn-drivers${v}`,
    segments: `/api/v1/insights/segments${v}`,
    anomalies: `/api/v1/insights/anomalies${v}`,
    occupancy: `/api/v1/insights/occupancy${v}`,
    pricing: `/api/v1/insights/pricing${v}`,
    stock: `/api/v1/insights/stockout${v}`,
  }, period);

  const retrain = async () => {
    if (!session?.accessToken) return;
    setTraining(true);
    try {
      const res = await apiClient(session.accessToken as string).post("/api/v1/insights/models/train");
      const entrenados = Object.values(res.data.status as Record<string, string>).filter((s) => s === "trained").length;
      toast.success(`Modelos reentrenados: ${entrenados} de 6 con datos suficientes`);
      setVersion((x) => x + 1);
    } catch (err) {
      toast.error(parseApiError(err, "No se pudieron reentrenar los modelos"));
    } finally {
      setTraining(false);
    }
  };

  if (loading && !data.forecast) return <TabSkeleton />;
  if (error) return <Empty text={error} />;
  const f = data.forecast;
  const risk = data.risk ?? [];
  const peak = data.peak;
  const high = risk.filter((r) => r.level === "alto").length;
  const models = data.models ?? [];
  const churnModel = models.find((m) => m.name === "churn");

  let chart: { day: number; real?: number; proyectado?: number }[] = [];
  if (f) {
    const acumulado = f.daily_so_far.reduce<number[]>((acc, x) => [...acc, (acc[acc.length - 1] ?? 0) + x], []);
    const futuro = f.daily_forecast && f.daily_forecast.length
      ? f.daily_forecast
      : Array.from({ length: f.days_in_month - acumulado.length }, () => f.daily_pace);
    const base = acumulado[acumulado.length - 1] ?? 0;
    chart = acumulado.map((a, i) => ({ day: i + 1, real: a, proyectado: i === acumulado.length - 1 ? a : undefined }));
    let corrido = base;
    futuro.forEach((x, i) => {
      corrido += x;
      chart.push({ day: acumulado.length + i + 1, proyectado: corrido });
    });
  }

  const columns: DataTableColumn<Risk>[] = [
    { key: "member", header: "Socio", cell: (r) => (
      <Link href={`/members/${r.member_id}`} className="hover:text-primary-ink">
        <p className="font-medium text-[var(--text-base)]">{r.full_name}</p>
        <p className="text-xs text-[var(--text-muted)]">{r.plan_name ?? "Sin plan"}{r.end_date ? ` · vence ${formatDate(parseDateOnly(r.end_date))}` : ""}</p>
      </Link>
    ) },
    { key: "score", header: "Riesgo", cell: (r) => (
      <div className="flex items-center gap-2">
        <StatusBadge status={r.level} label={r.level === "alto" ? "Alto" : r.level === "medio" ? "Medio" : "Bajo"} tone={r.level === "alto" ? "danger" : r.level === "medio" ? "warning" : "neutral"} />
        <span className="font-mono text-xs text-[var(--text-muted)]" title={r.probability != null ? "Probabilidad de irse en 30-45 días" : "Puntaje por reglas"}>
          {r.probability != null ? `${Math.round(r.probability * 100)}%` : r.score}
        </span>
      </div>
    ) },
    { key: "why", header: "Por qué", hideOnMobile: true, cell: (r) => <span className="text-xs text-[var(--text-muted)]">{r.reasons.join(" · ")}</span> },
    { key: "act", header: "", cell: (r) => {
      const wa = waLink(r.phone, `Hola ${r.full_name.split(" ")[0]} 👋 hace rato no te vemos en el gym. ¿Todo bien? Te esperamos esta semana 💪`);
      return wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-ok)] transition-ui" title="Escribir por WhatsApp" aria-label={`Escribir a ${r.full_name} por WhatsApp`}><MessageCircle className="h-4 w-4" /></a> : null;
    } },
  ];

  const segmentos = data.segments?.result?.groups ?? [];
  const anomalias = data.anomalies?.result?.items ?? [];
  const aforo = data.occupancy?.result;
  const planes = data.pricing?.result?.plans ?? [];
  const agotandose = (data.stock ?? []).filter((s) => s.days_left != null && s.days_left <= 21).slice(0, 6);

  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <Card
        title="Modelos del gimnasio"
        icon={<Cpu className="h-4 w-4 text-ink-muted" />}
        right={
          <button
            type="button"
            onClick={retrain}
            disabled={training}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors disabled:opacity-50"
          >
            {training ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Reentrenar ahora
          </button>
        }
      >
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Se entrenan cada noche solo con los datos de este gimnasio. Donde no hay historial suficiente, la pantalla usa reglas y lo dice.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {models.map((m) => {
            const st = STATUS_TEXT[m.status] ?? STATUS_TEXT.never_trained;
            return (
              <div key={m.name} className="rounded-lg border border-[var(--border-base)] p-3" title={m.detail ?? undefined}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text-base)] truncate">{m.label}</p>
                  <StatusBadge status={m.status} label={st.label} tone={st.tone} />
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{m.method}{m.trained_at ? ` · ${formatDateTime(m.trained_at)}` : ""}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{metricLine(m)}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {f && (
        <motion.div variants={cardVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Va del mes" value={formatCOP(f.month_to_date)} hint={`${f.elapsed_days} de ${f.days_in_month} días · ${formatCOP(f.daily_pace)}/día`} />
          <Tile label="Cierre proyectado" value={formatCOP(f.projection)} tone={f.vs_previous_pct === null ? "base" : f.vs_previous_pct >= 0 ? "positive" : "negative"} hint={`entre ${compact(f.projection_low)} y ${compact(f.projection_high)}`} />
          <Tile label="Vs. promedio 3 meses" value={f.vs_previous_pct === null ? "—" : `${f.vs_previous_pct >= 0 ? "+" : ""}${f.vs_previous_pct}%`} tone={f.vs_previous_pct === null ? "muted" : f.vs_previous_pct >= 0 ? "positive" : "negative"} hint={f.avg_previous_months ? `promedio ${compact(f.avg_previous_months)}` : "sin historial"} />
          <Tile label="Riesgo alto de abandono" value={String(high)} tone={high > 0 ? "negative" : "positive"} hint={`${risk.length} socios con alguna señal`} />
        </motion.div>
      )}

      {f && (
        <Card title="Proyección de ingresos del mes" icon={<TrendingUp className="h-4 w-4 text-[var(--signal-ok)]" />} right={<MethodTag method={f.method} />}>
          <p className="text-xs text-[var(--text-muted)] mb-3">{f.method_detail}</p>
          {f.month_to_date === 0 && f.elapsed_days < 2 ? <Empty text="Todavía no hay datos suficientes este mes" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chart} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={compact} />
                <Tooltip {...chartTooltipStyle} formatter={(val: any, n: any) => [formatCOP(Number(val) || 0), n === "real" ? "Acumulado" : "Proyección"]} labelFormatter={(d) => `Día ${d}`} />
                {f.avg_previous_months ? <ReferenceLine y={f.avg_previous_months} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value: "prom. 3 meses", fill: "var(--text-muted)", fontSize: 10, position: "insideTopLeft" }} /> : null}
                <Area type="monotone" dataKey="real" stroke="var(--brand)" strokeWidth={2} fill="var(--brand)" fillOpacity={0.15} name="real" connectNulls={false} />
                <Area type="monotone" dataKey="proyectado" stroke="var(--brand)" strokeWidth={2} strokeDasharray="5 4" fill="var(--brand)" fillOpacity={0.05} name="proyectado" connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      <Card
        title="Socios en riesgo de abandono"
        icon={<Brain className="h-4 w-4 text-[var(--signal-danger)]" />}
        right={<MethodTag method={risk[0]?.method ?? (churnModel?.status === "trained" ? "modelo" : "reglas")} />}
      >
        {data.drivers?.method === "modelo" && data.drivers.drivers.length > 0 ? (
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Lo que más pesa en este gimnasio: {data.drivers.drivers.slice(0, 4).map((d) => `${d.feature} (${Math.round(d.weight * 100)}%)`).join(" · ")}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Puntaje por reglas (visitas, mora, vencimiento). {churnModel?.detail ?? ""}
          </p>
        )}
        {risk.length === 0 ? <Empty text="Ningún socio con señales de abandono. Buen trabajo." /> : <DataTable columns={columns} rows={risk} rowKey={(r) => r.member_id} />}
      </Card>

      <Card title="Segmentos de socios" icon={<Users className="h-4 w-4 text-[var(--accent-members)]" />} right={<MethodTag method={data.segments?.status === "trained" ? "modelo" : undefined} />}>
        {data.segments?.status !== "trained" ? <NotTrained stored={data.segments} /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {segmentos.map((g) => (
              <div key={g.cluster} className="rounded-lg border border-[var(--border-base)] p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-base)]">{g.name}</p>
                  <p className="text-xs font-mono text-[var(--text-muted)]">{g.size} socios</p>
                </div>
                <p className="text-xs text-[var(--text-muted)]">{g.description}</p>
                <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
                  {g.avg_visits_90} visitas en 90 días · última hace {Math.round(g.avg_recency_days)} d · {compact(g.avg_paid_180)} en 6 meses · entrena ~{Math.round(g.avg_hour)}:00
                </p>
                {g.members.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-primary-ink font-medium">Ver socios</summary>
                    <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {g.members.map((m) => {
                        const wa = waLink(m.phone, `Hola ${m.full_name.split(" ")[0]} 👋`);
                        return (
                          <li key={m.member_id} className="flex items-center justify-between gap-2">
                            <Link href={`/members/${m.member_id}`} className="truncate text-[var(--text-base)] hover:text-primary-ink">{m.full_name}</Link>
                            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Escribir a ${m.full_name}`} className="text-[var(--text-muted)] hover:text-[var(--signal-ok)]"><MessageCircle className="h-3.5 w-3.5" /></a>}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Días fuera de lo normal" icon={<AlertTriangle className="h-4 w-4 text-[var(--signal-warn)]" />} right={<MethodTag method={data.anomalies?.status === "trained" ? "modelo" : undefined} />}>
          {data.anomalies?.status !== "trained" ? <NotTrained stored={data.anomalies} /> : anomalias.length === 0 ? (
            <Empty text="Ningún día del último mes se salió de lo normal." />
          ) : (
            <ul className="space-y-2">
              {anomalias.map((a) => (
                <li key={a.date} className="flex items-start gap-2 text-sm">
                  {a.direction === "up"
                    ? <TrendingUp className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--signal-ok)" }} aria-hidden />
                    : <TrendingDown className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--signal-danger)" }} aria-hidden />}
                  <div>
                    <p className="text-[var(--text-base)]">{formatDate(parseDateOnly(a.date))}</p>
                    <p className="text-xs text-[var(--text-muted)]">{a.explanation} · {formatCOP(a.revenue)} · {a.checkins} entradas</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Reacción al precio" icon={<Tags className="h-4 w-4 text-[var(--accent-plans)]" />} right={<MethodTag method={data.pricing?.status === "trained" ? "modelo" : undefined} />}>
          {planes.length === 0 ? <NotTrained stored={data.pricing} /> : (
            <ul className="space-y-3">
              {planes.map((p) => (
                <li key={p.plan_name} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium text-[var(--text-base)]">{p.plan_name}</p>
                    <p className="text-xs font-mono text-[var(--text-muted)]">{p.elasticity === null ? "—" : `elasticidad ${String(p.elasticity).replace(".", ",")}`}</p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">{p.reading}</p>
                  {p.points.length > 1 && (
                    <p className="text-[11px] text-[var(--text-muted)] tabular-nums mt-0.5">
                      {p.points.map((pt) => `${formatCOP(pt.price)}: ${pt.renewal_rate}% renovó (${pt.count})`).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Aforo esperado · próximos 7 días" icon={<CalendarClock className="h-4 w-4 text-[var(--accent-checkins)]" />} right={<MethodTag method={data.occupancy?.status === "trained" ? "modelo" : undefined} />}>
          {data.occupancy?.status !== "trained" || !aforo ? <NotTrained stored={data.occupancy} /> : (
            <>
              <Heatmap cells={aforo.cells} />
              {aforo.top?.length > 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Más lleno: {aforo.top.slice(0, 3).map((t: any) => `${t.weekday_label} ${formatDate(parseDateOnly(t.date))} ${t.hour}:00 (~${Math.round(t.expected)})`).join(" · ")}
                </p>
              )}
            </>
          )}
        </Card>

        <Card title="Productos por agotarse" icon={<Boxes className="h-4 w-4 text-[var(--accent-payments)]" />} right={<MethodTag method={agotandose[0]?.method} />}>
          {agotandose.length === 0 ? <Empty text="Ningún producto se agota en las próximas 3 semanas." /> : (
            <ul className="space-y-2">
              {agotandose.map((s) => (
                <li key={s.product_id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[var(--text-base)] truncate">{s.name}</span>
                  <span className="text-xs tabular-nums shrink-0" style={{ color: (s.days_left ?? 99) <= 7 ? "var(--signal-danger)" : "var(--text-muted)" }}>
                    {s.stock} en stock · {s.days_left === 0 ? "se agota hoy" : `${s.days_left} d`}{s.runs_out_on ? ` · ${formatDate(parseDateOnly(s.runs_out_on))}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {peak && peak.total > 0 && (
        <Card title="Cuándo se llena el gym (período)" icon={<Sparkles className="h-4 w-4 text-ink-muted" />}>
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
