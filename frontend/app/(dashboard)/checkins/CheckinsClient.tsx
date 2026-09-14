/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Panel, PanelRow } from "@/components/dashboard/Panel";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP, formatDateTime, formatTimeAgo } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { useReceptionEvents, type ReceptionEvent } from "@/hooks/useReceptionEvents";
import type { CheckIn } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { WarningCircleIcon as AlertCircle, TelevisionIcon as Tv, XIcon as X } from "@phosphor-icons/react";
import { toast } from "sonner";

const DENIAL_LABELS: Record<string, string> = {
  expired: "vencida",
  frozen: "congelada",
  no_membership: "sin membresía",
  scheduled: "aún no inicia",
};

function LiveDeniedCard({
  event,
  onAuthorize,
  onDismiss,
  authorizing,
}: {
  event: ReceptionEvent;
  onAuthorize: (memberId: string, reason: string) => void;
  onDismiss: (memberId: string) => void;
  authorizing: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      role="alert"
      className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--signal-danger-line)] bg-[var(--signal-danger-bg)] p-4"
    >
      <div className="flex items-center gap-3">
        {event.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.photo_url} alt="" className="size-12 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-panel text-lg font-semibold text-ink">
            {event.member_name[0]?.toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight text-ink">{event.member_name} está en la entrada</p>
          <p className="text-sm text-[var(--signal-danger)]">
            Membresía {DENIAL_LABELS[event.denial_reason ?? ""] ?? event.denial_reason}
            {event.plan_name ? ` · ${event.plan_name}` : ""}
            {event.days_overdue ? ` · venció hace ${event.days_overdue} d` : ""}
            {event.amount_due ? ` · debe ${formatCOP(event.amount_due)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(event.member_id)}
          aria-label="Descartar aviso"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-panel hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo para dejarlo entrar (queda en la auditoría)"
          aria-label="Motivo para autorizar la entrada"
        />
        <Button
          type="button"
          disabled={authorizing || !reason.trim()}
          onClick={() => onAuthorize(event.member_id, reason.trim())}
          className="shrink-0"
        >
          Autorizar entrada
        </Button>
      </div>
    </motion.div>
  );
}

function DecisionBadge({ decision, denialReason }: { decision?: string | null; denialReason?: string | null }) {
  if (decision === "denied") {
    return (
      <StatusBadge
        status="denied"
        label={`Denegado${denialReason ? ` · ${DENIAL_LABELS[denialReason] ?? denialReason}` : ""}`}
      />
    );
  }
  if (decision === "override") return <StatusBadge status="override" />;
  return <StatusBadge status="allowed" />;
}

/** Pantalla completa para un monitor en recepción: entradas en vivo, legibles a distancia. */
function TvMode({ checkins, onExit }: { checkins: CheckIn[]; onExit: () => void }) {
  const allowed = checkins.filter((c) => c.decision !== "denied").length;
  const recent = checkins.slice(0, 8);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col gap-8 overflow-hidden bg-surface p-6 md:p-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-lg text-ink-muted">Entradas de hoy</p>
          <p className="font-mono text-7xl font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">{allowed}</p>
        </div>
        <Button variant="outline" size="lg" onClick={onExit}>
          <X /> Salir (Esc)
        </Button>
      </div>

      <ul className="grid flex-1 grid-cols-1 content-start gap-3 overflow-hidden lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {recent.map((c) => {
            const denied = c.decision === "denied";
            return (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="flex items-center gap-5 rounded-[var(--radius-lg)] border p-5"
                style={{
                  borderColor: denied ? "var(--signal-danger-line)" : "var(--border-base)",
                  background: denied ? "var(--signal-danger-bg)" : "var(--bg-card)",
                }}
              >
                <span className="w-20 shrink-0 font-mono text-2xl text-ink-muted tabular-nums">
                  {formatDateTime(c.created_at, "HH:mm")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-3xl font-semibold leading-tight text-ink">{c.member_name ?? "Socio"}</p>
                  <p className="text-lg" style={{ color: denied ? "var(--signal-danger)" : "var(--text-muted)" }}>
                    {denied
                      ? `Rechazado · membresía ${DENIAL_LABELS[c.denial_reason ?? ""] ?? ""}`
                      : c.decision === "override"
                      ? "Entrada autorizada por recepción"
                      : "Bienvenido"}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export default function CheckinsClient() {
  const { data: session } = useSession();
  const { data: checkins, loading, error, refetch: fetchToday } = useApiResource<CheckIn[]>("/api/v1/checkins/today", []);
  const [overriding, setOverriding] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<ReceptionEvent[]>([]);
  const [tvMode, setTvMode] = useState(false);

  useReceptionEvents((event) => {
    if (event.type !== "checkin") return;
    void fetchToday();
    if (event.decision === "denied") {
      toast.error(`${event.member_name} en la entrada: acceso denegado`);
      setLiveAlerts((prev) => [event, ...prev.filter((a) => a.member_id !== event.member_id)].slice(0, 5));
    } else {
      // allowed/override: limpiar la alerta pendiente de ese miembro
      setLiveAlerts((prev) => prev.filter((a) => a.member_id !== event.member_id));
    }
  });

  const authorizeFromAlert = async (alertMemberId: string, reason: string) => {
    if (!session?.accessToken) return;
    setOverriding(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.post("/api/v1/checkins/override", { member_id: alertMemberId, reason });
      toast.success("Entrada autorizada");
      setLiveAlerts((prev) => prev.filter((a) => a.member_id !== alertMemberId));
      void fetchToday();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error autorizando la entrada"));
    } finally {
      setOverriding(false);
    }
  };

  const allowedToday = checkins.filter((c) => c.decision !== "denied").length;
  const deniedToday = checkins.length - allowedToday;
  const last = checkins[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-ins"
        subtitle="Las entradas del kiosko y de recepción aparecen aquí al instante."
        action={
          <Button type="button" variant="outline" size="lg" onClick={() => setTvMode(true)}>
            <Tv /> Modo TV
          </Button>
        }
      />

      {/* Portal: un ancestro del layout con transform convierte el fixed en relativo a él. */}
      {tvMode && createPortal(<TvMode checkins={checkins} onExit={() => setTvMode(false)} />, document.body)}

      {/* Denegados del kiosko saltando en vivo */}
      <AnimatePresence>
        {liveAlerts.map((alert) => (
          <LiveDeniedCard
            key={`${alert.member_id}-${alert.at}`}
            event={alert}
            onAuthorize={authorizeFromAlert}
            onDismiss={(id) => setLiveAlerts((prev) => prev.filter((a) => a.member_id !== id))}
            authorizing={overriding}
          />
        ))}
      </AnimatePresence>

      {/* Cifras del día: una franja, no tres tarjetas. */}
      <section
        aria-label="Cifras de hoy"
        className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-[var(--radius-lg)] border border-line bg-panel md:grid-cols-3"
      >
        <div className="flex flex-col gap-1.5 p-4 md:px-5">
          <span className="text-sm text-ink-muted">Entradas hoy</span>
          <span className="font-mono text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums">{allowedToday}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 md:px-5">
          <span className="text-sm text-ink-muted">Rechazadas hoy</span>
          <span
            className="font-mono text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums"
            style={{ color: deniedToday > 0 ? "var(--signal-danger)" : "var(--text-base)" }}
          >
            {deniedToday}
          </span>
        </div>
        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 border-t border-line p-4 md:col-span-1 md:border-t-0 md:px-5">
          <span className="text-sm text-ink-muted">Última entrada</span>
          <span className="truncate text-lg font-semibold text-ink">
            {last?.member_name ? `${last.member_name} · ${formatDateTime(last.created_at, "HH:mm")}` : "Todavía nadie"}
          </span>
        </div>
      </section>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
            Asistencia de hoy
          </span>
        }
        count={loading ? undefined : checkins.length}
      >
        {error && (
          <p role="alert" className="flex items-center gap-2 px-4 py-3 text-sm text-[var(--signal-danger)]">
            <AlertCircle className="size-4" /> {error}
          </p>
        )}
        {loading ? (
          <ul className="divide-y divide-line" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <PanelRow key={i}>
                <div className="skeleton h-4 w-11" />
                <div className="skeleton h-4 flex-1" />
                <div className="skeleton h-6 w-24" />
              </PanelRow>
            ))}
          </ul>
        ) : checkins.length === 0 ? (
          <EmptyState
            title="Nadie ha entrado todavía hoy"
            description="Cuando alguien ingrese por el kiosko o por recepción aparece aquí al instante. El kiosko se configura en Configuración → Dispositivos."
          />
        ) : (
          <ul className="divide-y divide-line" aria-live="polite">
            {checkins.map((c) => (
              <PanelRow key={c.id}>
                <span
                  className="w-11 shrink-0 font-mono text-sm text-ink-muted tabular-nums"
                  title={formatTimeAgo(c.created_at)}
                >
                  {formatDateTime(c.created_at, "HH:mm")}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {c.member_name ?? `${c.member_id.slice(0, 8)}…`}
                </span>
                <DecisionBadge decision={c.decision} denialReason={c.denial_reason} />
              </PanelRow>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
