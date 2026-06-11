"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { apiClient } from "@/lib/api";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import type { AuditLogEntry } from "@/lib/types";
import { ScrollText, ShieldAlert, Loader2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

const ACTION_LABELS: Record<string, string> = {
  "membership.assign": "Asignó membresía",
  "membership.freeze": "Congeló membresía",
  "membership.unfreeze": "Reactivó membresía",
  "membership.cancel": "Canceló membresía",
  "checkin.override": "Autorizó entrada denegada",
  "payment.create": "Registró pago",
  "payment.update": "Editó pago",
  "payment.delete": "Eliminó pago",
  "payment.mark_paid": "Marcó pago como pagado",
  "payment.wompi_confirmed": "Pago Wompi confirmado",
  "cash.open": "Abrió caja",
  "cash.close": "Cerró caja",
};

const ACTION_FILTERS = [
  { value: "", label: "Todas las acciones" },
  { value: "membership", label: "Membresías" },
  { value: "payment", label: "Pagos" },
  { value: "checkin", label: "Check-ins" },
  { value: "cash", label: "Caja" },
];

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function detailsSummary(details: Record<string, unknown> | null): string {
  if (!details) return "";
  const parts: string[] = [];
  if (typeof details.plan_name === "string") parts.push(details.plan_name);
  if (typeof details.reason === "string" && details.reason) parts.push(`motivo: ${details.reason}`);
  if (typeof details.days_applied === "number") parts.push(`${details.days_applied} días aplicados`);
  if (typeof details.price === "string") parts.push(`$${Number(details.price).toLocaleString("es-CO")}`);
  if (typeof details.discount === "string" && details.discount) parts.push(`desc. $${Number(details.discount).toLocaleString("es-CO")}`);
  return parts.join(" · ");
}

export default function AuditClient() {
  const { data: session } = useSession();
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  useEffect(() => {
    if (!session?.accessToken) return;
    setLoading(true);
    const client = apiClient(session.accessToken as string);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (actionFilter) params.set("action", actionFilter);
    client
      .get(`/api/v1/audit?${params}`)
      .then((res) => {
        setItems(res.data.items);
        setTotal(res.data.total);
      })
      .catch((err) => {
        if (err.response?.status === 403) setForbidden(true);
      })
      .finally(() => setLoading(false));
  }, [session?.accessToken, actionFilter, offset]);

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <ShieldAlert className="h-10 w-10 text-[var(--text-muted)]" />
        <p className="text-[var(--text-muted)] text-sm">
          Solo el propietario puede ver el historial de auditoría.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-5"
    >
      <PageHeader
        module="settings"
        title="Auditoría"
        subtitle="Quién hizo qué — acciones sensibles del staff"
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
          className="h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
        >
          {ACTION_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <p className="text-xs text-[var(--text-muted)]">{total} registros</p>
      </div>

      <GlassCard className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <ScrollText className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-[var(--text-muted)] text-sm">Sin registros de auditoría todavía</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-base)]">
                    <span className="font-semibold">{entry.actor_name}</span>{" "}
                    <span className="text-[var(--text-muted)]">{actionLabel(entry.action).toLowerCase()}</span>
                  </p>
                  {detailsSummary(entry.details) && (
                    <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {detailsSummary(entry.details)}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: es })}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {format(new Date(entry.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {total > LIMIT && (
          <div className="flex justify-center gap-2 pt-4">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] disabled:opacity-40 transition-colors"
            >
              ← Anterior
            </button>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] disabled:opacity-40 transition-colors"
            >
              Siguiente →
            </button>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
