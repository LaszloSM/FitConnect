"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { apiClient } from "@/lib/api";
import { AlertCircle, Users, CreditCard, Activity, Calendar } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const chartTooltipStyle = {
  contentStyle: {
    background: "var(--bg-card)",
    border: "1px solid var(--border-base)",
    borderRadius: 8,
  },
  labelStyle: { color: "var(--text-base)", fontSize: 12 },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
};

export default function ReportsClient() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const [memberStatus, setMemberStatus] = useState<Record<string, number>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, number>>({});
  const [attendance, setAttendance] = useState<{ total_checkins: number; date: string } | null>(null);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    ])
      .then(([ms, pm, at, em]) => {
        if (!cancelled) {
          setMemberStatus(ms.data);
          setPaymentMethods(pm.data);
          setAttendance(at.data);
          setExpiring(em.data);
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
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reportes" subtitle="Análisis operativo del gym" />
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
      <PageHeader title="Reportes" subtitle="Análisis operativo del gym" />

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Member status chart */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-orange-500" aria-hidden="true" />
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
                <Tooltip {...chartTooltipStyle} itemStyle={{ color: "oklch(0.70 0.20 47)" }} />
                <Bar dataKey="value" fill="oklch(0.70 0.20 47)" radius={[4, 4, 0, 0]} name="Miembros" />
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
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 px-3 surface-1 rounded-lg"
                  >
                    <span className="text-[var(--text-base)] text-xs font-medium">
                      {item.plan_name}
                    </span>
                    <span
                      className={
                        item.days_remaining <= 2
                          ? "text-red-500 text-xs font-semibold"
                          : "text-amber-600 dark:text-amber-400 text-xs font-medium"
                      }
                    >
                      {item.days_remaining === 0
                        ? "Hoy"
                        : item.days_remaining === 1
                        ? "Mañana"
                        : `${item.days_remaining} días`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
