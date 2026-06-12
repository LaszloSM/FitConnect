/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import MemberSelect from "@/components/common/MemberSelect";
import { QrScanner } from "@/components/common/QrScanner";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { formatCOP, formatTimeAgo, parseUTC } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { useReceptionEvents, type ReceptionEvent } from "@/hooks/useReceptionEvents";
import type { CheckIn, CheckinResult, MembershipStatus } from "@/types/models";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, CheckCircle2, QrCode, User, XCircle } from "lucide-react";
import { toast } from "sonner";

type ActiveTab = "qr" | "manual";

const STATUS_UI: Record<
  MembershipStatus,
  { label: string; tone: "ok" | "warn" | "bad"; icon: typeof CheckCircle2 }
> = {
  ok:            { label: "Membresía activa",                tone: "ok",   icon: CheckCircle2 },
  in_grace:      { label: "Vencida — en período de gracia",  tone: "warn", icon: AlertCircle },
  frozen:        { label: "Membresía congelada",             tone: "bad",  icon: XCircle },
  expired:       { label: "Membresía vencida",               tone: "bad",  icon: XCircle },
  no_membership: { label: "Sin membresía activa",            tone: "bad",  icon: XCircle },
};

function ConfirmationCard({
  result,
  onOverride,
  overriding,
}: {
  result: CheckinResult;
  onOverride: (reason: string) => void;
  overriding: boolean;
}) {
  const ui = STATUS_UI[result.membership_status] ?? STATUS_UI.no_membership;
  const Icon = ui.icon;
  const denied = result.decision === "denied";
  const isOverride = result.decision === "override";
  const [reason, setReason] = useState("");

  const toneCls = denied
    ? "bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-900/50 text-red-700 dark:text-red-400"
    : ui.tone === "ok"
    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/40 text-green-700 dark:text-green-400"
    : ui.tone === "warn"
    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400"
    : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
      className={cn("rounded-xl border p-4 space-y-3", toneCls)}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-8 w-8 shrink-0" strokeWidth={2} />
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight">
            {denied ? "ACCESO DENEGADO" : isOverride ? "Entrada autorizada" : "Entrada registrada"}
            {" — "}
            {result.member_name ?? "el miembro"}
          </p>
          <p className="text-xs opacity-80">{ui.label}</p>
        </div>
      </div>
      {denied && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo para autorizar la entrada..."
            className="h-9 text-sm bg-white/70 dark:bg-black/20 border-red-200 dark:border-red-900/50"
          />
          <Button
            type="button"
            disabled={overriding || !reason.trim()}
            onClick={() => onOverride(reason.trim())}
            className="h-9 shrink-0 bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            {overriding ? "Autorizando..." : "Autorizar entrada"}
          </Button>
        </div>
      )}
    </motion.div>
  );
}

const DENIAL_LABELS: Record<string, string> = {
  expired: "vencida",
  frozen: "congelada",
  no_membership: "sin membresía",
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

export default function CheckinsClient() {
  const { data: session } = useSession();
  const {
    data: checkins,
    loading,
    error,
    refetch: fetchToday,
  } = useApiResource<CheckIn[]>("/api/v1/checkins/today", []);
  const [activeTab, setActiveTab] = useState<ActiveTab>("qr");
  const [result, setResult] = useState<CheckinResult | null>(null);

  const [qrCode, setQrCode] = useState("");
  const [submittingQr, setSubmittingQr] = useState(false);

  const [memberId, setMemberId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<ReceptionEvent[]>([]);

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
      handleError(err, "Error autorizando la entrada");
    } finally {
      setOverriding(false);
    }
  };

  const handleResult = (data: CheckinResult) => {
    setResult(data);
    if (data.decision === "denied") {
      toast.error(`Acceso denegado: ${data.member_name ?? "miembro"}`);
    }
    void fetchToday();
  };

  const handleOverride = async (reason: string) => {
    if (!session?.accessToken || !result?.member_id) return;
    setOverriding(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.post("/api/v1/checkins/override", {
        member_id: result.member_id,
        reason,
      });
      setResult(res.data);
      toast.success("Entrada autorizada");
      void fetchToday();
    } catch (err: any) {
      handleError(err, "Error autorizando la entrada");
    } finally {
      setOverriding(false);
    }
  };

  const handleError = (err: any, fallback: string) => {
    const detail = err.response?.data?.detail;
    toast.error(typeof detail === "string" ? detail : fallback);
  };

  const submitQrCode = async (code: string) => {
    const trimmed = code.trim();
    if (!session?.accessToken || !trimmed || submittingQr) return;
    setSubmittingQr(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.post(`/api/v1/checkins/qr/${trimmed}`);
      handleResult(res.data);
      setQrCode("");
    } catch (err: any) {
      handleError(err, "Error registrando check-in por QR");
    } finally {
      setSubmittingQr(false);
    }
  };

  const handleQrCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitQrCode(qrCode);
  };

  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken || !memberId) return;
    setSubmitting(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.post("/api/v1/checkins", {
        member_id: memberId,
        notes: notes || undefined,
      });
      handleResult(res.data);
      setMemberId("");
      setNotes("");
    } catch (err: any) {
      handleError(err, "Error registrando check-in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <PageHeader module="checkins" title="Check-ins" subtitle="Registra la asistencia de los miembros" />

      {/* Denegados del kiosko/QR saltando en vivo */}
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

      <GlassCard className="p-0 overflow-hidden">
        <div className="flex border-b border-[var(--border-base)]">
          {([
            { key: "qr", label: "Por QR", icon: QrCode },
            { key: "manual", label: "Manual", icon: User },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors relative",
                activeTab === key
                  ? "text-[var(--color-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-base)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {activeTab === key && (
                <motion.span
                  layoutId="checkin-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)]"
                />
              )}
            </button>
          ))}
        </div>

        {activeTab === "qr" && (
          <motion.div
            key="qr-tab"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="p-6"
          >
            <div className="flex flex-col items-center gap-5 max-w-sm mx-auto py-2">
              <QrScanner onDecode={submitQrCode} paused={submittingQr} />

              <p className="text-[var(--text-muted)] text-sm text-center leading-relaxed">
                Escanea el QR del carné con la cámara, o ingrésalo manualmente
                <br />
                <span className="text-xs opacity-80">(también compatible con lectores USB)</span>
              </p>

              <form onSubmit={handleQrCheckin} className="w-full flex flex-col gap-3">
                <Input
                  value={qrCode}
                  onChange={(e) => setQrCode(e.target.value)}
                  placeholder="Código QR del miembro..."
                  className="text-center text-base h-12 bg-[var(--bg-input)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)] tracking-widest"
                />
                <Button
                  type="submit"
                  disabled={submittingQr || !qrCode.trim()}
                  className="w-full h-11 bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:opacity-90 transition-opacity"
                >
                  {submittingQr ? "Registrando..." : "Registrar asistencia"}
                </Button>
              </form>
            </div>
          </motion.div>
        )}

        {activeTab === "manual" && (
          <motion.div
            key="manual-tab"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="p-6"
          >
            <form onSubmit={handleCheckin} className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px] space-y-2">
                  <Label className="text-[var(--text-muted)] text-sm">Miembro</Label>
                  <MemberSelect value={memberId} onChange={(id) => setMemberId(id)} />
                </div>
                <Button
                  type="submit"
                  disabled={submitting || !memberId}
                  className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:opacity-90 transition-opacity h-9"
                >
                  {submitting ? "Registrando..." : "Registrar asistencia"}
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Nota (opcional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones del check-in..."
                />
              </div>
            </form>
          </motion.div>
        )}

        <div className="px-6 pb-6">
          <AnimatePresence mode="wait">
            {result && (
              <ConfirmationCard
                key={result.created_at}
                result={result}
                onOverride={handleOverride}
                overriding={overriding}
              />
            )}
          </AnimatePresence>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h2 className="text-sm font-semibold text-[var(--text-base)] mb-4">Asistencia de hoy</h2>

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
                      description="Usa el QR o el formulario manual para registrar la primera entrada del día"
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
