"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

export interface ReceptionEvent {
  type: string;
  decision: "allowed" | "denied" | "override";
  denial_reason: string | null;
  member_id: string;
  member_name: string;
  photo_url: string | null;
  membership_status: string;
  plan_name: string | null;
  amount_due: string | null;
  days_overdue: number | null;
  upcoming_class: { class_name: string; start_time: string } | null;
  source: string;
  at: string;
}

/** Suscripción SSE a los check-ins del gym en vivo (kiosko incluido),
 * con reconexión exponencial — las tablets/PCs de recepción pierden wifi.
 * `enabled=false` no abre la conexión (evita duplicar SSE cuando otra vista
 * ya está suscrita, ej. el toaster global vs la página de Check-ins). */
export function useReceptionEvents(onEvent: (event: ReceptionEvent) => void, enabled = true) {
  const { data: session } = useSession();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const token = session?.accessToken as string | undefined;
    if (!token || !enabled) return;

    let source: EventSource | null = null;
    let closed = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const base = process.env.NEXT_PUBLIC_API_URL ?? "";

    const connect = async () => {
      if (closed) return;
      // Token efímero (scope=realtime): se pide con el bearer normal y se usa una
      // sola vez para abrir el SSE, en vez de exponer el JWT de sesión en la URL.
      let ephemeral: string;
      try {
        const res = await fetch(`${base}/api/v1/realtime/token`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("token");
        ephemeral = (await res.json()).token;
      } catch {
        if (!closed) timer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 15000));
        return;
      }
      if (closed) return;
      source = new EventSource(`${base}/api/v1/realtime/reception?token=${encodeURIComponent(ephemeral)}`);
      source.onopen = () => { retries = 0; };
      source.onmessage = (e) => {
        try {
          handlerRef.current(JSON.parse(e.data));
        } catch {
          // keepalives y eventos no-JSON se ignoran
        }
      };
      source.onerror = () => {
        source?.close();
        if (!closed) {
          timer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 15000));
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
  }, [session?.accessToken, enabled]);
}
