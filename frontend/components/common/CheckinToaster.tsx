"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReceptionEvents, type ReceptionEvent } from "@/hooks/useReceptionEvents";
import { CheckCircle2, XCircle, X } from "lucide-react";

const ALLOWED_DISMISS_MS = 6000;
const DENIED_DISMISS_MS = 20000;
const MAX_STACK = 3;

const DENIAL_LABELS: Record<string, string> = {
  expired: "membresía vencida",
  frozen: "membresía congelada",
  no_membership: "sin membresía",
  scheduled: "membresía aún no inicia",
};

interface StackedEvent extends ReceptionEvent {
  key: string;
}

function ToastCard({
  event,
  onClose,
  onAuthorize,
  authorizing,
}: {
  event: StackedEvent;
  onClose: () => void;
  onAuthorize: (memberId: string, reason: string) => void;
  authorizing: boolean;
}) {
  const [reason, setReason] = useState("");
  const denied = event.decision === "denied";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
      className={
        denied
          ? "w-[380px] rounded-2xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/90 p-4 shadow-2xl backdrop-blur"
          : "w-[380px] rounded-2xl border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/90 p-4 shadow-2xl backdrop-blur"
      }
    >
      <div className="flex items-center gap-3">
        {event.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.photo_url} alt="" className="h-14 w-14 rounded-full object-cover shrink-0 ring-2 ring-white/60" />
        ) : (
          <span
            className={
              denied
                ? "h-14 w-14 rounded-full bg-red-200 dark:bg-red-900/70 text-red-700 dark:text-red-300 flex items-center justify-center text-xl font-bold shrink-0"
                : "h-14 w-14 rounded-full bg-emerald-200 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xl font-bold shrink-0"
            }
          >
            {event.member_name?.[0]?.toUpperCase() ?? "?"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={
              denied
                ? "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400"
                : "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400"
            }
          >
            {denied ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {denied ? "Acceso rechazado" : event.decision === "override" ? "Entrada autorizada" : "Ingresó al gym"}
          </p>
          <p className="text-lg font-extrabold leading-tight text-[var(--text-base)] truncate">
            {event.member_name}
          </p>
          <p className={denied ? "text-sm text-red-600/90 dark:text-red-400" : "text-sm text-emerald-700/90 dark:text-emerald-400"}>
            {denied
              ? [
                  DENIAL_LABELS[event.denial_reason ?? ""] ?? event.denial_reason,
                  event.days_overdue ? `venció hace ${event.days_overdue}d` : null,
                  event.amount_due ? `debe ${formatCOP(event.amount_due)}` : null,
                ].filter(Boolean).join(" · ")
              : [
                  event.plan_name,
                  event.membership_status === "in_grace" ? "en gracia — recordar pago" : null,
                  event.upcoming_class ? `${event.upcoming_class.class_name} ${event.upcoming_class.start_time}` : null,
                ].filter(Boolean).join(" · ") || "Membresía al día"}
          </p>
        </div>
        <button onClick={onClose} className="self-start text-[var(--text-muted)] hover:text-[var(--text-base)] shrink-0" title="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>
      {denied && (
        <div className="flex items-center gap-2 mt-3">
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
            Autorizar
          </Button>
        </div>
      )}
    </motion.div>
  );
}

/** Tarjetas emergentes globales de check-in: visibles en todo el panel.
 * En /checkins se desactiva (esa página tiene su propio feed en vivo). */
export function CheckinToaster() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [events, setEvents] = useState<StackedEvent[]>([]);
  const [authorizing, setAuthorizing] = useState(false);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const onCheckinsPage = pathname?.startsWith("/checkins") ?? false;

  const removeEvent = (key: string) => {
    const t = timers.current.get(key);
    if (t) { clearTimeout(t); timers.current.delete(key); }
    setEvents((prev) => prev.filter((e) => e.key !== key));
  };

  useReceptionEvents((event) => {
    if (event.type !== "checkin") return;
    const key = `${event.member_id}-${event.at}`;
    const stacked: StackedEvent = { ...event, key };
    setEvents((prev) => [stacked, ...prev.filter((e) => e.member_id !== event.member_id)].slice(0, MAX_STACK));
    const ms = event.decision === "denied" ? DENIED_DISMISS_MS : ALLOWED_DISMISS_MS;
    timers.current.set(key, setTimeout(() => removeEvent(key), ms));
  }, !onCheckinsPage);

  const authorize = async (memberId: string, reason: string) => {
    if (!session?.accessToken) return;
    setAuthorizing(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.post("/api/v1/checkins/override", { member_id: memberId, reason });
      toast.success("Entrada autorizada");
      setEvents((prev) => prev.filter((e) => e.member_id !== memberId));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(parseApiError(e, "Error autorizando la entrada"));
    } finally {
      setAuthorizing(false);
    }
  };

  if (onCheckinsPage) return null;

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex flex-col-reverse gap-3 md:bottom-6 md:right-6 pointer-events-none [&>*]:pointer-events-auto">
      <AnimatePresence>
        {events.map((e) => (
          <ToastCard
            key={e.key}
            event={e}
            onClose={() => removeEvent(e.key)}
            onAuthorize={authorize}
            authorizing={authorizing}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
