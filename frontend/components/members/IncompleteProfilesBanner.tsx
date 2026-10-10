"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { IdentificationCardIcon as IdCard } from "@phosphor-icons/react";

interface Summary {
  incomplete: number;
  with_phone: number;
  with_email: number;
}

/**
 * Fichas incompletas (típico tras importar del software anterior): filtro y
 * envío del enlace de autoservicio por correo a todos los que tienen correo.
 */
export function IncompleteProfilesBanner({ active, onToggle, canSend }: {
  active: boolean;
  onToggle: () => void;
  canSend: boolean;
}) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiClient(token)
      .get<Summary>("/api/v1/members/profile-summary")
      .then((r) => setSummary(r.data))
      .catch(() => setSummary(null));
  }, [token]);

  useEffect(load, [load]);

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient(token).post("/api/v1/members/profile-links/bulk", { channel: "email", limit: 300 });
      toast.success(
        data.sent === 0
          ? "No había a quién enviar: a los demás ya se les mandó en los últimos 3 días"
          : `Enviando el enlace por correo a ${data.sent} socio${data.sent === 1 ? "" : "s"}`,
      );
      setConfirm(false);
      load();
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo enviar"));
    } finally {
      setBusy(false);
    }
  };

  if (!summary || summary.incomplete === 0) return null;
  const n = summary.incomplete;
  const withoutEmail = n - summary.with_email;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-panel px-4 py-3">
      <IdCard className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
      <p className="min-w-[200px] flex-1 text-sm text-ink">
        <strong className="num">{n}</strong> ficha{n !== 1 ? "s" : ""} incompleta{n !== 1 ? "s" : ""}: falta contacto de
        emergencia, cuestionario de salud o autorización de datos. Cada socio puede completarla desde un enlace
        que le llega al correo.
        {withoutEmail > 0 && (
          <span className="text-ink-muted"> {withoutEmail} no tiene{withoutEmail === 1 ? "" : "n"} correo: desde su ficha puedes copiar el enlace.</span>
        )}
      </p>
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">
            ¿Enviar el enlace por correo a <span className="num font-semibold text-ink">{summary.with_email}</span>?
          </span>
          <Button size="sm" isLoading={busy} onClick={send}>
            Enviar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canSend && summary.with_email > 0 && (
            <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>
              Enviar enlace por correo
            </Button>
          )}
          <button
            onClick={onToggle}
            className={cn(
              "h-8 rounded-[var(--radius-sm)] border px-3 text-[13px] font-medium transition-colors",
              active ? "border-ink bg-ink text-surface" : "border-line bg-panel text-ink hover:bg-muted",
            )}
          >
            {active ? "Ver todos" : "Ver incompletas"}
          </button>
        </div>
      )}
    </div>
  );
}
