/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { METHOD_LABELS, openReceipt, type PaymentRow } from "./shared";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { CheckCircle2, Download, Filter, Loader2, Receipt } from "lucide-react";

type StatusFilter = "" | "paid" | "pending" | "failed";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "", label: "Todos" },
  { key: "paid", label: "Pagados" },
  { key: "pending", label: "Pendientes" },
  { key: "failed", label: "Fallidos" },
];

export function HistoryTab({ refreshSignal }: { refreshSignal: number }) {
  const { data: session } = useSession();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    setLoading(true);
    const client = apiClient(session.accessToken as string);
    client
      .get("/api/v1/payments", { params: { from: dateFrom, to: dateTo, limit: 200 } })
      .then((res) => {
        if (!cancelled) {
          setPayments(res.data);
          setError("");
        }
      })
      .catch((err: any) => {
        if (!cancelled)
          setError(
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Error cargando pagos"
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, dateFrom, dateTo, refreshSignal]);

  const markAsPaid = async (paymentId: string) => {
    if (!session?.accessToken) return;
    setMarkingPaid(paymentId);
    try {
      const client = apiClient(session.accessToken as string);
      await client.patch(`/api/v1/payments/${paymentId}/mark-paid`);
      toast.success("Pago marcado como pagado");
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: "paid" } : p)));
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error actualizando pago");
    } finally {
      setMarkingPaid(null);
    }
  };

  const filtered = statusFilter ? payments.filter((p) => p.status === statusFilter) : payments;
  const totalPaid = payments.filter((p) => p.status === "paid").reduce((acc, p) => acc + Number(p.amount), 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((acc, p) => acc + Number(p.amount), 0);

  const exportCSV = () => {
    const rows = [
      ["Miembro", "Concepto", "Monto COP", "Método", "Estado", "Referencia", "Fecha"],
      ...filtered.map((p) => [
        p.member_name ?? (p.member_id ? `${p.member_id.slice(0, 8)}…` : "Venta de mostrador"),
        p.concept,
        String(p.amount),
        METHOD_LABELS[p.method ?? ""] ?? p.method ?? "",
        p.status,
        p.external_ref ?? "",
        new Date(p.created_at).toLocaleDateString("es-CO"),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagos-${dateFrom}-al-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: DataTableColumn<PaymentRow>[] = [
    {
      key: "member",
      header: "Miembro",
      cell: (p) => (
        <span className="font-medium text-[var(--text-base)]">
          {p.member_name ?? (p.member_id ? `${p.member_id.slice(0, 8)}…` : "Venta de mostrador")}
        </span>
      ),
    },
    {
      key: "concept",
      header: "Concepto",
      hideOnMobile: true,
      cell: (p) => <span className="text-[var(--text-muted)]">{p.concept}</span>,
    },
    {
      key: "amount",
      header: "Monto",
      cell: (p) => <span className="font-semibold font-mono text-[var(--text-base)]">{formatCOP(p.amount)}</span>,
    },
    {
      key: "method",
      header: "Método",
      hideOnMobile: true,
      cell: (p) => <span className="text-[var(--text-muted)]">{METHOD_LABELS[p.method ?? ""] ?? p.method ?? "-"}</span>,
    },
    { key: "status", header: "Estado", cell: (p) => <StatusBadge status={p.status} /> },
    {
      key: "date",
      header: "Fecha",
      hideOnMobile: true,
      cell: (p) => <span className="text-[var(--text-muted)] text-sm">{formatDate(p.created_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      cell: (p) => (
        <div className="flex items-center justify-end gap-1">
          {p.status === "pending" && (
            <button
              onClick={() => markAsPaid(p.id)}
              disabled={markingPaid === p.id}
              title="Marcar como pagado"
              className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50"
            >
              {markingPaid === p.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {p.status === "paid" && session?.accessToken && (
            <button
              onClick={() => openReceipt(apiClient(session.accessToken as string), p.id)}
              title="Ver recibo"
              className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--bg-base)] transition-colors"
            >
              <Receipt className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="surface-1 rounded-xl p-4">
            <p className="text-xs text-[var(--text-muted)]">Total cobrado</p>
            <p className="text-lg font-bold text-[var(--text-base)] font-mono">{formatCOP(totalPaid)}</p>
          </div>
          <div className="surface-1 rounded-xl p-4">
            <p className="text-xs text-[var(--text-muted)]">Por cobrar</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono">{formatCOP(totalPending)}</p>
          </div>
          <div className="surface-1 rounded-xl p-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-[var(--text-muted)]">Registros</p>
            <p className="text-lg font-bold text-[var(--text-base)] font-mono">{payments.length}</p>
          </div>
        </div>
      )}

      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-4 pb-4 border-b border-[var(--border-base)]">
          <div className="flex items-center gap-2 flex-1">
            <Filter className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 min-w-0 h-8 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-xs text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            />
            <span className="text-[var(--text-muted)] text-xs shrink-0">hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 min-w-0 h-8 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-xs text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            />
          </div>
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-base)] text-xs text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-base)] transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>

        <div className="flex gap-2 flex-wrap mb-4" role="group" aria-label="Filtrar por estado">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              aria-pressed={statusFilter === key}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                statusFilter === key
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                  : "bg-[var(--bg-base)] border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(p) => p.id}
          loading={loading}
          error={error}
          emptyTitle={statusFilter ? "Sin pagos en este estado" : "Sin pagos en este rango"}
          emptyDescription={
            statusFilter ? "Cambia el filtro para ver otros pagos" : "Cobra desde la pestaña Cobrar"
          }
        />
      </GlassCard>
    </div>
  );
}
