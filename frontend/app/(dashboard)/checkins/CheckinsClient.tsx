/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Avatar, CardHead } from "@/components/dashboard/hoy/parts";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP, formatDateTime, formatTimeAgo } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { useReceptionEvents, type ReceptionEvent } from "@/hooks/useReceptionEvents";
import type { CheckIn } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { TelevisionIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

const DENIAL_LABELS: Record<string, string> = {
  expired: "vencida",
  frozen: "congelada",
  no_membership: "sin membresía",
  no_entries: "sin entradas en su ticketera",
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
  const reduce = useReducedMotion();
  const detail = [
    event.plan_name,
    event.days_overdue ? `venció hace ${event.days_overdue} ${event.days_overdue === 1 ? "día" : "días"}` : null,
    event.amount_due ? `debe ${formatCOP(event.amount_due)}` : null,
  ].filter(Boolean);

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, transform: "translateY(-8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      role="alert"
      className="card overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 bg-[var(--signal-danger-bg)] px-5 py-3 text-[var(--signal-danger)]">
        <span className="flex items-center gap-2.5 text-base font-bold">
          <span className="flex size-7 items-center justify-center rounded-[9px] bg-[var(--signal-danger)] text-[var(--bg-card)]">
            <XIcon className="size-4" weight="bold" />
          </span>
          No puede entrar
        </span>
        <span className="flex items-center gap-2">
          <span className="num text-[15px]">{formatDateTime(event.at, "HH:mm")}</span>
          <button
            type="button"
            onClick={() => onDismiss(event.member_id)}
            aria-label="Descartar aviso"
            className="flex size-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--signal-danger)] hover:bg-panel"
          >
            <XIcon className="size-4" />
          </button>
        </span>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-4">
          {event.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.photo_url} alt="" className="size-16 shrink-0 rounded-[20px] object-cover" />
          ) : (
            <Avatar name={event.member_name} size={64} />
          )}
          <div className="min-w-0">
            <p className="font-display text-2xl font-bold leading-tight text-ink">{event.member_name}</p>
            <p className="text-sm text-[var(--signal-danger)]">
              Membresía {DENIAL_LABELS[event.denial_reason ?? ""] ?? event.denial_reason}
              {detail.length > 0 && <span className="text-ink-muted">, {detail.join(", ")}</span>}
            </p>
          </div>
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
            variant="outline"
            disabled={authorizing || !reason.trim()}
            onClick={() => onAuthorize(event.member_id, reason.trim())}
            className="shrink-0"
          >
            Dejar pasar hoy
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function DecisionBadge({ decision, denialReason }: { decision?: string | null; denialReason?: string | null }) {
  if (decision === "denied") {
    return (
      <StatusBadge
        status="denied"
        label={`No entró${denialReason ? `, ${DENIAL_LABELS[denialReason] ?? denialReason}` : ""}`}
      />
    );
  }
  if (decision === "override") return <StatusBadge status="override" label="Autorizado" />;
  return <StatusBadge status="allowed" label="Entró" />;
}

/** Pantalla completa para un monitor en recepción: entradas en vivo, legibles a distancia. */
function TvMode({ checkins, onExit }: { checkins: CheckIn[]; onExit: () => void }) {
  const allowed = checkins.filter((c) => c.decision !== "denied").length;
  const recent = checkins.slice(0, 8);
  const reduce = useReducedMotion();

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
          <p className="text-xl font-semibold text-ink-muted">Entradas de hoy</p>
          <p className="num text-8xl leading-none text-ink">{allowed}</p>
        </div>
        <Button variant="outline" size="lg" onClick={onExit}>
          <XIcon /> Salir (Esc)
        </Button>
      </div>

      <ul className="grid flex-1 grid-cols-1 content-start gap-4 overflow-hidden lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {recent.map((c) => {
            const denied = c.decision === "denied";
            return (
              <motion.li
                key={c.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, transform: "translateY(-12px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="card flex items-center gap-5 p-5"
                style={denied ? { background: "var(--signal-danger-bg)" } : undefined}
              >
                <span className="num w-24 shrink-0 text-3xl text-ink-muted">{formatDateTime(c.created_at, "HH:mm")}</span>
                <Avatar name={c.member_name} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-3xl font-bold leading-tight text-ink">{c.member_name ?? "Socio"}</p>
                  <p className="text-lg" style={{ color: denied ? "var(--signal-danger)" : "var(--text-muted)" }}>
                    {denied
                      ? `No puede entrar: membresía ${DENIAL_LABELS[c.denial_reason ?? ""] ?? ""}`
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
      toast.error(`${event.member_name} en la entrada: no puede entrar`);
      setLiveAlerts((prev) => [event, ...prev.filter((a) => a.member_id !== event.member_id)].slice(0, 5));
    } else {
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
        title="Mostrador"
        action={
          <Button type="button" variant="outline" onClick={() => setTvMode(true)}>
            <TelevisionIcon /> Modo TV
          </Button>
        }
      />

      {/* Portal: un ancestro del layout con transform convierte el fixed en relativo a él. */}
      {tvMode && createPortal(<TvMode checkins={checkins} onExit={() => setTvMode(false)} />, document.body)}

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

      <section aria-label="Cifras de hoy" className="card grid gap-5 p-5 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:gap-0 md:p-6">
        <div className="sm:pr-8">
          <p className="text-[13px] font-semibold text-ink-muted">Entradas hoy</p>
          <p className="num mt-1.5 text-[44px] leading-none text-ink">{loading ? "—" : allowedToday}</p>
        </div>
        <div className="sm:border-l sm:border-line sm:px-8">
          <p className="text-[13px] font-semibold text-ink-muted">No pudieron entrar</p>
          <p
            className="num mt-1.5 text-[44px] leading-none"
            style={{ color: deniedToday > 0 ? "var(--signal-danger)" : "var(--text-base)" }}
          >
            {loading ? "—" : deniedToday}
          </p>
        </div>
        <div className="min-w-0 sm:border-l sm:border-line sm:pl-8">
          <p className="text-[13px] font-semibold text-ink-muted">Última entrada</p>
          {last ? (
            <div className="mt-2 flex items-center gap-3">
              <Avatar name={last.member_name} size={44} />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-ink">{last.member_name ?? "Socio"}</p>
                <p className="text-[13px] text-ink-muted">
                  <span className="num">{formatDateTime(last.created_at, "HH:mm")}</span>, {formatTimeAgo(last.created_at)}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-base text-ink-muted">{loading ? "" : "Todavía nadie"}</p>
          )}
        </div>
      </section>

      <section className="card p-5 md:p-6">
        <CardHead
          title={
            <>
              <span className="size-2 rounded-full bg-[var(--signal-ok)] shadow-[0_0_0_4px_var(--signal-ok-bg)]" aria-hidden="true" />
              Entradas en vivo
            </>
          }
          count={loading ? undefined : checkins.length}
        />
        {error && (
          <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-[var(--signal-danger)]">
            <WarningCircleIcon className="size-4" /> {error}
          </p>
        )}
        {loading ? (
          <ul className="mt-3 divide-y divide-line/60" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <div className="skeleton h-4 w-11" />
                <div className="skeleton size-9 rounded-[12px]" />
                <div className="skeleton h-4 flex-1" />
                <div className="skeleton h-6 w-20" />
              </li>
            ))}
          </ul>
        ) : checkins.length === 0 ? (
          <EmptyState
            title="Nadie ha entrado todavía hoy"
            description="Cuando alguien ingrese por el kiosko o por recepción aparece aquí al instante. El kiosko se configura en Ajustes, Dispositivos."
          />
        ) : (
          <ul className="mt-3 divide-y divide-line/60" aria-live="polite">
            {checkins.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <span className="num w-11 shrink-0 text-[13px] text-ink-muted" title={formatTimeAgo(c.created_at)}>
                  {formatDateTime(c.created_at, "HH:mm")}
                </span>
                <Avatar name={c.member_name} size={36} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {c.member_name ?? `${c.member_id.slice(0, 8)}…`}
                </span>
                <DecisionBadge decision={c.decision} denialReason={c.denial_reason} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
