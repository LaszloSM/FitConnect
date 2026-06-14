"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, type Variants } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { apiClient } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { AlertCircle, Users, CreditCard, Activity, Calendar, TrendingUp, UserX, Phone, Cake, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import Link from "next/link";

const chartTooltipStyle = {
  contentStyle: {
    background: "var(--bg-card)",
    border: "1px solid var(--border-base)",
    borderRadius: 8,
  },
  labelStyle: { color: "var(--text-base)", fontSize: 12 },
};

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export default function ReportsClient() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const [memberStatus, setMemberStatus] = useState<Record<string, number>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, number>>({});
  const [attendance, setAttendance] = useState<{ total_checkins: number; date: string } | null>(null);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [revenueHistory, setRevenueHistory] = useState<{ month: string; amount: number }[]>([]);
  const [inactive, setInactive] = useState<any[]>([]);
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [revenueByPlan, setRevenueByPlan] = useState<{ concept: string; total: number }[]>([]);
  const [checkinTrend, setCheckinTrend] = useState<{ week: string; count: number }[]>([]);
  const [revenueCompare, setRevenueCompare] = useState<{ current: number; previous: number; delta_pct: number | null } | null>(null);
  const [profit, setProfit] = useState<{ month: string; income: number; expenses: number; profit: number }[]>([]);
  const [retention, setRetention] = useState<{ month: string; ended: number; renewed: number; renewal_rate: number | null; churn_rate: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<null | "xlsx" | "pdf">(null);

  const downloadReport = async (format: "xlsx" | "pdf") => {
    if (!session?.accessToken) return;
    setDownloading(format);
    try {
      const client = apiClient(session.accessToken as string);
      const { data } = await client.get(`/api/v1/reports/export.${format}`, { responseType: "blob" });
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "xlsx" ? "reportes.xlsx" : "estado-resultados.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el archivo de export");
    } finally {
      setDownloading(null);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    setLoading(true);
    const client = apiClient(session.accessToken as string);
    Promise.all([
      client.get("/api/v1/reports/member-status"),
      client.get("/api/v1/reports/payment-methods"),
      client.get("/api/v1/reports/attendance-today"),
      client.get("/api/v1/reports/expiring-memberships"),
      client.get("/api/v1/reports/revenue-history"),
      client.get("/api/v1/reports/inactive-members?days=14"),
      client.get("/api/v1/reports/birthdays"),
      client.get("/api/v1/reports/revenue-by-plan"),
      client.get("/api/v1/reports/checkin-trend"),
      client.get("/api/v1/reports/revenue-compare"),
      client.get("/api/v1/reports/profit"),
      client.get("/api/v1/reports/retention"),
    ])
      .then(([ms, pm, at, em, rh, im, bd, rbp, ct, rc, pf, rt]) => {
        if (!cancelled) {
          setMemberStatus(ms.data);
          setPaymentMethods(pm.data);
          setAttendance(at.data);
          setExpiring(em.data);
          setRevenueHistory(rh.data);
          setInactive(im.data);
          setBirthdays(bd.data);
          setRevenueByPlan(rbp.data);
          setCheckinTrend(ct.data);
          setRevenueCompare(rc.data);
          setProfit(pf.data);
          setRetention(rt.data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Error cargando reportes"
          );
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="mb-6">
          <div className="skeleton h-8 w-32 rounded-lg mb-2" />
          <div className="skeleton h-4 w-48 rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`skeleton rounded-xl ${i === 0 ? "h-48 lg:col-span-2" : "h-56"}`} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader module="reports" title="Reportes" subtitle="Análisis operativo del gym" />
        <EmptyState
          icon={<AlertCircle className="h-10 w-10 text-red-500" />}
          title="Error cargando reportes"
          description={error}
        />
      </div>
    );
  }

  const memberStatusData = Object.entries(memberStatus).map(([name, value]) => ({
    name: name === "active" ? "Activos" : name === "inactive" ? "Inactivos" : name,
    value,
  }));

  const paymentMethodsData = Object.entries(paymentMethods).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader module="reports" title="Reportes" subtitle="Análisis operativo del gym" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadReport("xlsx")}
            disabled={downloading !== null}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] text-sm text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors disabled:opacity-50"
          >
            {downloading === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-500" />}
            Excel
          </button>
          <button
            type="button"
            onClick={() => void downloadReport("pdf")}
            disabled={downloading !== null}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] text-sm text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors disabled:opacity-50"
          >
            {downloading === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-red-500" />}
            PDF
          </button>
        </div>
      </div>

      {revenueCompare && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <GlassCard className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Ingresos este mes</p>
            <p className="text-lg font-bold text-[var(--text-base)]">{formatCOP(revenueCompare.current)}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Mes anterior</p>
            <p className="text-lg font-bold text-[var(--text-muted)]">{formatCOP(revenueCompare.previous)}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Variación</p>
            <p className={`text-lg font-bold ${revenueCompare.delta_pct === null ? "text-[var(--text-muted)]" : revenueCompare.delta_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {revenueCompare.delta_pct === null ? "—" : `${revenueCompare.delta_pct >= 0 ? "↑" : "↓"} ${Math.abs(revenueCompare.delta_pct)}%`}
            </p>
          </GlassCard>
        </div>
      )}

      {(() => {
        const last = [...retention].reverse().find((r) => r.renewal_rate !== null);
        if (!last) return null;
        const good = (last.renewal_rate ?? 0) >= 70;
        return (
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />
              <h3 className="text-[var(--text-base)] font-semibold text-sm">Retención de socios</h3>
              <span className="text-xs text-[var(--text-muted)]">· {last.month}</span>
            </div>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Tasa de renovación</p>
                <p className={`text-3xl font-bold font-mono ${good ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {last.renewal_rate}%
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Churn</p>
                <p className="text-xl font-bold font-mono text-[var(--text-muted)]">{last.churn_rate}%</p>
              </div>
              <p className="text-xs text-[var(--text-muted)] flex-1 min-w-[180px]">
                De {last.ended} membresía{last.ended !== 1 ? "s" : ""} que vencieron, {last.renewed} renovó
                {last.renewed !== 1 ? "n" : ""}.
              </p>
            </div>
          </GlassCard>
        );
      })()}

      {profit.length > 0 && profit.some((p) => p.expenses > 0) && (
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />
            <h3 className="text-[var(--text-base)] font-semibold text-sm">Utilidad (ingresos − egresos)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {profit.map((p) => (
              <div key={p.month} className="rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] p-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase">{p.month}</p>
                <p className={`text-sm font-bold ${p.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                  {formatCOP(p.profit)}
                </p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  +{formatCOP(p.income)} / −{formatCOP(p.expenses)}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Revenue history */}
        <motion.div variants={cardVariants} className="lg:col-span-2">
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              <h3 className="text-[var(--text-base)] font-semibold text-sm">
                Ingresos últimos 6 meses
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueHistory} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("es-CO", {
                      notation: "compact",
                      compactDisplay: "short",
                    }).format(v)
                  }
                />
                <Tooltip
                  {...chartTooltipStyle}
                  itemStyle={{ color: "#22C55E" }}
                  formatter={(value) => [formatCOP(Number(value) || 0), "Ingresos"]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#22C55E"
                  strokeWidth={2}
                  fill="#22C55E"
                  fillOpacity={0.12}
                  name="Ingresos"
                />
              </AreaChart>
            </ResponsiveContainer>
          </GlassCard>
        </motion.div>

        {/* Revenue by plan/concept */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-4 w-4 text-violet-500" aria-hidden="true" />
              <h3 className="text-[var(--text-base)] font-semibold text-sm">
                Ingresos por concepto (mes actual)
              </h3>
            </div>
            {revenueByPlan.length === 0 ? (
              <p className="text-[var(--text-muted)] text-xs text-center py-8">Sin ingresos registrados este mes</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueByPlan} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => new Intl.NumberFormat("es-CO", { notation: "compact", compactDisplay: "short" }).format(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="concept"
                    tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    {...chartTooltipStyle}
                    itemStyle={{ color: "oklch(0.65 0.22 300)" }}
                    formatter={(value) => [formatCOP(Number(value) || 0), "Ingresos"]}
                  />
                  <Bar dataKey="total" fill="oklch(0.65 0.22 300)" radius={[0, 4, 4, 0]} name="Total" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </GlassCard>
        </motion.div>

        {/* Check-in trend */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-blue-500" aria-hidden="true" />
              <h3 className="text-[var(--text-base)] font-semibold text-sm">
                Tendencia de asistencia (8 semanas)
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={checkinTrend} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  {...chartTooltipStyle}
                  itemStyle={{ color: "#3B82F6" }}
                  formatter={(v) => [v, "Check-ins"]}
                />
                <Area type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2} fill="#3B82F6" fillOpacity={0.1} name="Check-ins" />
              </AreaChart>
            </ResponsiveContainer>
          </GlassCard>
        </motion.div>

        {/* Member status chart */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />
              <h3 className="text-[var(--text-base)] font-semibold text-sm">
                Miembros por estado
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={memberStatusData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip {...chartTooltipStyle} itemStyle={{ color: "var(--color-primary)" }} />
                <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Miembros" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </motion.div>

        {/* Payment methods chart */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-4 w-4 text-green-500" aria-hidden="true" />
              <h3 className="text-[var(--text-base)] font-semibold text-sm">
                Ingresos por método (mes)
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={paymentMethodsData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip {...chartTooltipStyle} itemStyle={{ color: "#22C55E" }} />
                <Bar dataKey="value" fill="#22C55E" radius={[4, 4, 0, 0]} name="Ingresos" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </motion.div>

        {/* Attendance today */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-blue-500" aria-hidden="true" />
              <h3 className="text-[var(--text-base)] font-semibold text-sm">
                Asistencia hoy
              </h3>
            </div>
            <div className="flex items-center justify-center py-6">
              <div className="text-center">
                <p className="text-5xl font-bold text-[var(--text-base)] font-mono tabular-nums">
                  {attendance?.total_checkins ?? 0}
                </p>
                <p className="text-[var(--text-muted)] text-xs mt-2 uppercase tracking-wider">
                  check-ins registrados
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Inactive members (retention) */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserX className="h-4 w-4 text-purple-500" aria-hidden="true" />
                <h3 className="text-[var(--text-base)] font-semibold text-sm">
                  Sin visita — 14 días
                </h3>
              </div>
              {inactive.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-800/60">
                  {inactive.length} miembro{inactive.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {inactive.length === 0 ? (
                <p className="text-[var(--text-muted)] text-xs text-center py-6">
                  Todos los miembros activos han visitado esta semana
                </p>
              ) : (
                inactive.map((item) => (
                  <Link
                    key={item.id}
                    href={`/members/${item.id}`}
                    className="flex items-center justify-between py-2 px-3 surface-1 rounded-lg hover:bg-[var(--bg-muted)] transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[var(--text-base)] text-xs font-medium truncate group-hover:text-purple-500 transition-colors">
                        {item.full_name}
                      </p>
                      {item.phone && (
                        <p className="text-[var(--text-muted)] text-[10px] flex items-center gap-1 truncate">
                          <Phone className="h-2.5 w-2.5 shrink-0" />
                          {item.phone}
                        </p>
                      )}
                    </div>
                    <span className="text-purple-600 dark:text-purple-400 text-xs font-medium ml-3 shrink-0 tabular-nums">
                      {item.days_inactive !== null ? `${item.days_inactive}d` : "Nunca"}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* Birthdays this month */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Cake className="h-4 w-4 text-pink-500" aria-hidden="true" />
                <h3 className="text-[var(--text-base)] font-semibold text-sm">
                  Cumpleaños próximos
                </h3>
              </div>
              {birthdays.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 ring-1 ring-pink-200 dark:ring-pink-800/60">
                  {birthdays.length} este mes
                </span>
              )}
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {birthdays.length === 0 ? (
                <p className="text-[var(--text-muted)] text-xs text-center py-6">
                  Sin cumpleaños en los próximos 30 días
                </p>
              ) : (
                birthdays.map((item) => (
                  <Link
                    key={item.id}
                    href={`/members/${item.id}`}
                    className="flex items-center justify-between py-2 px-3 surface-1 rounded-lg hover:bg-[var(--bg-muted)] transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[var(--text-base)] text-xs font-medium truncate group-hover:text-pink-500 transition-colors">
                        {item.full_name}
                      </p>
                      {item.phone && (
                        <p className="text-[var(--text-muted)] text-[10px] flex items-center gap-1 truncate">
                          <Phone className="h-2.5 w-2.5 shrink-0" />
                          {item.phone}
                        </p>
                      )}
                    </div>
                    <span
                      className={
                        item.days_until === 0
                          ? "text-pink-600 dark:text-pink-400 text-xs font-bold ml-3 shrink-0"
                          : "text-[var(--text-muted)] text-xs ml-3 shrink-0 tabular-nums"
                      }
                    >
                      {item.days_until === 0 ? "¡Hoy!" : `en ${item.days_until}d`}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* Expiring memberships */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <h3 className="text-[var(--text-base)] font-semibold text-sm">
                Membresías por vencer (7 días)
              </h3>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {expiring.length === 0 ? (
                <p className="text-[var(--text-muted)] text-xs text-center py-6">
                  Ninguna membresía por vencer esta semana
                </p>
              ) : (
                expiring.map((item) => (
                  <Link
                    key={item.id}
                    href={`/members/${item.member_id}`}
                    className="flex items-center justify-between py-2 px-3 surface-1 rounded-lg hover:bg-[var(--bg-muted)] transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[var(--text-base)] text-xs font-medium truncate group-hover:text-[var(--color-primary)] transition-colors">
                        {item.member_name}
                      </p>
                      <p className="text-[var(--text-muted)] text-[10px] truncate">
                        {item.plan_name}
                      </p>
                    </div>
                    <span
                      className={
                        item.days_remaining <= 2
                          ? "text-red-500 text-xs font-semibold ml-3 shrink-0"
                          : "text-amber-600 dark:text-amber-400 text-xs font-medium ml-3 shrink-0"
                      }
                    >
                      {item.days_remaining === 0
                        ? "Hoy"
                        : item.days_remaining === 1
                        ? "Mañana"
                        : `${item.days_remaining}d`}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
