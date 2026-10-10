"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ShieldCheckIcon as Shield, XIcon as Close } from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

const SNOOZE_DAYS = 30;

/**
 * Sugerencia (nunca obligación) de activar la verificación en dos pasos para
 * quien maneja la plata y los datos del gimnasio. "Ahora no" la esconde 30 días
 * en este equipo.
 */
export function SecurityNudge() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const role = session?.role;
  const [show, setShow] = useState(false);
  const key = `lsmfit:security-nudge:${session?.dbName ?? ""}:${role ?? ""}`;

  useEffect(() => {
    if (!token || (role !== "owner" && role !== "admin")) return;
    try {
      const snoozed = Number(localStorage.getItem(key) || 0);
      if (snoozed && Date.now() - snoozed < SNOOZE_DAYS * 86_400_000) return;
    } catch {
      // Sin almacenamiento local se muestra siempre: es solo una sugerencia.
    }
    apiClient(token)
      .get("/api/v1/auth/mfa/status")
      .then((r) => setShow(!r.data.enabled))
      .catch(() => setShow(false));
  }, [token, role, key]);

  if (!show) return null;

  const snooze = () => {
    try {
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // ignorado
    }
    setShow(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-panel px-4 py-3">
      <Shield className="size-5 shrink-0 text-primary" weight="duotone" aria-hidden />
      <p className="min-w-[220px] flex-1 text-sm text-ink">
        <strong className="font-semibold">Protege tu cuenta.</strong>{" "}
        <span className="text-ink-muted">
          Activa la verificación en dos pasos: si alguien consigue tu contraseña, igual no podrá entrar. Toma un minuto.
        </span>
      </p>
      <div className="flex items-center gap-1.5">
        <Link href="/settings?tab=security" className={buttonVariants({ size: "sm" })}>
          Activar
        </Link>
        <button type="button" onClick={snooze} aria-label="Ahora no"
          className="flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[13px] text-ink-muted hover:bg-muted hover:text-ink">
          <Close className="size-3.5" aria-hidden /> Ahora no
        </button>
      </div>
    </div>
  );
}
