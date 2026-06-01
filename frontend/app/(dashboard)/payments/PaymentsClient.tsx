/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import MemberSelect from "@/components/common/MemberSelect";
import { CurrencyInput } from "@/components/ui/currency-input";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, AlertCircle, DollarSign, CheckCircle2, Loader2, Download, Filter } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";

interface Payment {
  id: string;
  member_id: string;
  member_name?: string;
  amount: number;
  method: string | null;
  status: string;
  concept: string;
  external_ref?: string | null;
  created_at: string;
}

type StatusFilter = "" | "paid" | "pending" | "overdue";

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";
const selectCls =
  "w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-1 text-sm text-[var(--text-base)]";

const STATUS_LABELS: Record<string, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  overdue: "Vencido",
  failed: "Fallido",
  refunded: "Reembolsado",
};

const STATUS_DOT: Record<string, string> = {
  paid: "bg-green-500",
  pending: "bg-amber-400",
  overdue: "bg-red-500",
  failed: "bg-red-500",
  refunded: "bg-gray-400",
};

const STATUS_BADGE: Record<string, string> = {
  paid:     "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
  pending:  "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
  overdue:  "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400",
  failed:   "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400",
  refunded: "bg-gray-100 dark:bg-gray-800/30 text-gray-600 dark:text-gray-400",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  wompi: "Wompi",
};

const CONCEPT_OPTIONS = [
  "Cuota mensual",
  "Cuota bimestral",
  "Cuota trimestral",
  "Cuota semestral",
  "Cuota anual",
  "Inscripción",
  "Clase especial",
  "Producto/Suplemento",
  "Otro",
];

export default function PaymentsClient() {
  const { data: session } = useSession();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [form, setForm] = useState({
    member_id: "",
    amount: 0,
    method: "cash",
    concept: "",
    concept_other: "",
    external_ref: "",
    send_receipt: false,
  });

  const fetchPayments = async (from = dateFrom, to = dateTo) => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/payments", {
        params: { from, to, limit: 200 },
      });
      setPayments(res.data);
      setError("");
    } catch (err: any) {
      setError(
        typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Error cargando pagos"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    setLoading(true);
    const client = apiClient(session.accessToken as string);
    client
      .get("/api/v1/payments", { params: { from: dateFrom, to: dateTo, limit: 200 } })
      .then((res) => {
        if (!cancelled) { setPayments(res.data); setError(""); }
      })
      .catch((err: any) => {
        if (!cancelled)
          setError(
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Error cargando pagos"
          );
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, dateFrom, dateTo]);

  const markAsPaid = async (paymentId: string) => {
    if (!session?.accessToken) return;
    setMarkingPaid(paymentId);
    try {
      const client = apiClient(session.accessToken as string);
      await client.patch(`/api/v1/payments/${paymentId}/mark-paid`);
      toast.success("Pago marcado como pagado");
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, status: "paid" } : p))
      );
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error actualizando pago");
    } finally {
      setMarkingPaid(null);
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Miembro", "Concepto", "Monto COP", "Método", "Estado", "Referencia", "Fecha"],
      ...filtered.map((p) => [
        p.member_name ?? p.member_id,
        p.concept,
        String(p.amount),
        METHOD_LABELS[p.method ?? ""] ?? p.method ?? "",
        STATUS_LABELS[p.status] ?? p.status,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);

    const finalConcept = form.concept === "Otro" ? form.concept_other : form.concept;
    const showExternalRef = form.method === "transfer" || form.method === "wompi";

    try {
      await client.post("/api/v1/payments", {
        member_id: form.member_id,
        amount: form.amount,
        method: form.method,
        concept: finalConcept,
        ...(showExternalRef && form.external_ref ? { external_ref: form.external_ref } : {}),
        send_receipt: form.send_receipt,
      });
      toast.success("Pago registrado correctamente");
      setDialogOpen(false);
      setForm({ member_id: "", amount: 0, method: "cash", concept: "", concept_other: "", external_ref: "", send_receipt: false });
      fetchPayments();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail[0]?.msg
          : "Error guardando pago"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered payments
  const filtered = statusFilter
    ? payments.filter((p) => p.status === statusFilter)
    : payments;

  // Totals
  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((acc, p) => acc + p.amount, 0);
  const totalPending = payments
    .filter((p) => p.status === "pending")
    .reduce((acc, p) => acc + p.amount, 0);

  const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "",        label: "Todos" },
    { key: "paid",    label: "Pagados" },
    { key: "pending", label: "Pendientes" },
    { key: "overdue", label: "Vencidos" },
  ];

  const showExternalRef = form.method === "transfer" || form.method === "wompi";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <PageHeader
          module="payments"
          title="Pagos"
          subtitle="Registra y gestiona pagos de miembros"
          action={
            <DialogTrigger
              render={
                <Button className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo pago
                </Button>
              }
            />
          }
        />

        <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-base)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-base)] font-display">
              Nuevo pago
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Miembro</Label>
              <MemberSelect
                value={form.member_id}
                onChange={(id) => setForm({ ...form, member_id: id })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Monto (COP)</Label>
                <CurrencyInput
                  value={form.amount}
                  onChange={(v) => setForm({ ...form, amount: v })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Método</Label>
                <select
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}
                  className={selectCls}
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="card">Tarjeta</option>
                  <option value="wompi">Wompi</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Concepto</Label>
              <select
                value={form.concept}
                onChange={(e) => setForm({ ...form, concept: e.target.value })}
                required
                className={selectCls}
              >
                <option value="">Seleccionar concepto...</option>
                {CONCEPT_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {form.concept === "Otro" && (
                <Input
                  value={form.concept_other}
                  onChange={(e) => setForm({ ...form, concept_other: e.target.value })}
                  placeholder="Describe el concepto..."
                  required
                  className={inputCls}
                />
              )}
            </div>
            {showExternalRef && (
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Referencia externa</Label>
                <Input
                  value={form.external_ref}
                  onChange={(e) => setForm({ ...form, external_ref: e.target.value })}
                  placeholder="Número de transacción o referencia"
                  className={inputCls}
                />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.send_receipt}
                onChange={(e) => setForm({ ...form, send_receipt: e.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-base)] accent-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--text-muted)]">Enviar recibo por email al miembro</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                className="text-[var(--text-muted)]"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)]"
              >
                {submitting ? "Registrando..." : "Registrar pago"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Totals summary bar */}
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="surface-1 rounded-xl p-4 flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
            </span>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Total cobrado</p>
              <p className="text-sm font-bold text-[var(--text-base)] font-mono">
                ${totalPaid.toLocaleString("es-CO")}
              </p>
            </div>
          </div>
          <div className="surface-1 rounded-xl p-4 flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-amber-500" />
            </span>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Por cobrar</p>
              <p className="text-sm font-bold text-[var(--text-base)] font-mono">
                ${totalPending.toLocaleString("es-CO")}
              </p>
            </div>
          </div>
          <div className="surface-1 rounded-xl p-4 flex items-center gap-3 col-span-2 sm:col-span-1">
            <span className="h-8 w-8 rounded-full bg-[var(--bg-base)] border border-[var(--border-base)] flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-[var(--text-muted)]">#</span>
            </span>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Total registros</p>
              <p className="text-sm font-bold text-[var(--text-base)] font-mono">
                {payments.length}
              </p>
            </div>
          </div>
        </div>
      )}

      <GlassCard className="p-4">
        {/* Date range + export controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4 pb-4 border-b border-[var(--border-base)]">
          <div className="flex items-center gap-2 flex-1">
            <Filter className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            <div className="flex items-center gap-2 flex-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 min-w-0 h-8 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-xs text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
              />
              <span className="text-[var(--text-muted)] text-xs shrink-0">hasta</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 min-w-0 h-8 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-xs text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
              />
            </div>
          </div>
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-base)] text-xs text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-base)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>

        {/* Status filter pills */}
        <div
          className="flex gap-2 flex-wrap mb-4"
          role="group"
          aria-label="Filtrar por estado"
        >
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

        {error && (
          <div className="flex items-center gap-2 text-red-600 mb-4">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                <TableHead className="text-[var(--text-muted)] w-4" />
                <TableHead className="text-[var(--text-muted)]">Miembro</TableHead>
                <TableHead className="text-[var(--text-muted)]">Concepto</TableHead>
                <TableHead className="text-[var(--text-muted)]">Monto</TableHead>
                <TableHead className="text-[var(--text-muted)]">Método</TableHead>
                <TableHead className="text-[var(--text-muted)]">Estado</TableHead>
                <TableHead className="text-[var(--text-muted)]">Fecha</TableHead>
                <TableHead className="text-[var(--text-muted)] w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-[var(--border-base)]">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="skeleton h-4 rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      title={statusFilter ? "Sin pagos en este estado" : "Sin pagos registrados"}
                      description={
                        statusFilter
                          ? "Cambia el filtro para ver otros pagos"
                          : "Registra el primer pago de un miembro"
                      }
                      action={
                        !statusFilter ? (
                          <Button
                            onClick={() => setDialogOpen(true)}
                            className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nuevo pago
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="border-[var(--border-base)] hover:bg-[var(--bg-base)]"
                  >
                    {/* Status dot */}
                    <TableCell className="py-3 pr-0">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full inline-block",
                          STATUS_DOT[p.status] ?? "bg-gray-400"
                        )}
                        aria-hidden="true"
                      />
                    </TableCell>
                    <TableCell className="text-[var(--text-base)] font-medium">
                      {p.member_name ?? `${p.member_id.slice(0, 8)}…`}
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)]">{p.concept}</TableCell>
                    <TableCell className="text-[var(--text-base)] font-semibold font-mono">
                      ${p.amount.toLocaleString("es-CO")}
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] capitalize">
                      {METHOD_LABELS[p.method ?? ""] ?? p.method ?? "-"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          STATUS_BADGE[p.status] ?? "bg-[var(--bg-base)] text-[var(--text-muted)]"
                        )}
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] text-sm">
                      {new Date(p.created_at).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell>
                      {(p.status === "pending" || p.status === "overdue") && (
                        <button
                          onClick={() => markAsPaid(p.id)}
                          disabled={markingPaid === p.id}
                          title="Marcar como pagado"
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50"
                        >
                          {markingPaid === p.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />
                          }
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
    </motion.div>
  );
}
