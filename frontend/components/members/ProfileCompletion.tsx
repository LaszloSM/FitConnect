"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { CopyIcon as Copy, EnvelopeSimpleIcon as Mail, WhatsappLogoIcon as WhatsApp } from "@phosphor-icons/react";

interface Status {
  complete: boolean;
  percent: number;
  missing: string[];
  labels: Record<string, string>;
  last_link: { channel: string; created_at: string; opened_at: string | null; used_at: string | null; expires_at: string } | null;
}

const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", email: "correo", copy: "enlace copiado" };

/**
 * Qué le falta a la ficha (típico de los socios importados) y el enlace para
 * que el socio la complete él mismo. Desaparece cuando la ficha está completa.
 */
export function ProfileCompletion({ memberId, hasPhone, hasEmail, onChange }: {
  memberId: string;
  hasPhone: boolean;
  hasEmail: boolean;
  onChange?: () => void;
}) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient(token)
      .get<Status>(`/api/v1/members/${memberId}/profile-status`)
      .then((r) => setStatus(r.data))
      .catch(() => setStatus(null));
  }, [token, memberId]);

  useEffect(load, [load]);

  const send = async (channel: "whatsapp" | "email" | "copy") => {
    setBusy(channel);
    try {
      const { data } = await apiClient(token).post(`/api/v1/members/${memberId}/profile-link`, { channel });
      if (channel === "copy") {
        await navigator.clipboard.writeText(data.message);
        toast.success("Mensaje con el enlace copiado: pégalo donde quieras");
      } else {
        toast.success(channel === "whatsapp" ? "Enlace enviado por WhatsApp" : "Enlace enviado por correo");
      }
      load();
      onChange?.();
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo enviar el enlace"));
    } finally {
      setBusy(null);
    }
  };

  if (!status || status.complete) return null;
  const last = status.last_link;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--signal-warn-line)] bg-[var(--signal-warn-bg)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          Ficha incompleta <span className="num font-normal text-ink-muted">· {status.percent} %</span>
        </p>
        {last && (
          <p className="text-xs text-ink-muted">
            {last.used_at
              ? `Completó por el enlace el ${formatDateTime(last.used_at)}`
              : `Enlace por ${CHANNEL[last.channel] ?? last.channel} el ${formatDateTime(last.created_at)}${last.opened_at ? " · lo abrió" : " · sin abrir"}`}
          </p>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-muted">Falta: {status.missing.map((k) => status.labels[k] ?? k).join(", ")}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!hasPhone || busy !== null} isLoading={busy === "whatsapp"} onClick={() => send("whatsapp")}>
          <WhatsApp /> Enviar por WhatsApp
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!hasEmail || busy !== null} isLoading={busy === "email"} onClick={() => send("email")}>
          <Mail /> Por correo
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} isLoading={busy === "copy"} onClick={() => send("copy")}>
          <Copy /> Copiar enlace
        </Button>
      </div>
    </div>
  );
}
