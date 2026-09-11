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
import { METHOD_LABELS, KIND_LABELS, KIND_TONES, openReceipt, openReceiptPdf, shareReceiptWhatsapp, type PaymentRow } from "./shared";
import { FormDialog, FormField } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { CheckCircle2, Download, FileText, Filter, Loader2, MessageCircle, Receipt, RotateCcw, XCircle } from "lucide-react";

type StatusFilter = "" | "paid" | "pending" | "voided" | "refunded";
type ReverseKind = "refund" | "correction";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "", label: "Todos" },
  { key: "paid", label: "Pagados" },
  { key: "pending", label: "Pendientes" },
  { key: "voided", label: "Anulados" },
  { key: "refunded", label: "Devueltos" },
];

export function HistoryTab({ refreshSignal }: { refreshSignal: number }) {
  const { data: session } = useSession();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [kindFilter, setKindFilter] = useState<string>("");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundKind, setRefundKind] = useState<ReverseKind>("refund");
  const [refundAmount, setRefundAmount] = useState("");
  const [refunding, setRefunding] = useState(false);
  const isOwnerOrAdmin = session?.role === "owner" || session?.role === "admin";

  const doRefund = async () => {
    if (!session?.accessToken || !refundTarget) return;
    if (refundReason.trim().length < 3) {
      toast.error("Escribe el motivo de la devolución");
      return;
    }
    setRefunding(true);
    try {
      const client = apiClient(session.accessToken as string);
      const partial = refundAmount.trim() ? Number(refundAmount) : null;
      const live = Number(refundTarget.amount) - Number(refundTarget.refunded_amount ?? 0);
      if (partial !== null && (!Number.isFinite(partial) || partial <= 0 || partial > live)) {
        toast.error(`El monto debe estar entre 1 y ${formatCOP(live)}`);
        setRefunding(false);
        return;
      }
      const { data } = await client.post(`/api/v1/payments/${refundTarget.id}/refund`, {
        reason: refundReason.trim(),
        kind: refundKind,
        ...(partial !== null ? { amount: partial } : {}),
      });
      toast.success(
        refundKind === "correction"
          ? "Monto corregido — la caja no se movió"
          : `Devolución registrada${refundTarget.method === "cash" ? " · egreso en caja" : ""}`
      );
      setPayments((prev) => prev.map((p) => (p.id === refundTarget.id ? { ...p, status: data.status, refunded_at: data.refunded_at, refund_reason: data.refund_reason, refunded_amount: data.refunded_amount } : p)));
      setRefundTarget(null);
      setRefundReason("");
      setRefundAmount("");
      setRefundKind("refund");
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error registrando la devolución");
    } finally {
      setRefunding(false);
    }
  };
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
  }, [session?.accessToken, dateFrom, dateTo, refreshSignal]);

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

  const voidPayment = async (paymentId: string) => {
    if (!session?.accessToken) return;
    const reason = window.prompt("¿Anular este pago pendiente? Úsalo cuando la transferencia nunca llegó.\nMotivo (opcional):");
    if (reason === null) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.post(`/api/v1/payments/${paymentId}/void`, { reason: reason || null });
      toast.success("Pago anulado");
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: "failed" } : p)));
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error anulando el pago");
    }
  };

  const filtered = payments.filter(
    (p) => (!statusFilter || p.status === statusFilter) && (!kindFilter || (p.kind ?? "other") === kindFilter)
  );
  const netOf = (p: PaymentRow) => Number(p.amount) - Number(p.refunded_amount ?? 0);
  const totalPaid = payments.filter((p) => p.status === "paid").reduce((acc, p) => acc + netOf(p), 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((acc, p) => acc + Number(p.amount), 0);

  const exportCSV = () => {
    const rows = [
      ["Miembro", "Concepto", "Fuente", "Monto COP", "Método", "Cuenta destino", "Estado", "Referencia", "Fecha"],
      ...filtered.map((p) => [
        p.member_name ?? (p.member_id ? `${p.member_id.slice(0, 8)}…` : "Venta de mostrador"),
        p.concept,
        KIND_LABELS[p.kind ?? "other"],
        String(p.amount),
        METHOD_LABELS[p.method ?? ""] ?? p.method ?? "",
        p.destination_account?.label ?? "",
        p.status,
        p.transfer_reference ?? p.external_ref ?? "",
        formatDate(p.created_at, "dd/MM/yyyy"),
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
      cell: (p) => (
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={p.kind ?? "other"} label={KIND_LABELS[p.kind ?? "other"]} tone={KIND_TONES[p.kind ?? "other"]} />
          <span className="text-[var(--text-muted)] truncate">{p.concept}</span>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Monto",
      cell: (p) => {
        const reversed = Number(p.refunded_amount ?? 0);
        const partial = reversed > 0 && p.status === "paid";
        return (
          <div className="font-mono">
            <span className="font-semibold text-[var(--text-base)]">
              {formatCOP(partial ? netOf(p) : p.amount)}
            </span>
            {partial && (
              <p className="text-[11px] text-[var(--text-muted)]">
                de {formatCOP(p.amount)} · {formatCOP(reversed)} revertido
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: "method",
      header: "Método",
      hideOnMobile: true,
      cell: (p) => (
        <div className="text-[var(--text-muted)]">
          {METHOD_LABELS[p.method ?? ""] ?? p.method ?? "-"}
          {p.method === "transfer" && (p.transfer_reference || p.destination_account) && (
            <p className="text-[11px] font-mono truncate">
              {p.transfer_reference}{p.destination_account ? ` · ${p.destination_account.label}` : ""}
            </p>
          )}
          {p.method === "card" && p.card_approval_code && (
            <p className="text-[11px] font-mono truncate">Aprob. {p.card_approval_code}</p>
          )}
        </div>
      ),
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
            <>
              <button
                onClick={() => markAsPaid(p.id)}
                disabled={markingPaid === p.id}
                title="Confirmar pago recibido"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50"
              >
                {markingPaid === p.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => voidPayment(p.id)}
                title="Anular pago (la plata nunca llegó)"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {(p.status === "paid" || p.status === "refunded") && session?.accessToken && (
            <>
              <button
                onClick={() => openReceiptPdf(apiClient(session.accessToken as string), p.id)}
                title="Comprobante PDF"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--color-primary-ink)] hover:bg-[var(--bg-base)] transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => shareReceiptWhatsapp(apiClient(session.accessToken as string), p.id, p.member_phone, (p.member_name ?? "").split(" ")[0])}
                title="Enviar comprobante por WhatsApp"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => openReceipt(apiClient(session.accessToken as string), p.id)}
                title="Imprimir tirilla 80mm"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-base)] transition-colors"
              >
                <Receipt className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {p.status === "paid" && isOwnerOrAdmin && (
            <button
              onClick={() => { setRefundTarget(p); setRefundReason(""); }}
              title="Devolver este pago"
              className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <FormDialog
        open={refundTarget !== null}
        onOpenChange={(o) => !o && setRefundTarget(null)}
        title={refundTarget ? `Revertir ${formatCOP(refundTarget.amount)}` : ""}
        description={
          refundKind === "correction"
            ? "Corrección de digitación: ajusta el monto cobrado sin mover la caja. Úsala cuando el socio pagó bien y lo mal digitado fue el registro."
            : refundTarget?.method === "cash"
              ? "Devolución: se registra un egreso de caja por el valor. Si es total, el stock vuelve al inventario y el recibo queda como devuelto."
              : "Devolución: si es total, el stock vuelve al inventario y el recibo queda como devuelto. La plata la devuelves por el mismo medio."
        }
        onSubmit={doRefund}
        submitLabel={refundKind === "correction" ? "Corregir monto" : "Registrar devolución"}
        submitting={refunding}
        destructive={refundKind === "refund"}
      >
        <FormField label="Qué pasó" required>
          <div className="flex gap-2">
            {([
              ["refund", "Devolví la plata"],
              ["correction", "Me equivoqué al digitar"],
            ] as [ReverseKind, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRefundKind(key)}
                aria-pressed={refundKind === key}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  refundKind === key
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--text-base)]"
                    : "border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </FormField>
        <FormField
          label="Monto"
          hint={
            refundTarget
              ? `Déjalo vacío para revertir todo el saldo vivo (${formatCOP(
                  Number(refundTarget.amount) - Number(refundTarget.refunded_amount ?? 0)
                )})`
              : undefined
          }
        >
          <Input
            type="number"
            inputMode="numeric"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder="Todo el saldo"
          />
        </FormField>
        <FormField label="Motivo" required>
          <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Producto defectuoso, cobro equivocado..." autoFocus />
        </FormField>
      </FormDialog>
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

        <div className="flex gap-2 flex-wrap mb-2" role="group" aria-label="Filtrar por estado">
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
        <div className="flex gap-2 flex-wrap mb-4" role="group" aria-label="Filtrar por fuente">
          {[["", "Todas las fuentes"], ...Object.entries(KIND_LABELS)].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setKindFilter(key)}
              aria-pressed={kindFilter === key}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                kindFilter === key
                  ? "bg-[var(--text-base)] text-[var(--bg-base)]"
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
