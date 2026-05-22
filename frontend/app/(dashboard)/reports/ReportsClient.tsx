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
        <h2 className="text-2xl font-bold text-white font-display">Reportes</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassCard key={i} className="p-5 h-40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 text-danger">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white font-display">Reportes</h2>
        <p className="text-muted text-sm mt-1">Analisis operativo del gym</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-white font-semibold text-sm">Miembros por estado</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={Object.entries(memberStatus).map(([name, value]) => ({
                name: name === "active" ? "Activos" : "Inactivos",
                value,
              }))}
              margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2D2D4A" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#1E1E35", border: "1px solid #2D2D4A", borderRadius: 8 }}
                labelStyle={{ color: "#fff", fontSize: 12 }}
                itemStyle={{ color: "#7C3AED" }}
              />
              <Bar dataKey="value" fill="#7C3AED" radius={[4, 4, 0, 0]} name="Miembros" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-success" />
            <h3 className="text-white font-semibold text-sm">Ingresos por metodo (mes)</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={Object.entries(paymentMethods).map(([name, value]) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                value,
              }))}
              margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2D2D4A" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#1E1E35", border: "1px solid #2D2D4A", borderRadius: 8 }}
                labelStyle={{ color: "#fff", fontSize: 12 }}
                itemStyle={{ color: "#10B981" }}
              />
              <Bar dataKey="value" fill="#10B981" radius={[4, 4, 0, 0]} name="Ingresos" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-blue" />
            <h3 className="text-white font-semibold text-sm">Asistencia hoy</h3>
          </div>
          <div className="flex items-center justify-center py-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-white font-display">{attendance?.total_checkins || 0}</p>
              <p className="text-muted text-xs mt-1">check-ins</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-warning" />
            <h3 className="text-white font-semibold text-sm">Membresias por vencer (7 dias)</h3>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {expiring.length === 0 ? (
              <p className="text-muted text-xs text-center py-4">Ninguna membresia por vencer</p>
            ) : (
              expiring.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1 border-b border-border-dark last:border-0">
                  <span className="text-white text-xs">{m.plan_name}</span>
                  <span className="text-warning text-xs font-medium">{m.days_remaining} dias</span>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}


