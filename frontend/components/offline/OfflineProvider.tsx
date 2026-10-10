"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { useCan, P } from "@/lib/permissions";
import { clearSnapshot } from "@/lib/offline/store";
// Se importa aquí para escuchar el aviso de instalación desde que carga la página.
import "@/lib/offline/install";
import { checkConnection, flush, getState, onState, refreshCounts, refreshSnapshot, type OfflineState } from "@/lib/offline/sync";

const SNAPSHOT_EVERY_MS = 5 * 60_000;
const CHECK_EVERY_MS = 20_000;

export function useOffline(): OfflineState {
  return useSyncExternalStore(onState, getState, getState);
}

/**
 * Mantiene lista la recepción sin conexión: registra el service worker,
 * refresca la copia de socios cada 5 minutos y sube lo pendiente cuando vuelve
 * la red. Solo para quien registra entradas.
 */
export function OfflineProvider() {
  const { data: session, status, update } = useSession();
  const token = session?.accessToken;
  const { can, ready } = useCan();
  const enabled = ready && can(P.CHECKINS_WRITE);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    void refreshCounts();
  }, []);

  useEffect(() => {
    // Cerró sesión con red: la copia de socios no se queda en el equipo (la cola
    // pendiente sí: es trabajo que todavía no llega al servidor).
    if (status === "unauthenticated" && navigator.onLine) {
      void clearSnapshot();
      navigator.serviceWorker?.controller?.postMessage("logout");
    }
  }, [status]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const tick = async (withSnapshot: boolean) => {
      const online = await checkConnection();
      if (!online || stopped) return;
      if (!token) {
        // Volvió la red con la sesión guardada sin token: se pide la sesión real
        // y este efecto vuelve a correr con el token.
        await update();
        return;
      }
      await flush(token);
      if (withSnapshot) await refreshSnapshot(token).catch(() => undefined);
    };
    void tick(true);
    const conn = setInterval(() => void tick(false), CHECK_EVERY_MS);
    const snap = setInterval(() => void tick(true), SNAPSHOT_EVERY_MS);
    const back = () => void tick(true);
    const gone = () => void checkConnection();
    window.addEventListener("online", back);
    window.addEventListener("offline", gone);
    return () => {
      stopped = true;
      clearInterval(conn);
      clearInterval(snap);
      window.removeEventListener("online", back);
      window.removeEventListener("offline", gone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token]);

  return null;
}
