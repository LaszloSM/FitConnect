"use client";

import { useSyncExternalStore } from "react";

/**
 * "Instalar LSMFit en este computador" (app de escritorio sin descargar nada).
 *
 * Chrome y Edge avisan con `beforeinstallprompt` una sola vez, al cargar la
 * página: el evento se guarda aquí, apenas se importa este módulo, para poder
 * mostrar el botón cuando la persona quiera. Safari y Firefox no lo emiten:
 * ahí se explica cómo instalarla a mano.
 */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return installedNow || window.matchMedia?.("(display-mode: standalone)").matches || false;
}

function snapshot() {
  return `${Boolean(deferred)}:${isInstalled()}`;
}

export function useInstall() {
  const key = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot,
    () => "false:false",
  );
  const [canPrompt, installed] = key.split(":").map((v) => v === "true");
  return {
    canPrompt,
    installed,
    async install(): Promise<boolean> {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      emit();
      return outcome === "accepted";
    },
  };
}
