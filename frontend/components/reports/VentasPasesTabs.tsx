/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dumbbell, Package, Ticket, TriangleAlert } from "lucide-react";
import type { Period } from "./PeriodPicker";
import { Card, Empty, TabSkeleton, Tile, chartTooltipStyle, compact, containerVariants, cardVariants, usePeriodData } from "./shared";

interface ProductRow { product_id: string; name: string; units: number; gross: number; discount: number; revenue: number; cost: number; margin: number; stock: number | null; low_stock: boolean }
interface Sales { products: ProductRow[]; total_units: number; total_revenue: number; total_discount: number; total_cost: number; total_margin: number }
interface Stockout { product_id: string; name: string; stock: number; units_sold_30d: number; daily_velocity: number; days_left: number | null; runs_out_on: string | null; low_stock_threshold: number }

export function VentasTab({ period }: { period: Period }) {
  const { data, loading, error } = usePeriodData<{ sales: Sales; stock: Stockout[] }>({
    sales: "/api/v1/reports/product-sales",
    stock: "/api/v1/insights/stockout",
  }, period);
  if (loading && !data.sales) return <TabSkeleton />;
  if (error) return <Empty text={error} />;
  const s = data.sales!;
  const stock = data.stock ?? [];
  const marginPct = s.total_revenue ? Math.round(s.total_margin / s.total_revenue * 100) : 0;

  const columns: DataTableColumn<ProductRow>[] = [
    { key: "name", header: "Producto", cell: (r) => <span className="font-medium text-[var(--text-base)]">{r.name}</span> },
    { key: "units", header: "Unid.", cell: (r) => <span className="font-mono">{r.units}</span> },
    { key: "revenue", header: "Neto", cell: (r) => <span className="font-mono text-[var(--text-base)]">{formatCOP(r.revenue)}{r.discount > 0 && <span className="text-[10px] text-[var(--text-muted)]"> (−{formatCOP(r.discount)})</span>}</span> },
    { key: "cost", header: "Costo", hideOnMobile: true, cell: (r) => <span className="font-mono text-[var(--text-muted)]">{formatCOP(r.cost)}</span> },
    { key: "margin", header: "Margen", cell: (r) => <span className={cn("font-mono font-semibold", r.margin >= 0 ? "text-[var(--signal-ok)]" : "text-[var(--signal-danger)]")}>{formatCOP(r.margin)}</span> },
    { key: "stock", header: "Stock", hideOnMobile: true, cell: (r) => <span className={cn("font-mono", r.low_stock ? "text-[var(--signal-warn)] font-semibold" : "text-[var(--text-muted)]")}>{r.stock ?? "—"}</span> },
  ];
  const stockCols: DataTableColumn<Stockout>[] = [
    { key: "name", header: "Producto", cell: (r) => <span className="font-medium text-[var(--text-base)] flex items-center gap-1.5">{r.stock <= r.low_stock_threshold && <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />}{r.name}</span> },
    { key: "stock", header: "Stock", cell: (r) => <span className="font-mono">{r.stock}</span> },
    { key: "v", header: "Ritmo (30d)", hideOnMobile: true, cell: (r) => <span className="text-[var(--text-muted)] text-sm">{r.units_sold_30d} vend. · {r.daily_velocity}/día</span> },
    { key: "eta", header: "Se agota", cell: (r) => r.days_left === null ? <span className="text-xs text-[var(--text-muted)]">Sin ventas recientes</span> : <span className={cn("text-sm font-semibold", r.days_left <= 7 ? "text-[var(--signal-danger)]" : r.days_left <= 21 ? "text-[var(--signal-warn)]" : "text-[var(--text-base)]")}>{r.days_left === 0 ? "Hoy" : `en ${r.days_left} d`}</span> },
  ];

  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={cardVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Unidades vendidas" value={String(s.total_units)} />
        <Tile label="Ingreso neto" value={formatCOP(s.total_revenue)} tone="positive" hint={s.total_discount > 0 ? `Descuentos: ${formatCOP(s.total_discount)}` : undefined} />
        <Tile label="Costo de lo vendido" value={formatCOP(s.total_cost)} tone="muted" />
        <Tile label="Margen" value={formatCOP(s.total_margin)} tone={s.total_margin >= 0 ? "base" : "negative"} hint={`${marginPct}% sobre el neto`} />
      </motion.div>
      <Card title="Ventas por producto" icon={<Package className="h-4 w-4 text-sky-500" />}>
        {s.products.length === 0 ? <Empty text="Sin ventas de productos en el período" /> : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={s.products.slice(0, 10)} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={compact} />
                <Tooltip {...chartTooltipStyle} formatter={(v: any, n: any) => [formatCOP(Number(v) || 0), n === "revenue" ? "Neto" : "Margen"]} />
                <Bar dataKey="revenue" fill="#0EA5E9" radius={[4, 4, 0, 0]} name="revenue" />
                <Bar dataKey="margin" fill="#22C55E" radius={[4, 4, 0, 0]} name="margin" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4"><DataTable columns={columns} rows={s.products} rowKey={(r) => r.product_id} /></div>
          </>
        )}
      </Card>
      <Card title="Inventario: qué se agota primero" icon={<TriangleAlert className="h-4 w-4 text-amber-500" />}>
        {stock.length === 0 ? <Empty text="Sin productos activos" /> : <DataTable columns={stockCols} rows={stock} rowKey={(r) => r.product_id} />}
      </Card>
    </motion.div>
  );
}

interface DayPasses {
  by_type: { name: string; includes_trainer: boolean; count: number; amount: number }[];
  daily: { date: string; count: number; amount: number }[];
  total_count: number; total_amount: number; unique_people: number; converted_to_member: number;
}

export function PasesTab({ period }: { period: Period }) {
  const { data, loading, error } = usePeriodData<{ passes: DayPasses }>({ passes: "/api/v1/reports/day-passes" }, period);
  if (loading && !data.passes) return <TabSkeleton />;
  if (error) return <Empty text={error} />;
  const p = data.passes!;
  const daily = p.daily.map((d) => ({ ...d, label: d.date.slice(5).split("-").reverse().join("/") }));
  const conv = p.unique_people ? Math.round(p.converted_to_member / p.unique_people * 100) : 0;
  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={cardVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Pases vendidos" value={String(p.total_count)} />
        <Tile label="Ingresos por pases" value={formatCOP(p.total_amount)} tone="positive" />
        <Tile label="Personas distintas" value={String(p.unique_people)} />
        <Tile label="Se hicieron socios" value={String(p.converted_to_member)} tone={p.converted_to_member > 0 ? "positive" : "muted"} hint={`${conv}% de conversión`} />
      </motion.div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Pases por día" icon={<Ticket className="h-4 w-4 text-violet-500" />}>
          {daily.length === 0 ? <Empty text="Sin pases vendidos en el período" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={daily} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...chartTooltipStyle} formatter={(v: any, n: any) => [n === "count" ? v : formatCOP(Number(v) || 0), n === "count" ? "Pases" : "Ingresos"]} />
                <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="count" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Por tipo de pase" icon={<Dumbbell className="h-4 w-4 text-[var(--color-primary-ink)]" />}>
          {p.by_type.length === 0 ? <Empty text="Sin pases en el período" /> : (
            <div className="space-y-1.5">
              {p.by_type.map((t) => (
                <div key={t.name} className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--border-base)] last:border-0">
                  <span className="text-[var(--text-base)] flex items-center gap-1.5">{t.includes_trainer && <Dumbbell className="h-3.5 w-3.5 text-[var(--color-primary-ink)]" />}{t.name} <span className="text-xs text-[var(--text-muted)]">· {t.count}</span></span>
                  <span className="font-mono text-[var(--text-base)]">{formatCOP(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </motion.div>
  );
}
