"use client";

import { clearSnapshot } from "./store";

/**
 * Antes de cerrar sesión: la copia de socios no se queda en el PC de recepción
 * y el service worker olvida la sesión guardada. La cola pendiente se conserva:
 * es trabajo que todavía no llegó al servidor y se sube con el próximo ingreso.
 */
export async function forgetOfflineData(): Promise<void> {
  try {
    await clearSnapshot();
    localStorage.removeItem("fc-offline-snapshot-at");
  } catch {
    /* sin IndexedDB o localStorage no hay nada guardado */
  }
  navigator.serviceWorker?.controller?.postMessage("logout");
}

export async function signOutClean(callbackUrl = "/login"): Promise<void> {
  await forgetOfflineData();
  const { signOut } = await import("next-auth/react");
  await signOut({ callbackUrl });
}
