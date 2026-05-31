"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { KpiCard } from "@/components/ui/kpi-card";
import { GlassCard } from "@/components/common/GlassCard";
import { EmptyState } from "@/components/common/EmptyState";
import { apiClient } from "@/lib/api";
import Link from "next/link";
import {
  Users,
  DollarSign,
  Activity,
  AlertCircle,
  Calendar,
  TrendingUp,
  ArrowRight,
  Wrench,
  Dumbbell,
} from "lucide-react";
import {
  format,
  subMonths,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfToday,
  endOfToday,
} from "date-fns";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface DashboardData {
  kpis: {
    total_members: number;
    active_members: number;
    inactive_members: number;
    new_members_this_month: number;
    total_payments_month: number;
    pending_payments_month: number;
    checkins_today: number;
    expiring_memberships_7d: number;
    machines_total: number;
    machines_active: number;
    machines_maintenance: number;
  };
  member_growth: { month: string; count: number }[];
  revenue_history: { month: string; amount: number }[];
}

type PeriodKey = "today" | "this_month" | "last_30" | "last_3_months";

interface Period {
  key: PeriodKey;
  label: string;
  getRange: () => { from: string; to: string };
}

const PERIODS: Period[] = [
  {
    key: "today",
    label: "Hoy",
    getRange: () => ({
      from: format(startOfToday(), "yyyy-MM-dd"),
      to: format(endOfToday(), "yyyy-MM-dd"),
    }),
  },
  {
    key: "this_month",
    label: "Este mes",
    getRange: () => ({
      from: format(startOfMonth(new Date()), "yyyy-MM-dd"),
      to: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    }),
  },
  {
    key: "last_30",
    label: "Últimos 30 días",
    getRange: () => ({
      from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    }),
  },
  {
    key: "last_3_months",
    label: "Últimos 3 meses",
    getRange: () => ({
      from: format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd"),
      to: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    }),
  },
];

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--bg-card)",
    border: "1px solid var(--border-base)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--text-base)" },
};

const WEEKDAY_MAP: Record<number, string> = {
  0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb",
};

export default function DashboardPage() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const status = sessionData?.status;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePeriod, setActivePeriod] = useState<PeriodKey>("last_30");
  const [todayClasses, setTodayClasses] = useState<any[]>([]);

  const { from: dateFrom, to: dateTo } =
    PERIODS.find((p) => p.key === activePeriod)?.getRange() ?? PERIODS[2].getRange();

  useEffect(() => {
    if (status !== "authenticated" || !session?.accessToken) {
      if (status === "unauthenticated") setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");

    const token = session.accessToken as string;
    const client = apiClient(token);

    // Fire-and-forget: generate expiry notifications once on load
    client.post("/api/v1/reports/generate-expiry-notifications").catch(() => {});

    // Fetch today's classes (filter by weekday on frontend)
    const todayWeekday = new Date().getDay(); // 0=Sun...6=Sat
    client.get("/api/v1/classes", { params: { is_active: true, limit: 50 } })
      .then((res) => {
        const classes = res.data as any[];
        // GymClass.weekdays: number[] where 0=Mon...6=Sun (adjusted from JS 0=Sun)
        // JS getDay(): 0=Sun, 1=Mon...6=Sat → convert to 0=Mon...6=Sun for matching
        const gymWeekday = todayWeekday === 0 ? 6 : todayWeekday - 1;
        const filtered = classes.filter((c: any) =>
          Array.isArray(c.weekdays) && c.weekdays.includes(gymWeekday)
        );
        setTodayClasses(filtered);
      })
      .catch(() => {});

    client
      .get("/api/v1/dashboard/kpis", {
        params: { from: dateFrom, to: dateTo },
        signal: controller.signal,
      })
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "CanceledError") return;
        setError(err.response?.data?.detail || "Error cargando dashboard");
        setLoading(false);
      });

    return () => controller.abort();
  }, [session, status, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2 flex-wrap mb-6">
          {PERIODS.map((p) => (
            <div key={p.key} className="skeleton h-7 w-24 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton h-64 rounded-xl" />
          <div className="skeleton h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-10 w-10 text-red-500" />}
        title="Error cargando datos"
        description={error}
      />
    );
  }

  if (!data) {
    return <EmptyState title="Sin datos" description="No hay datos para este período" />;
  }

  const kpis = data.kpis;
  const activeRate =
    kpis.total_members > 0
      ? Math.round((kpis.active_members / kpis.total_members) * 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
    >
      {/* Period pills */}
      <div className="flex gap-2 flex-wrap mb-6" role="group" aria-label="Seleccionar período">
        {PERIODS.map((period) => {
          const isActive = activePeriod === period.key;
          return (
            <button
              key={period.key}
              onClick={() => setActivePeriod(period.key)}
              aria-pressed={isActive}
              className={
                isActive
                  ? "rounded-full px-3 py-1 text-sm font-medium bg-[var(--color-primary)] text-white transition-colors"
                  : "rounded-full px-3 py-1 text-sm font-medium bg-[var(--bg-muted)] border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
              }
            >
              {period.label}
            </button>
          );
        })}
      </div>

      {/* KPI grid — 21st Magic KpiCard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Miembros activos"
          value={kpis.active_members}
          caption={`${activeRate}% del total (${kpis.total_members})`}
          tone="primary"
          icon={<Users className="h-4 w-4 text-orange-500" />}
        />
        <KpiCard
          label="Ingresos del mes"
          value={formatCOP(kpis.total_payments_month)}
          caption={
            kpis.pending_payments_month > 0
              ? `${formatCOP(kpis.pending_payments_month)} pendiente`
              : "Sin pagos pendientes"
          }
          trend={kpis.total_payments_month > 0 ? "up" : "flat"}
          tone="success"
          icon={<DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
        />
        <KpiCard
          label="Check-ins hoy"
          value={kpis.checkins_today}
          caption="Asistencia del día"
          tone="default"
          icon={<Activity className="h-4 w-4 text-[var(--text-muted)]" />}
        />
        <KpiCard
          label="Nuevos este mes"
          value={kpis.new_members_this_month}
          caption="Miembros registrados"
          trend={kpis.new_members_this_month > 0 ? "up" : "flat"}
          delta={kpis.new_members_this_month > 0 ? kpis.new_members_this_month : undefined}
          tone="warning"
          icon={<TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Revenue — AreaChart */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
              <h3 className="text-sm font-semibold text-[var(--text-base)]">
                Ingresos por mes
              </h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={data.revenue_history}
              margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border-base)"
                vertical={false}
              />
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
                {...tooltipStyle}
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

        {/* Member growth — BarChart */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-2 w-2 rounded-full bg-[var(--color-primary)] inline-block" />
            <h3 className="text-sm font-semibold text-[var(--text-base)]">
              Crecimiento de miembros
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={data.member_growth}
              margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border-base)"
                vertical={false}
              />
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
              />
              <Tooltip
                {...tooltipStyle}
                itemStyle={{ color: "oklch(0.70 0.20 47)" }}
              />
              <Bar
                dataKey="count"
                fill="oklch(0.70 0.20 47)"
                radius={[4, 4, 0, 0]}
                name="Miembros"
              />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Today's classes */}
      {todayClasses.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Dumbbell className="h-4 w-4 text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold text-[var(--text-base)]">
              Clases de hoy — {WEEKDAY_MAP[new Date().getDay()]}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {todayClasses.map((c: any) => (
              <Link key={c.id} href="/classes">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)] hover:border-orange-300 dark:hover:border-orange-700 transition-colors cursor-pointer"
                  style={c.color ? { borderLeftColor: c.color, borderLeftWidth: 3 } : {}}
                >
                  <div>
                    <p className="text-xs font-medium text-[var(--text-base)]">{c.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {c.start_time ? c.start_time.slice(0, 5) : "—"} · {c.instructor}
                    </p>
                  </div>
                  <span className="ml-2 text-[10px] text-[var(--text-muted)] border border-[var(--border-base)] rounded px-1.5 py-0.5 shrink-0">
                    {c.duration_minutes}min
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Machine health widget — only if there are machines and some in trouble */}
      {kpis.machines_total > 0 && kpis.machines_maintenance > 0 && (
        <Link href="/machines" className="block">
          <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20 p-4 flex items-center gap-3 hover:border-red-300 dark:hover:border-red-700/60 transition-colors cursor-pointer group">
            <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <Wrench className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                Equipos fuera de servicio
              </p>
              <p className="text-xs text-red-700/80 dark:text-red-400/80 mt-0.5">
                {kpis.machines_maintenance} de {kpis.machines_total}{" "}
                {kpis.machines_maintenance === 1 ? "equipo en mantenimiento o dañado" : "equipos en mantenimiento o dañados"}{" "}
                — ir a Máquinas
              </p>
            </div>
            <div className="text-sm font-bold text-red-600 dark:text-red-400 shrink-0">
              {kpis.machines_active}/{kpis.machines_total}
            </div>
            <ArrowRight className="h-4 w-4 text-red-600 dark:text-red-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      )}

      {/* Expiring memberships alert */}
      {kpis.expiring_memberships_7d > 0 && (
        <Link href="/members" className="block">
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-center gap-3 hover:border-amber-300 dark:hover:border-amber-700/60 transition-colors cursor-pointer group">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Membresías por vencer
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                {kpis.expiring_memberships_7d}{" "}
                {kpis.expiring_memberships_7d === 1 ? "membresía expira" : "membresías expiran"} en
                los próximos 7 días — ir a Miembros
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      )}
    </motion.div>
  );
}
