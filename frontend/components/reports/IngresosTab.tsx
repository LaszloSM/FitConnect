/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { motion } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { formatCOP } from "@/lib/format";
import { CreditCard, Layers, TrendingUp, Wallet } from "lucide-react";
import type { Period } from "./PeriodPicker";
import { Card, Empty, TabSkeleton, Tile, chartTooltipStyle, compact, containerVariants, cardVariants, usePeriodData } from "./shared";
import { EXPENSE_LABELS } from "@/app/(dashboard)/payments/shared";

interface Summary {
  revenue: number; payments_count: number; pending: number; pending_count: number; refunded: number;
  expenses: number; profit: number; days: number;
}
interface Breakdown {
  total: number;
  by_kind: { kind: string; label: string; amount: number; count: number }[];
  by_method: { method: string; label: string; amount: number; count: number }[];
  by_plan: { plan_name: string; amount: number; count: number }[];
  expenses: { category: string; label?: string; amount: number; count: number }[];
}
interface Daily { date: string; amount: number; membership: number; day_pass: number; product: number; other: number }

const KIND_COLORS: Record<string, string> = { membership: "var(--brand)", day_pass: "var(--signal-info)", product: "var(--signal-warn)", other: "var(--text-subtle)" };

export function IngresosTab({ period }: { period: Period }) {
  const { data, loading, error } = usePeriodData<{ summary: Summary; breakdown: Breakdown; daily: Daily[] }>({
    summary: "/api/v1/reports/summary",
    breakdown: "/api/v1/reports/revenue-breakdown",
    daily: "/api/v1/reports/revenue-daily",
  }, period);

  if (loading && !data.summary) return <TabSkeleton />;
  if (error) return <Empty text={error} />;
  const s = data.summary!;
  const b = data.breakdown!;
  const daily = (data.daily ?? []).map((d) => ({ ...d, label: d.date.slice(5).split("-").reverse().join("/") }));
  const multiDay = daily.length > 1;

  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={cardVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Ingresos confirmados" value={formatCOP(s.revenue)} tone="positive" hint={`${s.payments_count} pagos · ${formatCOP(s.days ? s.revenue / s.days : 0)}/día`} />
        <Tile label="Egresos" value={formatCOP(s.expenses)} tone={s.expenses > 0 ? "negative" : "muted"} />
        <Tile label="Utilidad" value={formatCOP(s.profit)} tone={s.profit >= 0 ? "base" : "negative"} />
        <Tile label="Pendiente por confirmar" value={formatCOP(s.pending)} tone={s.pending > 0 ? "warning" : "muted"} hint={s.refunded > 0 ? `Devuelto: ${formatCOP(s.refunded)}` : undefined} />
      </motion.div>

      <Card title={multiDay ? "Ingresos por día y fuente" : "Ingresos del día por fuente"} icon={<TrendingUp className="h-4 w-4 text-ink-muted" />}>
        {daily.every((d) => d.amount === 0) ? (
          <Empty text="Sin ingresos confirmados en el período" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={daily} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={compact} />
              <Tooltip {...chartTooltipStyle} formatter={(v: any, name: any) => [formatCOP(Number(v) || 0), name]} />
              {/* El color de la serie identifica la LÍNEA, no su nombre: a 11px no
                  llega a 4.5:1 sobre la tarjeta. El símbolo lleva el color y el
                  texto la tinta normal, que es como se leen los datos. */}
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value) => (
                  <span style={{ color: "var(--text-muted)" }}>{value}</span>
                )}
              />
              <Area type="monotone" stackId="1" dataKey="membership" name="Membresías" stroke={KIND_COLORS.membership} fill={KIND_COLORS.membership} fillOpacity={0.35} />
              <Area type="monotone" stackId="1" dataKey="day_pass" name="Pases" stroke={KIND_COLORS.day_pass} fill={KIND_COLORS.day_pass} fillOpacity={0.35} />
              <Area type="monotone" stackId="1" dataKey="product" name="Productos" stroke={KIND_COLORS.product} fill={KIND_COLORS.product} fillOpacity={0.35} />
              <Area type="monotone" stackId="1" dataKey="other" name="Otros" stroke={KIND_COLORS.other} fill={KIND_COLORS.other} fillOpacity={0.35} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Por fuente de ingreso" icon={<Layers className="h-4 w-4 text-ink-muted" />}>
          {b.by_kind.length === 0 ? <Empty text="Sin ingresos en el período" /> : (
            <div className="space-y-2">
              {[...b.by_kind].sort((x, y) => y.amount - x.amount).map((k) => (
                <div key={k.kind}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-base)] flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: KIND_COLORS[k.kind] ?? "var(--text-subtle)" }} />{k.label}</span>
                    <span className="font-mono text-[var(--text-base)]">{formatCOP(k.amount)} <span className="text-[var(--text-muted)] text-xs">· {b.total ? Math.round(k.amount / b.total * 100) : 0}%</span></span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--bg-muted)] mt-1"><div className="h-1.5 rounded-full" style={{ width: `${b.total ? k.amount / b.total * 100 : 0}%`, background: KIND_COLORS[k.kind] ?? "var(--text-subtle)" }} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Por método de pago" icon={<CreditCard className="h-4 w-4 text-ink-muted" />}>
          {b.by_method.length === 0 ? <Empty text="Sin ingresos en el período" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={b.by_method} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={compact} />
                <Tooltip {...chartTooltipStyle} formatter={(v: any) => [formatCOP(Number(v) || 0), "Ingresos"]} />
                <Bar dataKey="amount" fill="var(--brand)" radius={[4, 4, 0, 0]} name="Ingresos" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Por plan" icon={<Layers className="h-4 w-4 text-ink-muted" />}>
          {b.by_plan.length === 0 ? <Empty text="Sin cobros de membresía en el período" /> : (
            <div className="space-y-1.5">
              {b.by_plan.map((p) => (
                <div key={p.plan_name} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-base)] last:border-0">
                  <span className="text-[var(--text-base)]">{p.plan_name} <span className="text-xs text-[var(--text-muted)]">· {p.count}</span></span>
                  <span className="font-mono text-[var(--text-base)]">{formatCOP(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Egresos por categoría" icon={<Wallet className="h-4 w-4 text-ink-muted" />}>
          {b.expenses.length === 0 ? <Empty text="Sin egresos registrados en el período" /> : (
            <div className="space-y-1.5">
              {b.expenses.map((e) => (
                <div key={e.category} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-base)] last:border-0">
                  <span className="text-[var(--text-base)]">{e.label ?? EXPENSE_LABELS[e.category] ?? e.category} <span className="text-xs text-[var(--text-muted)]">· {e.count}</span></span>
                  <span className="font-mono text-[var(--signal-danger)]">−{formatCOP(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </motion.div>
  );
}
