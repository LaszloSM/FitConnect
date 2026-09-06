/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { FormDialog, FormField } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { cn } from "@/lib/utils";
import { TransferPendingDialog, type TransferContext } from "./TransferPendingDialog";
import { KIND_LABELS, formatElapsed, type PendingTransferRow } from "./shared";
import { CheckCircle2, Clock, ImageIcon, Landmark, Loader2, XCircle } from "lucide-react";

export function PendingTransfers({ onChanged }: { onChanged?: () => void }) {
  const { data: session } = useSession();
  const pending = useApiResource<PendingTransferRow[]>("/api/v1/payments/pending-transfers", []);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<PendingTransferRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [detail, setDetail] = useState<TransferContext | null>(null);

  const client = () => apiClient(session?.accessToken as string);

  const confirm = async (p: PendingTransferRow) => {
    if (!session?.accessToken) return;
    setConfirming(p.id);
    try {
      await client().patch(`/api/v1/payments/${p.id}/mark-paid`);
      toast.success(`Transferencia ${p.transfer_reference ?? ""} confirmada — recibo emitido`);
      await pending.refetch();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error confirmando");
    } finally {
      setConfirming(null);
    }
  };

  const doVoid = async () => {
    if (!session?.accessToken || !voidTarget) return;
    setVoiding(true);
    try {
      await client().post(`/api/v1/payments/${voidTarget.id}/void`, { reason: voidReason || null });
      toast.success("Pago anulado");
      setVoidTarget(null);
      setVoidReason("");
      await pending.refetch();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error anulando");
    } finally {
      setVoiding(false);
    }
  };

  const total = pending.data.reduce((a, p) => a + Number(p.amount), 0);

  const columns: DataTableColumn<PendingTransferRow>[] = [
    {
      key: "ref",
      header: "Referencia",
      cell: (p) => (
        <button
          type="button"
          onClick={() =>
            setDetail({
              paymentId: p.id,
              amount: Number(p.amount),
              reference: p.transfer_reference ?? null,
              account: p.destination_account ?? null,
              memberName: p.member_name,
              concept: p.concept,
            })
          }
          className="font-mono font-semibold text-[var(--text-base)] hover:text-[var(--color-primary)]"
        >
          {p.transfer_reference ?? "—"}
        </button>
      ),
    },
    {
      key: "member",
      header: "Quién",
      cell: (p) => (
        <div>
          <p className="font-medium text-[var(--text-base)]">{p.member_name ?? "Venta de mostrador"}</p>
          <p className="text-xs text-[var(--text-muted)]">{KIND_LABELS[p.kind ?? "other"]} · {p.concept}</p>
        </div>
      ),
    },
    {
      key: "account",
      header: "Cuenta",
      hideOnMobile: true,
      cell: (p) => (
        <span className="text-[var(--text-muted)] text-sm flex items-center gap-1.5">
          <Landmark className="h-3.5 w-3.5" />
          {p.destination_account?.label ?? "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Monto",
      cell: (p) => <span className="font-mono font-bold text-[var(--text-base)]">{formatCOP(p.amount)}</span>,
    },
    {
      key: "elapsed",
      header: "Espera",
      cell: (p) => (
        <span
          className={cn(
            "text-sm flex items-center gap-1",
            p.elapsed_minutes >= 24 * 60
              ? "text-red-500 font-semibold"
              : p.elapsed_minutes >= 120
              ? "text-amber-600 dark:text-amber-400"
              : "text-[var(--text-muted)]"
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          {formatElapsed(p.elapsed_minutes)}
        </span>
      ),
    },
    {
      key: "proof",
      header: "Comprobante",
      hideOnMobile: true,
      cell: (p) =>
        p.proof_url ? (
          <a
            href={p.proof_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            <ImageIcon className="h-3.5 w-3.5" /> Ver
          </a>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">Sin adjuntar</span>
        ),
    },
    {
      key: "actions",
      header: "",
      cell: (p) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            onClick={() => confirm(p)}
            disabled={confirming === p.id}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
          >
            {confirming === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirmar</>}
          </Button>
          <button
            type="button"
            title="Anular (la plata nunca llegó)"
            onClick={() => setVoidTarget(p)}
            className="h-8 w-8 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:border-red-300 transition-ui"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <GlassCard className="p-4 space-y-3">
      <TransferPendingDialog
        ctx={detail}
        onClose={() => setDetail(null)}
        onConfirmed={() => { void pending.refetch(); onChanged?.(); }}
      />
      <FormDialog
        open={voidTarget !== null}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        title={`Anular ${voidTarget?.transfer_reference ?? "pago"}`}
        description="Úsalo cuando la transferencia nunca llegó. El pase o membresía asociada queda sin efecto."
        onSubmit={doVoid}
        submitLabel="Anular"
        submitting={voiding}
        destructive
      >
        <FormField label="Motivo" hint="Opcional, queda en la auditoría">
          <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Nunca llegó / se cobró en efectivo" />
        </FormField>
      </FormDialog>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-base)]">Transferencias por confirmar</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {pending.data.length === 0
              ? "Nada pendiente"
              : `${pending.data.length} pendiente${pending.data.length === 1 ? "" : "s"} · ${formatCOP(total)} por conciliar`}
          </p>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={pending.data}
        rowKey={(p) => p.id}
        loading={pending.loading}
        emptyTitle="Sin transferencias pendientes"
        emptyDescription="Las transferencias cobradas en el POS o en pases aparecen aquí hasta que confirmes la plata"
      />
    </GlassCard>
  );
}
