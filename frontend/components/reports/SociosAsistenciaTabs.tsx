/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { Activity, Cake, Calendar, Phone, Users, UserX } from "lucide-react";
import type { Period } from "./PeriodPicker";
import { Card, Empty, TabSkeleton, Tile, chartTooltipStyle, containerVariants, cardVariants, usePeriodData } from "./shared";

interface Overview {
  total: number; active_accounts: number; new_in_period: number; visitors: number;
  by_membership_status: Record<string, number>;
  new_list: { full_name: string; phone: string; created_at: string }[];
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: "Activa", color: "#22C55E" },
  scheduled: { label: "Programada", color: "#8B5CF6" },
  frozen: { label: "Congelada", color: "#0EA5E9" },
  in_grace: { label: "En gracia", color: "#F59E0B" },
  expired: { label: "Vencida", color: "#EF4444" },
  no_membership: { label: "Sin membresía", color: "#9CA3AF" },
};

function PersonList({ items, empty, right, tone }: { items: any[]; empty: string; right: (i: any) => React.ReactNode; tone: string }) {
  if (items.length === 0) return <Empty text={empty} />;
  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
      {items.map((item, idx) => (
        <Link key={item.id ?? item.member_id ?? idx} href={`/members/${item.id ?? item.member_id ?? ""}`} className="flex items-center justify-between py-2 px-3 surface-1 rounded-lg hover:bg-[var(--bg-muted)] transition-colors group">
          <div className="min-w-0 flex-1">
            <p className={cn("text-[var(--text-base)] text-xs font-medium truncate transition-colors", tone)}>{item.full_name ?? item.member_name}</p>
            {(item.phone || item.plan_name) && (
              <p className="text-[var(--text-muted)] text-[10px] flex items-center gap-1 truncate">{item.phone && <Phone className="h-2.5 w-2.5 shrink-0" />}{item.phone ?? item.plan_name}</p>
            )}
          </div>
          {right(item)}
        </Link>
      ))}
    </div>
  );
}

export function SociosTab({ period }: { period: Period }) {
  const { data, loading, error } = usePeriodData<{ overview: Overview; expiring: any[]; inactive: any[]; birthdays: any[] }>({
    overview: "/api/v1/reports/members-overview",
    expiring: "/api/v1/reports/expiring-memberships?days=14",
    inactive: "/api/v1/reports/inactive-members?days=14",
    birthdays: "/api/v1/reports/birthdays",
  }, period);
  if (loading && !data.overview) return <TabSkeleton />;
  if (error) return <Empty text={error} />;
  const o = data.overview!;
  const statusData = Object.entries(o.by_membership_status).filter(([, v]) => v > 0).map(([k, v]) => ({ name: STATUS_LABEL[k]?.label ?? k, value: v, color: STATUS_LABEL[k]?.color ?? "#999" }));

  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={cardVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Socios registrados" value={String(o.total)} hint={`${o.active_accounts} con cuenta activa`} />
        <Tile label="Con membresía activa" value={String(o.by_membership_status.active ?? 0)} tone="positive" />
        <Tile label="Nuevos en el período" value={String(o.new_in_period)} tone={o.new_in_period > 0 ? "positive" : "muted"} />
        <Tile label="Visitantes (pase del día)" value={String(o.visitors)} tone="muted" />
      </motion.div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Socios activos por estado de membresía" icon={<Users className="h-4 w-4 text-[var(--color-primary)]" />}>
          {statusData.length === 0 ? <Empty text="Sin socios activos" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...chartTooltipStyle} />
                <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Socios" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Nuevos en el período" icon={<Users className="h-4 w-4 text-emerald-500" />}>
          <PersonList items={o.new_list} empty="Nadie se registró en el período" tone="group-hover:text-emerald-500" right={(i) => <span className="text-xs text-[var(--text-muted)] ml-3 shrink-0">{i.created_at}</span>} />
        </Card>
        <Card title="Por vencer (14 días)" icon={<Calendar className="h-4 w-4 text-amber-500" />}>
          <PersonList items={data.expiring ?? []} empty="Ninguna membresía por vencer en dos semanas" tone="group-hover:text-amber-500" right={(i) => (
            <span className={i.days_remaining <= 2 ? "text-red-500 text-xs font-semibold ml-3 shrink-0" : "text-amber-600 dark:text-amber-400 text-xs font-medium ml-3 shrink-0"}>
              {i.days_remaining === 0 ? "Hoy" : i.days_remaining === 1 ? "Mañana" : `${i.days_remaining}d`}
            </span>
          )} />
        </Card>
        <Card title="Sin venir hace 14+ días" icon={<UserX className="h-4 w-4 text-purple-500" />}>
          <PersonList items={data.inactive ?? []} empty="Todos los socios activos han venido" tone="group-hover:text-purple-500" right={(i) => <span className="text-purple-600 dark:text-purple-400 text-xs font-medium ml-3 shrink-0 tabular-nums">{i.days_inactive !== null ? `${i.days_inactive}d` : "Nunca"}</span>} />
        </Card>
        <Card title="Cumpleaños próximos" icon={<Cake className="h-4 w-4 text-pink-500" />} className="lg:col-span-2">
          <PersonList items={data.birthdays ?? []} empty="Sin cumpleaños en los próximos 30 días" tone="group-hover:text-pink-500" right={(i) => <span className={i.days_until === 0 ? "text-pink-600 dark:text-pink-400 text-xs font-bold ml-3 shrink-0" : "text-[var(--text-muted)] text-xs ml-3 shrink-0 tabular-nums"}>{i.days_until === 0 ? "¡Hoy!" : `en ${i.days_until}d`}</span>} />
        </Card>
      </div>
    </motion.div>
  );
}

interface Attendance {
  total: number; denied: number; unique_members: number;
  daily: { date: string; count: number }[];
  by_source: { source: string; count: number }[];
  peak: { cells: { weekday: number; weekday_label: string; hour: number; count: number }[]; by_hour: { hour: number; count: number }[]; by_weekday: { weekday: number; label: string; count: number }[]; busiest_hour: number | null; busiest_weekday: number | null; top: any[] };
}

const SOURCE_LABEL: Record<string, string> = { kiosk: "Kiosko", reception: "Recepción", qr: "QR", turnstile: "Torniquete", biometric: "Biometría" };

export function Heatmap({ cells, compactHours = true }: { cells: Attendance["peak"]["cells"]; compactHours?: boolean }) {
  const max = Math.max(1, ...cells.map((c) => c.count));
  const hours = compactHours ? Array.from({ length: 24 }, (_, h) => h).filter((h) => cells.some((c) => c.hour === h && c.count > 0) || (h >= 5 && h <= 22)) : Array.from({ length: 24 }, (_, h) => h);
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `36px repeat(${hours.length}, minmax(14px, 1fr))` }}>
        <div />
        {hours.map((h) => <div key={h} className="text-[9px] text-center text-[var(--text-muted)]">{h}</div>)}
        {days.map((d, di) => (
          <div key={d} className="contents">
            <div className="text-[10px] text-[var(--text-muted)] pr-1 flex items-center">{d}</div>
            {hours.map((h) => {
              const c = cells.find((x) => x.weekday === di && x.hour === h);
              const v = c?.count ?? 0;
              const alpha = v ? 0.15 + 0.85 * (v / max) : 0;
              return <div key={h} title={`${d} ${h}:00 · ${v}`} className="h-4 rounded-sm" style={{ background: v ? `rgba(212, 255, 0, ${alpha})` : "var(--bg-muted)", outline: v === max ? "1px solid var(--color-primary)" : undefined }} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AsistenciaTab({ period }: { period: Period }) {
  const { data, loading, error } = usePeriodData<{ a: Attendance }>({ a: "/api/v1/reports/attendance" }, period);
  if (loading && !data.a) return <TabSkeleton />;
  if (error) return <Empty text={error} />;
  const a = data.a!;
  const daily = a.daily.map((d) => ({ ...d, label: d.date.slice(5).split("-").reverse().join("/") }));
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={cardVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Ingresos al gym" value={String(a.total)} tone="positive" hint={`${a.daily.length ? (a.total / a.daily.length < 0.1 && a.total > 0 ? "<0.1" : (a.total / a.daily.length).toFixed(1)) : 0} por día`} />
        <Tile label="Personas distintas" value={String(a.unique_members)} />
        <Tile label="Accesos denegados" value={String(a.denied)} tone={a.denied > 0 ? "warning" : "muted"} />
        <Tile label="Hora pico" value={a.peak.busiest_hour === null ? "—" : `${days[a.peak.busiest_weekday!]} ${a.peak.busiest_hour}:00`} />
      </motion.div>
      <Card title="Ingresos por día" icon={<Activity className="h-4 w-4 text-blue-500" />}>
        {a.total === 0 ? <Empty text="Sin ingresos en el período" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={daily} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...chartTooltipStyle} formatter={(v: any) => [v, "Ingresos"]} />
              <Area type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2} fill="#3B82F6" fillOpacity={0.1} name="Ingresos" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <Card title="Mapa de calor: día × hora" icon={<Activity className="h-4 w-4 text-[var(--color-primary)]" />}>
          {a.total === 0 ? <Empty text="Sin datos" /> : <Heatmap cells={a.peak.cells} />}
          <p className="text-[10px] text-[var(--text-muted)] mt-2">Más verde = más gente. Úsalo para poner instructores y clases en las horas de más flujo.</p>
        </Card>
        <Card title="Por origen" icon={<Activity className="h-4 w-4 text-[var(--text-muted)]" />}>
          {a.by_source.length === 0 ? <Empty text="Sin datos" /> : (
            <div className="space-y-1.5">
              {a.by_source.map((s) => (
                <div key={s.source} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-base)] last:border-0">
                  <span className="text-[var(--text-base)]">{SOURCE_LABEL[s.source] ?? s.source}</span>
                  <span className="font-mono text-[var(--text-base)]">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </motion.div>
  );
}
