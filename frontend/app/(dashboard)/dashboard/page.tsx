"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { KPICard } from "@/components/dashboard/KPICard";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { apiClient } from "@/lib/api";
import {
  Users,
  DollarSign,
  Activity,
  AlertCircle,
  TrendingUp,
  Calendar,
} from "lucide-react";
import {
  format,
  subMonths,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  startOfToday,
  endOfToday,
} from "date-fns";
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

export default function DashboardPage() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const status = sessionData?.status;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePeriod, setActivePeriod] = useState<PeriodKey>("last_30");

  const { from: dateFrom, to: dateTo } =
    PERIODS.find((p) => p.key === activePeriod)?.getRange() ?? PERIODS[2].getRange();

  useEffect(() => {
    if (status !== "authenticated" || !session?.accessToken) {
      if (status === "unauthenticated") setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const token = session.accessToken as string;
    const client = apiClient(token);

    client
      .get("/api/v1/dashboard/kpis", {
        params: { from: dateFrom, to: dateTo },
      })
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || "Error cargando dashboard");
        setLoading(false);
      });
  }, [session, status, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="mb-6">
          <div className="skeleton h-8 w-40 rounded-lg mb-2" />
          <div className="skeleton h-4 w-56 rounded" />
        </div>
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
    return (
      <EmptyState
        title="Sin datos"
        description="No hay datos para este período"
      />
    );
  }

  const kpis = data.kpis;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
    >
      <PageHeader title="Dashboard" subtitle="Resumen operativo del gym" />

      {/* Period pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        {PERIODS.map((period) => {
          const isActive = activePeriod === period.key;
          return (
            <button
              key={period.key}
              onClick={() => setActivePeriod(period.key)}
              className={
                isActive
                  ? "rounded-full px-3 py-1 text-sm font-medium bg-orange-500 text-white transition-colors"
                  : "rounded-full px-3 py-1 text-sm font-medium bg-[var(--bg-base)] border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
              }
            >
              {period.label}
            </button>
          );
        })}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Miembros activos"
          value={kpis.active_members}
          subtitle={`${kpis.total_members} total`}
          color="blue"
          icon={<Users className="h-4 w-4" />}
        />
        <KPICard
          title="Ingresos del mes"
          value={kpis.total_payments_month}
          prefix="$"
          color="success"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title="Check-ins hoy"
          value={kpis.checkins_today}
          color="primary"
          icon={<Activity className="h-4 w-4" />}
        />
        <KPICard
          title="Pagos pendientes"
          value={kpis.pending_payments_month}
          prefix="$"
          color="danger"
          icon={<AlertCircle className="h-4 w-4" />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-2 w-2 rounded-full bg-orange-500 inline-block" />
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
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-base)",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "var(--text-base)", fontSize: 12 }}
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

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
            <h3 className="text-sm font-semibold text-[var(--text-base)]">
              Ingresos por mes
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
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
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-base)",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "var(--text-base)", fontSize: 12 }}
                itemStyle={{ color: "#22C55E" }}
              />
              <Bar
                dataKey="amount"
                fill="#22C55E"
                radius={[4, 4, 0, 0]}
                name="Ingresos"
              />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Expiring memberships banner */}
      {kpis.expiring_memberships_7d > 0 && (
        <div className="surface-1 border-l-4 border-amber-400 p-4 flex items-center gap-3">
          <Calendar className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-base)]">
              Membresías por vencer
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {kpis.expiring_memberships_7d} membresías expiran en los próximos 7 días
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
