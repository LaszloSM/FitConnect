"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { CheckCircleIcon as Linked, CopyIcon as Copy, DeviceMobileIcon as Phone, EnvelopeSimpleIcon as Mail } from "@phosphor-icons/react";

interface AppStatus {
  module_enabled: boolean;
  linked: boolean;
  linked_at: string | null;
}

/**
 * La app del socio: si ya la vinculó y, si no, el código que recepción le
 * entrega (vence en 48 h y solo sirve junto con su documento). Si el plan del
 * gimnasio no incluye la app, no se muestra nada.
 */
export function MemberAppAccess({ memberId, hasDocument, hasEmail }: { memberId: string; hasDocument: boolean; hasEmail: boolean }) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [code, setCode] = useState<{ code: string; expires_at: string; sent?: boolean } | null>(null);
  const [busy, setBusy] = useState<"code" | "email" | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient(token)
      .get<AppStatus>(`/api/v1/members/${memberId}/app-status`)
      .then((r) => setStatus(r.data))
      .catch(() => setStatus(null));
  }, [token, memberId]);

  useEffect(load, [load]);

  const generate = async (sendEmail: boolean) => {
    setBusy(sendEmail ? "email" : "code");
    try {
      const { data } = await apiClient(token).post(`/api/v1/members/${memberId}/app-code`, { send_email: sendEmail });
      setCode(data);
      if (data.sent) toast.success("Le enviamos la invitación con el código a su correo");
    } catch (err) {
      toast.error(parseApiError(err, sendEmail ? "No se pudo enviar la invitación" : "No se pudo generar el código"));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(
      `Descarga la app LSMFit, entra con tu correo y en "Vincular mi gimnasio" escribe el código ${code.code} y tu número de documento. Vence el ${formatDateTime(code.expires_at)}.`,
    );
    toast.success("Instrucciones copiadas");
  };

  if (!status?.module_enabled) return null;

  return (
    <div className="rounded-[var(--radius-md)] bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {status.linked ? <Linked className="size-5 text-[var(--signal-ok)]" weight="fill" /> : <Phone className="size-5 text-ink-muted" />}
          <div>
            <p className="text-sm font-semibold text-ink">App del socio</p>
            <p className="text-xs text-ink-muted">
              {status.linked && status.linked_at
                ? `Vinculada desde el ${formatDate(status.linked_at, "d MMMM yyyy")}`
                : "Aún no la usa. Con la app ve su plan, reserva clases y sigue sus rutinas."}
            </p>
          </div>
        </div>
        {!code && (
          <div className="flex flex-wrap gap-2">
            {!status.linked && (
              <Button type="button" size="sm" variant="outline" disabled={!hasDocument || !hasEmail || busy !== null}
                isLoading={busy === "email"} onClick={() => generate(true)}>
                <Mail /> Invitar por correo
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" disabled={!hasDocument || busy !== null} isLoading={busy === "code"} onClick={() => generate(false)}>
              {status.linked ? "Nuevo código (cambió de celular)" : "Ver código"}
            </Button>
          </div>
        )}
      </div>
      {!hasDocument && <p className="mt-2 text-xs text-ink-muted">Registra su documento para poder vincular la app.</p>}
      {code && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <p className="num text-3xl font-bold tracking-[0.12em] text-ink" aria-label={`Código ${code.code.split("").join(" ")}`}>
            {code.code}
          </p>
          <div className="text-xs text-ink-muted">
            {code.sent && <p className="font-medium text-ink">Enviado a su correo con los pasos.</p>}
            <p>Junto con su documento. Vence el {formatDateTime(code.expires_at)}.</p>
            {status.linked && <p>Al usarlo, el celular anterior deja de tener acceso.</p>}
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={copy}>
            <Copy /> Copiar instrucciones
          </Button>
        </div>
      )}
    </div>
  );
}
