"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { onUnauthorized, endSession } from "@/lib/api";

/**
 * Cierra la sesión con un aviso cuando deja de ser válida, en vez de dejar la
 * pantalla llena de "Error cargando...". Dos caminos llegan aquí:
 * el token venció y no se pudo renovar (`session.error`), o el backend
 * respondió 401 a alguna petición (interceptor de lib/api).
 */
export function SessionGuard() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.error === "RefreshFailed") void endSession();
  }, [session?.error]);

  useEffect(() => onUnauthorized(() => void endSession()), []);

  useEffect(() => {
    if (session?.mfaSetupRequired) window.location.assign("/seguridad/dos-pasos");
  }, [session?.mfaSetupRequired]);

  return null;
}
