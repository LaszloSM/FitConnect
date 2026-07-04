"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { KpiCard } from "@/components/ui/kpi-card";
import { GlassCard } from "@/components/common/GlassCard";
import { AreaChartCard } from "@/components/common/AreaChartCard";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { OperationsToday } from "@/components/dashboard/OperationsToday";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { InsightsStrip } from "@/components/dashboard/InsightsStrip";
import { LiveNowStrip } from "@/components/dashboard/LiveNowStrip";
import { apiClient } from "@/lib/api";
import { formatCOP } from "@/lib/format";
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
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfToday,
  endOfToday,
} from "date-fns";
import { es } from "date-fns/locale";
import {
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

type PeriodKey = "today" | "this_week" | "this_month" | "last_3_months";

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
    key: "this_week",
    label: "Esta semana",
    getRange: () => ({
      from: format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
      to: format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
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
    key: "last_3_months",
    label: "Últimos 3 meses",
    getRange: () => ({
      from: format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd"),
      to: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    }),
  },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

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
  const [activePeriod, setActivePeriod] = useState<PeriodKey>("this_month");
  const [todayClasses, setTodayClasses] = useState<any[]>([]);

  const { from: dateFrom, to: dateTo } =
    PERIODS.find((p) => p.key === activePeriod)?.getRange() ?? PERIODS[2].getRange();

  const firstName = session?.user?.name?.split(" ")[0] ?? "";

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

    client.post("/api/v1/reports/generate-expiry-notifications").catch(() => {});

    const todayWeekday = new Date().getDay();
    client.get("/api/v1/classes", { params: { is_active: true, limit: 50 } })
      .then((res) => {
        const classes = res.data as any[];
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
        <div className="skeleton h-12 w-72 rounded-lg mb-6" />
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
      <PageHeader
        module="dashboard"
        eyebrow={format(new Date(), "EEEE · d 'de' MMMM", { locale: es })}
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        action={
          <div className="flex gap-1.5 flex-wrap justify-end" role="group" aria-label="Seleccionar período">
            {PERIODS.map((period) => {
              const isActive = activePeriod === period.key;
              return (
                <button
                  key={period.key}
                  onClick={() => setActivePeriod(period.key)}
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? "rounded-lg px-3 py-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-primary-contrast)] transition-colors"
                      : "rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--bg-muted)] border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
                  }
                >
                  {period.label}
                </button>
              );
            })}
          </div>
        }
      />

      <OnboardingChecklist />

      {/* Centro de comando: lo de HOY primero, en vivo */}
      <LiveNowStrip expiring7d={kpis.expiring_memberships_7d} />

      <InsightsStrip />

      {/* La operación del día es la protagonista */}
      <OperationsToday />

      {/* Today's classes */}
      {todayClasses.length > 0 && (
        <GlassCard className="p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Dumbbell className="h-4 w-4 text-[var(--accent-classes)]" />
            <h3 className="text-sm font-semibold text-[var(--text-base)]">
              Clases de hoy — {WEEKDAY_MAP[new Date().getDay()]}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {todayClasses.map((c: any) => (
              <Link key={c.id} href="/classes">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)] hover:border-[var(--accent-classes)] transition-colors cursor-pointer">
                  {c.color && (
                    <span
                      className="h-6 w-1 rounded-full shrink-0"
                      style={{ background: c.color }}
                      aria-hidden
                    />
                  )}
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

      {/* Análisis del período seleccionado (arriba a la derecha) */}
      <div className="mt-6 mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[var(--text-muted)] inline-block" />
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Análisis del período
        </h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          tone="teal"
          label="Miembros activos"
          value={kpis.active_members}
          caption={`${activeRate}% del total (${kpis.total_members})`}
          icon={<Users className="h-full w-full" />}
          sparklineData={data.member_growth.map((p) => p.count)}
        />
        <KpiCard
          tone="emerald"
          label="Ingresos del período"
          value={formatCOP(kpis.total_payments_month)}
          caption="Pagos confirmados"
          trend={kpis.total_payments_month > 0 ? "up" : "flat"}
          icon={<DollarSign className="h-full w-full" />}
          sparklineData={data.revenue_history.map((p) => p.amount)}
        />
        <KpiCard
          tone="amber"
          label="Pendiente por cobrar"
          value={formatCOP(kpis.pending_payments_month)}
          caption="Pagos sin confirmar del período"
          icon={<Activity className="h-full w-full" />}
        />
        <KpiCard
          tone="volt"
          label="Nuevos en el período"
          value={kpis.new_members_this_month}
          caption="Miembros registrados"
          trend={kpis.new_members_this_month > 0 ? "up" : "flat"}
          delta={kpis.new_members_this_month > 0 ? kpis.new_members_this_month : undefined}
          icon={<TrendingUp className="h-full w-full" />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <AreaChartCard
          title="Ingresos por mes"
          color="var(--accent-payments)"
          data={data.revenue_history}
          xKey="month"
          dataKey="amount"
          seriesName="Ingresos"
          valueFormatter={(v) => formatCOP(v)}
          yTickFormatter={(v) =>
            new Intl.NumberFormat("es-CO", {
              notation: "compact",
              compactDisplay: "short",
            }).format(v)
          }
        />

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-2 w-2 rounded-full bg-[var(--color-primary)] inline-block" />
            <h3 className="text-sm font-semibold text-[var(--text-base)]">
              Crecimiento de miembros
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.member_growth} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
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
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-base)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--text-base)" }}
                itemStyle={{ color: "var(--color-primary)" }}
              />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Miembros" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      <div className="space-y-3">
        {/* Machine health */}
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

        {/* Expiring memberships */}
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
      </div>
    </motion.div>
  );
}
