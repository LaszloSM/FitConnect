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
import { CheckCircleIcon as CheckCircle2, XCircleIcon as XCircle, XIcon as X } from "@phosphor-icons/react";

const ALLOWED_DISMISS_MS = 6000;
const DENIED_DISMISS_MS = 20000;
const MAX_STACK = 3;

const DENIAL_LABELS: Record<string, string> = {
  expired: "membresía vencida",
  frozen: "membresía congelada",
  no_membership: "sin membresía",
  no_entries: "sin entradas en su ticketera",
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
  const tone = denied ? "danger" : "ok";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      role={denied ? "alert" : "status"}
      className="w-[min(380px,calc(100vw-2rem))] rounded-[var(--radius-xl)] border bg-panel p-4 shadow-[var(--shadow-lg)]"
      style={{ borderColor: `var(--signal-${tone}-line)` }}
    >
      <div className="flex items-center gap-3">
        {event.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.photo_url} alt="" className="size-14 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-ink">
            {event.member_name?.[0]?.toUpperCase() ?? "?"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: `var(--signal-${tone})` }}>
            {denied ? <XCircle className="size-4" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
            {denied ? "Acceso rechazado" : event.decision === "override" ? "Entrada autorizada" : "Entró al gimnasio"}
          </p>
          <p className="truncate text-lg font-semibold leading-tight text-ink">{event.member_name}</p>
          <p className="text-sm text-ink-muted">
            {denied
              ? [
                  DENIAL_LABELS[event.denial_reason ?? ""] ?? event.denial_reason,
                  event.days_overdue ? `venció hace ${event.days_overdue} d` : null,
                  event.amount_due ? `debe ${formatCOP(event.amount_due)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : [
                  event.plan_name,
                  event.membership_status === "in_grace" ? "en gracia, recordar el pago" : null,
                  event.upcoming_class ? `${event.upcoming_class.class_name} ${event.upcoming_class.start_time}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Membresía al día"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="flex size-8 shrink-0 items-center justify-center self-start rounded-md text-ink-muted hover:bg-muted hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      {denied && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo para autorizar"
            aria-label="Motivo para autorizar la entrada"
          />
          <Button
            type="button"
            disabled={authorizing || !reason.trim()}
            onClick={() => onAuthorize(event.member_id, reason.trim())}
            className="shrink-0"
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
    if (t) {
      clearTimeout(t);
      timers.current.delete(key);
    }
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
    <div className="pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex flex-col-reverse gap-3 md:bottom-6 md:right-6 [&>*]:pointer-events-auto">
      <AnimatePresence>
        {events.map((e) => (
          <ToastCard key={e.key} event={e} onClose={() => removeEvent(e.key)} onAuthorize={authorize} authorizing={authorizing} />
        ))}
      </AnimatePresence>
    </div>
  );
}
