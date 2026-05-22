"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { KPICard } from "@/components/dashboard/KPICard";
import { GlassCard } from "@/components/common/GlassCard";
import { apiClient } from "@/lib/api";
import { Users, DollarSign, Activity, AlertCircle, TrendingUp, Calendar } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
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

export default function DashboardPage() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const status = sessionData?.status;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState(() =>
    format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd")
  );
  const [dateTo, setDateTo] = useState(() =>
    format(endOfMonth(new Date()), "yyyy-MM-dd")
  );

  useEffect(() => {
    if (status !== "authenticated" || !session?.accessToken) {
      if (status === "unauthenticated") setLoading(false);
      return;
    }

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
        <div>
          <h2 className="text-2xl font-bold text-slate-800 font-display">Dashboard</h2>
          <p className="text-slate-500 text-sm mt-1">Resumen operativo del gym</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-200 rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      </GlassCard>
    );
  }

  if (!data) {
    return (
      <GlassCard className="p-6">
        <p className="text-slate-400">No hay datos disponibles</p>
      </GlassCard>
    );
  }

  const kpis = data.kpis;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 font-display">Dashboard</h2>
        <p className="text-slate-500 text-sm mt-1">Resumen operativo del gym</p>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-slate-500 text-sm">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-slate-500 text-sm">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Miembros activos"
          value={kpis.active_members}
          subtitle={`${kpis.total_members} total`}
          color="info"
          icon={<Users className="h-4 w-4" />}
        />
        <KPICard
          title="Ingresos mes"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            <h3 className="text-slate-700 font-semibold text-sm">Crecimiento de miembros</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.member_growth} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)" }}
                labelStyle={{ color: "#1E293B", fontSize: 12 }}
                itemStyle={{ color: "#7C3AED" }}
              />
              <Bar dataKey="count" fill="#7C3AED" radius={[4, 4, 0, 0]} name="Miembros" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-green-500" />
            <h3 className="text-slate-700 font-semibold text-sm">Ingresos por mes</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.revenue_history} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)" }}
                labelStyle={{ color: "#1E293B", fontSize: 12 }}
                itemStyle={{ color: "#22C55E" }}
              />
              <Bar dataKey="amount" fill="#22C55E" radius={[4, 4, 0, 0]} name="Ingresos" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {kpis.expiring_memberships_7d > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-amber-700 text-sm font-medium">
              {kpis.expiring_memberships_7d} membresías expiran en los próximos 7 días
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
