/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { apiClient } from "@/lib/api";
import { formatCOP, formatTimeAgo, parseUTC } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { useReceptionEvents, type ReceptionEvent } from "@/hooks/useReceptionEvents";
import type { CheckIn } from "@/types/models";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, AlertCircle, CheckCircle2, Tv, X, XCircle } from "lucide-react";
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
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      className="rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 space-y-3"
    >
      <div className="flex items-center gap-3">
        {event.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.photo_url} alt="" className="h-12 w-12 rounded-full object-cover shrink-0" />
        ) : (
          <span className="h-12 w-12 rounded-full bg-red-200 dark:bg-red-900/60 text-red-700 dark:text-red-300 flex items-center justify-center text-lg font-bold shrink-0">
            {event.member_name[0]?.toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-red-700 dark:text-red-300 leading-tight">
            {event.member_name} — en la entrada
          </p>
          <p className="text-sm text-red-600/90 dark:text-red-400">
            {DENIAL_LABELS[event.denial_reason ?? ""] ?? event.denial_reason}
            {event.plan_name ? ` · ${event.plan_name}` : ""}
            {event.days_overdue ? ` · venció hace ${event.days_overdue}d` : ""}
            {event.amount_due ? ` · debe ${formatCOP(event.amount_due)}` : ""}
          </p>
        </div>
        <button
          onClick={() => onDismiss(event.member_id)}
          className="text-red-400 hover:text-red-600 shrink-0"
          title="Descartar"
        >
          <XCircle className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo para autorizar..."
          className="h-9 text-sm bg-white/70 dark:bg-black/20 border-red-200 dark:border-red-900/50"
        />
        <Button
          type="button"
          disabled={authorizing || !reason.trim()}
          onClick={() => onAuthorize(event.member_id, reason.trim())}
          className="h-9 shrink-0 bg-red-600 hover:bg-red-700 text-white font-semibold"
        >
          Autorizar entrada
        </Button>
      </div>
    </motion.div>
  );
}

function DecisionBadge({
  decision,
  denialReason,
}: {
  decision?: string | null;
  denialReason?: string | null;
}) {
  if (decision === "denied") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-800/60">
        Denegado{denialReason ? ` · ${DENIAL_LABELS[denialReason] ?? denialReason}` : ""}
      </span>
    );
  }
  if (decision === "override") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-800/60">
        Autorizado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800/60">
      Permitido
    </span>
  );
}

/** Pantalla completa para un monitor en recepción: entradas en vivo, bien grandes. */
function TvMode({ checkins, onExit }: { checkins: CheckIn[]; onExit: () => void }) {
  const allowed = checkins.filter((c) => c.decision !== "denied").length;
  const recent = checkins.slice(0, 8);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--bg-base)] p-10 flex flex-col gap-8 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="h-12 w-12 rounded-2xl bg-[var(--color-primary)] text-[var(--color-primary-contrast)] flex items-center justify-center">
            <Activity className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm uppercase tracking-widest text-[var(--text-muted)] font-semibold">Asistencia de hoy</p>
            <p className="text-6xl font-extrabold text-[var(--text-base)] font-display leading-none">{allowed}</p>
          </div>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-2 rounded-xl border border-[var(--border-base)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
        >
          <X className="h-4 w-4" /> Salir (Esc)
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start overflow-hidden">
        <AnimatePresence initial={false}>
          {recent.map((c) => {
            const denied = c.decision === "denied";
            return (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, scale: 0.9, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border p-5",
                  denied
                    ? "border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30"
                    : "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20"
                )}
              >
                <span
                  className={cn(
                    "h-14 w-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0",
                    denied
                      ? "bg-red-200 dark:bg-red-900/70 text-red-700 dark:text-red-300"
                      : "bg-emerald-200 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300"
                  )}
                >
                  {(c.member_name?.[0] ?? "?").toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold text-[var(--text-base)] truncate leading-tight">
                    {c.member_name ?? "Miembro"}
                  </p>
                  <p className={cn("text-sm font-medium", denied ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
                    {denied ? `Rechazado · ${DENIAL_LABELS[c.denial_reason ?? ""] ?? ""}` : c.decision === "override" ? "Autorizado" : "Bienvenido"}
                    {" · "}
                    {formatTimeAgo(c.created_at)}
                  </p>
                </div>
                {denied ? (
                  <XCircle className="h-8 w-8 text-red-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function CheckinsClient() {
  const { data: session } = useSession();
  const {
    data: checkins,
    loading,
    error,
    refetch: fetchToday,
  } = useApiResource<CheckIn[]>("/api/v1/checkins/today", []);
  const [overriding, setOverriding] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<ReceptionEvent[]>([]);
  const [tvMode, setTvMode] = useState(false);

  useReceptionEvents((event) => {
    if (event.type !== "checkin") return;
    void fetchToday();
    if (event.decision === "denied") {
      toast.error(`${event.member_name} en la entrada — acceso denegado`);
      setLiveAlerts((prev) =>
        [event, ...prev.filter((a) => a.member_id !== event.member_id)].slice(0, 5)
      );
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
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error autorizando la entrada");
    } finally {
      setOverriding(false);
    }
  };

  const allowedToday = checkins.filter((c) => c.decision !== "denied").length;
  const deniedToday = checkins.length - allowedToday;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <PageHeader
        module="checkins"
        title="Check-ins"
        subtitle="Las entradas del quiosco aparecen aquí en vivo"
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => setTvMode(true)}
            className="border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
          >
            <Tv className="h-4 w-4 mr-2" />
            Modo TV
          </Button>
        }
      />

      {tvMode && <TvMode checkins={checkins} onExit={() => setTvMode(false)} />}

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

      {/* Contadores del día */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <GlassCard className="p-4">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold">Ingresos hoy</p>
          <p className="text-3xl font-extrabold text-[var(--text-base)] font-display mt-1">{allowedToday}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold">Rechazados hoy</p>
          <p className={cn("text-3xl font-extrabold font-display mt-1", deniedToday > 0 ? "text-red-500" : "text-[var(--text-base)]")}>{deniedToday}</p>
        </GlassCard>
        <GlassCard className="p-4 hidden sm:block">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold">Última entrada</p>
          <p className="text-lg font-bold text-[var(--text-base)] mt-2 truncate">
            {checkins[0]?.member_name ? `${checkins[0].member_name} · ${formatTimeAgo(checkins[0].created_at)}` : "—"}
          </p>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h2 className="text-sm font-semibold text-[var(--text-base)] mb-4 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-primary)]" />
          </span>
          Asistencia de hoy — en vivo
        </h2>

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
                <TableHead className="text-[var(--text-muted)]">Miembro</TableHead>
                <TableHead className="text-[var(--text-muted)]">Acceso</TableHead>
                <TableHead className="text-[var(--text-muted)]">Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-[var(--border-base)]">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="skeleton h-4 rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : checkins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <EmptyState
                      title="Sin asistencia hoy"
                      description="Cuando alguien ingrese por el quiosco, aparecerá aquí al instante. Configura tu quiosco en Configuración → Kiosko."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                checkins.map((c) => (
                  <TableRow key={c.id} className="border-[var(--border-base)] hover:bg-[var(--bg-base)]">
                    <TableCell className="text-[var(--text-base)] font-medium">
                      {c.member_name ?? `${c.member_id.slice(0, 8)}…`}
                    </TableCell>
                    <TableCell className="text-sm">
                      <DecisionBadge decision={c.decision} denialReason={c.denial_reason} />
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] text-sm">
                      <span title={parseUTC(c.created_at).toLocaleString("es-CO")}>
                        {formatTimeAgo(c.created_at)}
                      </span>
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
