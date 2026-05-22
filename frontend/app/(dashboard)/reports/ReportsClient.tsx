"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { GlassCard } from "@/components/common/GlassCard";
import { apiClient } from "@/lib/api";
import { AlertCircle, Users, CreditCard, Activity, Calendar } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const chartTooltipStyle = {
  contentStyle: { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)" },
  labelStyle: { color: "#1E293B", fontSize: 12 },
};

export default function ReportsClient() {
  const sessionData = useSession(); const session = sessionData?.data;
  const [memberStatus, setMemberStatus] = useState<Record<string, number>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, number>>({});
  const [attendance, setAttendance] = useState<{ total_checkins: number; date: string } | null>(null);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    Promise.all([
      client.get("/api/v1/reports/member-status"),
      client.get("/api/v1/reports/payment-methods"),
      client.get("/api/v1/reports/attendance-today"),
      client.get("/api/v1/reports/expiring-memberships"),
    ])
      .then(([ms, pm, at, em]) => {
        setMemberStatus(ms.data);
        setPaymentMethods(pm.data);
        setAttendance(at.data);
        setExpiring(em.data);
      })
      .catch((err) => setError(err.response?.data?.detail || "Error cargando reportes"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800 font-display">Reportes</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-200 rounded-xl h-40 animate-pulse" />
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 font-display">Reportes</h2>
        <p className="text-slate-500 text-sm mt-1">Análisis operativo del gym</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-orange-500" />
            <h3 className="text-slate-700 font-semibold text-sm">Miembros por estado</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={Object.entries(memberStatus).map(([name, value]) => ({
                name: name === "active" ? "Activos" : "Inactivos", value,
              }))}
              margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...chartTooltipStyle} itemStyle={{ color: "#7C3AED" }} />
              <Bar dataKey="value" fill="#7C3AED" radius={[4, 4, 0, 0]} name="Miembros" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-green-500" />
            <h3 className="text-slate-700 font-semibold text-sm">Ingresos por método (mes)</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={Object.entries(paymentMethods).map(([name, value]) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1), value,
              }))}
              margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...chartTooltipStyle} itemStyle={{ color: "#22C55E" }} />
              <Bar dataKey="value" fill="#22C55E" radius={[4, 4, 0, 0]} name="Ingresos" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-blue-500" />
            <h3 className="text-slate-700 font-semibold text-sm">Asistencia hoy</h3>
          </div>
          <div className="flex items-center justify-center py-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-slate-800 font-display">{attendance?.total_checkins || 0}</p>
              <p className="text-slate-400 text-xs mt-1">check-ins</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-amber-500" />
            <h3 className="text-slate-700 font-semibold text-sm">Membresías por vencer (7 días)</h3>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {expiring.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-4">Ninguna membresía por vencer</p>
            ) : (
              expiring.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-slate-700 text-xs">{m.plan_name}</span>
                  <span className="text-amber-600 text-xs font-medium">{m.days_remaining} días</span>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
