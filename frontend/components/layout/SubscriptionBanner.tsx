"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface Subscription {
  status: "trialing" | "active" | "past_due" | "read_only" | "suspended" | "comp";
  can_write: boolean;
  days_left: number | null;
  trial_ends_at: string | null;
  comp_until: string | null;
  plan_label: string;
}

/** Enlace de soporte (WhatsApp o correo). Sin configurar, no se muestra. */
const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_URL;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Estado de la cuenta de LSMFit del gimnasio: días de prueba, pago vencido
 * con gracia o solo lectura. Solo aparece cuando hay algo que decir.
 */
export function SubscriptionBanner() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [sub, setSub] = useState<Subscription | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient(token)
      .get<Subscription>("/api/v1/settings/subscription")
      .then((r) => setSub(r.data))
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    load();
    window.addEventListener("fc:read-only", load);
    return () => window.removeEventListener("fc:read-only", load);
  }, [load]);

  if (!sub) return null;
  const days = sub.days_left ?? 0;
  let tone: "info" | "warn" | "danger" = "info";
  let text: string | null = null;

  if (sub.status === "trialing" && days <= 7) {
    text =
      days === 0
        ? "Tu prueba gratis de LSMFit termina hoy."
        : `Te ${days === 1 ? "queda" : "quedan"} ${plural(days, "día", "días")} de prueba gratis${sub.trial_ends_at ? ` (hasta el ${formatDate(sub.trial_ends_at)})` : ""}.`;
    tone = days <= 3 ? "warn" : "info";
  } else if (sub.status === "past_due") {
    tone = "warn";
    text = `Tu plan de LSMFit está pendiente de pago. En ${plural(days, "día", "días")} la cuenta pasa a solo lectura.`;
  } else if (sub.status === "read_only") {
    tone = "danger";
    text = "Tu cuenta está en solo lectura: puedes consultar, pero no registrar cobros ni cambios. Los socios siguen entrando.";
  }
  if (!text) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm"
      style={{
        color: `var(--signal-${tone})`,
        background: `var(--signal-${tone}-bg)`,
        borderColor: `var(--signal-${tone}-line)`,
      }}
    >
      <span>{text}</span>
      {SUPPORT && (
        <a href={SUPPORT} target="_blank" rel="noreferrer" className="font-semibold underline-offset-4 hover:underline">
          Hablar con LSMFit
        </a>
      )}
    </div>
  );
}
