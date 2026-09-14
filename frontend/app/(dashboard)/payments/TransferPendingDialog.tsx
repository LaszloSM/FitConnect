/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openReceipt, transferWhatsappText, type DestinationAccount } from "./shared";
import { CheckCircleIcon as CheckCircle2, CopyIcon as Copy, ImageIcon as ImagePlus, KeyIcon as KeyRound, BankIcon as Landmark, SpinnerGapIcon as Loader2, ChatCircleIcon as MessageCircle, QrCodeIcon as QrCode, DeviceMobileIcon as Smartphone } from "@phosphor-icons/react";

export interface TransferContext {
  paymentId: string;
  amount: number;
  reference: string | null;
  account: DestinationAccount | null;
  memberName?: string | null;
  phone?: string | null;
  concept?: string;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      title={`Copiar ${label}`}
      onClick={() => {
        navigator.clipboard.writeText(value).catch(() => {});
        toast.success(`${label} copiado`);
      }}
      aria-label={`Copiar ${label}`}
      className="size-8 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors shrink-0"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

/** Panel de instrucciones de transferencia: QR, llave Bre-B, cuenta y referencia. */
export function TransferInstructions({ ctx, compact = false }: { ctx: TransferContext; compact?: boolean }) {
  const acc = ctx.account;
  return (
    <div className={cn("grid gap-3", acc?.qr_url && !compact ? "sm:grid-cols-[minmax(0,1fr)_160px]" : "")}>
      <div className="space-y-2 min-w-0">
        <div className="rounded-[var(--radius-lg)] border border-primary/30 bg-primary-muted p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-ink-muted">Referencia del giro</p>
            <p className="text-xl font-bold font-mono text-[var(--text-base)] tracking-wide">
              {ctx.reference ?? "—"}
            </p>
          </div>
          {ctx.reference && <CopyButton value={ctx.reference} label="Referencia" />}
        </div>

        {acc ? (
          <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-3 space-y-2">
            <div className="flex items-center gap-2">
              {acc.type === "nequi" || acc.type === "daviplata" ? (
                <Smartphone className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              ) : (
                <Landmark className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              )}
              <p className="text-sm font-semibold text-[var(--text-base)] truncate">{acc.label}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-mono text-[var(--text-base)] truncate">
                {acc.account_number}
                <span className="text-xs text-[var(--text-muted)] font-sans"> · {acc.holder_name}</span>
              </p>
              <CopyButton value={acc.account_number} label="Número" />
            </div>
            {acc.breb_key && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-[var(--text-base)] truncate flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span className="font-mono">{acc.breb_key}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">Bre-B</span>
                </p>
                <CopyButton value={acc.breb_key} label="Llave Bre-B" />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--signal-warn)]">
            No hay cuenta de recaudo: agrégala en Ajustes › Recaudo.
          </p>
        )}
      </div>

      {acc?.qr_url && (
        <div className={cn("rounded-xl border border-[var(--border-base)] bg-white p-2 flex items-center justify-center", compact ? "w-40" : "")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={acc.qr_url} alt={`QR ${acc.label}`} className="w-full h-auto object-contain" />
        </div>
      )}
      {acc && !acc.qr_url && !compact && (
        <div className="hidden sm:flex rounded-xl border border-dashed border-[var(--border-base)] items-center justify-center text-[var(--text-muted)] text-xs p-3 text-center">
          <div>
            <QrCode className="h-6 w-6 mx-auto mb-1 opacity-50" />
            Sube el QR de esta cuenta en Ajustes › Recaudo
          </div>
        </div>
      )}
    </div>
  );
}

export function TransferPendingDialog({
  ctx,
  onClose,
  onConfirmed,
}: {
  ctx: TransferContext | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const { data: session } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [proofName, setProofName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProofName(null);
  }, [ctx?.paymentId]);

  if (!ctx) return null;
  const client = () => apiClient(session?.accessToken as string);

  const confirmReceived = async () => {
    if (!session?.accessToken) return;
    setConfirming(true);
    try {
      await client().patch(`/api/v1/payments/${ctx.paymentId}/mark-paid`);
      toast.success("Transferencia confirmada: recibo emitido", {
        action: { label: "Imprimir", onClick: () => openReceipt(client(), ctx.paymentId) },
        duration: 8000,
      });
      onConfirmed();
      onClose();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error confirmando el pago"));
    } finally {
      setConfirming(false);
    }
  };

  const uploadProof = async (file: File) => {
    if (!session?.accessToken) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await client().post(`/api/v1/payments/${ctx.paymentId}/proof`, fd, {
        headers: { "Content-Type": undefined },
      });
      setProofName(file.name);
      toast.success("Comprobante adjuntado");
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo subir el comprobante"));
    } finally {
      setUploading(false);
    }
  };

  const whatsapp = () => {
    const phone = (ctx.phone ?? "").replace(/\D/g, "");
    const text = transferWhatsappText(
      (ctx.memberName ?? "").split(" ")[0] || "",
      formatCOP(ctx.amount),
      ctx.reference,
      ctx.account,
      ctx.concept,
    );
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Transferencia por {formatCOP(ctx.amount)}</DialogTitle>
          <DialogDescription>
            El pago quedó <strong>pendiente</strong>. Muestra el QR o la cuenta, pide que escriban la
            referencia en el giro y confirma cuando veas la plata. También queda en{" "}
            <strong>Por cobrar › Por confirmar</strong>.
          </DialogDescription>
        </DialogHeader>

        <TransferInstructions ctx={ctx} />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={whatsapp} className="text-sm">
            <MessageCircle className="h-4 w-4 mr-1.5" /> Enviar por WhatsApp
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-sm"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-1.5" />}
            {proofName ? `Comprobante: ${proofName}` : "Adjuntar comprobante"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadProof(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={onClose}>
            Dejar pendiente
          </Button>
          <Button
            onClick={confirmReceived}
            disabled={confirming}
          >
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Ya llegó: confirmar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
