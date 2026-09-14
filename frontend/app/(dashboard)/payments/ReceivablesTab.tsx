"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP, formatDate } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { HandCoinsIcon as HandCoins, LinkIcon as Link2, SpinnerGapIcon as Loader2, ChatCircleIcon as MessageCircle, WalletIcon as Wallet } from "@phosphor-icons/react";
import { PendingTransfers } from "./PendingTransfers";

interface Receivable {
  member_id: string;
  member_name: string;
  phone: string | null;
  plan_id: string | null;
  plan_name: string;
  end_date: string;
  effective_status: string;
  days_overdue: number;
  amount_due: number;
  kind: "renewal" | "balance";
}

function whatsappLink(r: Receivable): string | null {
  if (!r.phone) return null;
  const phone = r.phone.replace(/\D/g, "");
  const message =
    r.kind === "renewal"
      ? `Hola ${r.member_name.split(" ")[0]} 👋 Tu plan ${r.plan_name} venció el ${formatDate(r.end_date)}. Renueva por ${formatCOP(r.amount_due)} y sigue entrenando con nosotros 💪`
      : `Hola ${r.member_name.split(" ")[0]} 👋 Tienes un saldo pendiente de ${formatCOP(r.amount_due)} de tu plan ${r.plan_name}. ¡Te esperamos en recepción!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function ReceivablesTab({ onCollect }: { onCollect: (memberId: string) => void }) {
  const { data: session } = useSession();
  const receivables = useApiResource<Receivable[]>("/api/v1/payments/receivables", []);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);

  const total = receivables.data.reduce((acc, r) => acc + Number(r.amount_due), 0);

  const sendWompiLink = async (r: Receivable) => {
    if (!session?.accessToken || !r.plan_id) return;
    setLinkBusy(`${r.member_id}-${r.kind}`);
    try {
      const client = apiClient(session.accessToken as string);
      const { data } = await client.post(`/api/v1/members/${r.member_id}/renewal-link`, {
        plan_id: r.plan_id,
      });
      if (!data.checkout_url) {
        toast.error("Wompi no está configurado en Ajustes › Integraciones");
        return;
      }
      await navigator.clipboard.writeText(data.checkout_url).catch(() => {});
      const phone = (r.phone ?? "").replace(/\D/g, "");
      if (phone) {
        const text = encodeURIComponent(
          `Hola ${r.member_name.split(" ")[0]} 👋 Renueva tu plan ${r.plan_name} (${formatCOP(r.amount_due)}) pagando aquí: ${data.checkout_url}`
        );
        window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
      }
      toast.success("Link de pago Wompi creado y copiado");
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo generar el link"));
    } finally {
      setLinkBusy(null);
    }
  };

  const columns: DataTableColumn<Receivable>[] = [
    {
      key: "member",
      header: "Miembro",
      cell: (r) => (
        <div>
          <p className="font-medium text-[var(--text-base)]">{r.member_name}</p>
          <p className="text-xs text-[var(--text-muted)]">{r.phone ?? "Sin teléfono"}</p>
        </div>
      ),
    },
    { key: "plan", header: "Plan", cell: (r) => <span className="text-[var(--text-muted)]">{r.plan_name}</span> },
    {
      key: "status",
      header: "Estado",
      cell: (r) =>
        r.kind === "renewal" ? (
          <StatusBadge
            status={r.effective_status}
            label={r.days_overdue > 0 ? `Vencida hace ${r.days_overdue}d` : undefined}
          />
        ) : (
          <StatusBadge status="pending" label="Saldo pendiente" />
        ),
    },
    {
      key: "end_date",
      header: "Venció",
      hideOnMobile: true,
      cell: (r) => <span className="text-[var(--text-muted)] text-sm">{formatDate(r.end_date)}</span>,
    },
    {
      key: "amount",
      header: "Por cobrar",
      cell: (r) => (
        <span className="font-bold font-mono text-[var(--text-base)]">{formatCOP(r.amount_due)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (r) => {
        const wa = whatsappLink(r);
        return (
          <div className="flex items-center justify-end gap-1.5">
            {r.kind === "renewal" && r.plan_id && (
              <button
                type="button"
                title="Cobrar con link Wompi"
                disabled={linkBusy === `${r.member_id}-${r.kind}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void sendWompiLink(r);
                }}
                className="size-9 rounded-md border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--color-primary-ink)] hover:border-[var(--color-primary)]/50 transition-ui disabled:opacity-50"
              >
                {linkBusy === `${r.member_id}-${r.kind}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
              </button>
            )}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                title="Recordar por WhatsApp"
                className="size-9 rounded-md border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-ok)] hover:border-[var(--signal-ok-line)] transition-ui"
                onClick={(e) => e.stopPropagation()}
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCollect(r.member_id);
              }}
            >
              <HandCoins className="h-3.5 w-3.5 mr-1.5" />
              Cobrar
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
    <PendingTransfers onChanged={() => void receivables.refetch()} />
    <GlassCard className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[var(--color-primary-ink)]" />
          <h2 className="text-sm font-semibold text-[var(--text-base)]">Cuentas por cobrar</h2>
        </div>
        {receivables.data.length > 0 && (
          <p className="text-sm text-[var(--text-muted)]">
            {receivables.data.length} pendiente{receivables.data.length !== 1 ? "s" : ""} ·{" "}
            <span className="font-bold font-mono text-[var(--text-base)]">{formatCOP(total)}</span>
          </p>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={receivables.data}
        rowKey={(r) => `${r.member_id}-${r.kind}`}
        loading={receivables.loading}
        error={receivables.error}
        onRetry={() => void receivables.refetch()}
        emptyTitle="Nadie debe nada"
        emptyDescription="Cuando una membresía venza o quede un saldo parcial, aparecerá aquí."
      />
    </GlassCard>
    </div>
  );
}
