"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { DeviceMobileIcon as Phone, EnvelopeSimpleIcon as Mail, CheckCircleIcon as Check } from "@phosphor-icons/react";

/**
 * Lo que sigue después de importar: pedirle a cada socio por correo que
 * complete su ficha y, si el plan incluye la app, invitarlo a ella. Todo por
 * correo: es gratis y no depende de plantillas aprobadas de WhatsApp.
 */
export function ImportFollowUp({ token, batchId }: { token?: string; batchId: string }) {
  const [appEnabled, setAppEnabled] = useState(false);
  const [busy, setBusy] = useState<"profile" | "app" | null>(null);
  const [done, setDone] = useState<{ profile?: string; app?: string }>({});

  useEffect(() => {
    if (!token) return;
    apiClient(token)
      .get<{ modules: string[] }>("/api/v1/settings/subscription")
      .then((r) => setAppEnabled(r.data.modules?.includes("member_app") ?? false))
      .catch(() => setAppEnabled(false));
  }, [token]);

  const sendProfileLinks = async () => {
    setBusy("profile");
    try {
      const { data } = await apiClient(token).post("/api/v1/members/profile-links/bulk", { channel: "email", limit: 300 });
      const extra = data.without_email > 0 ? ` ${data.without_email} no tienen correo.` : "";
      setDone((d) => ({
        ...d,
        profile: data.sent === 0 ? `No había a quién enviar.${extra}` : `Enviando a ${data.sent} socios.${extra}`,
      }));
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo enviar"));
    } finally {
      setBusy(null);
    }
  };

  const sendAppInvites = async () => {
    setBusy("app");
    try {
      const { data } = await apiClient(token).post(`/api/v1/members/import/batches/${batchId}/app-invites`);
      const extra = data.without_email > 0 ? ` ${data.without_email} sin correo o sin documento.` : "";
      setDone((d) => ({
        ...d,
        app: data.queued === 0 ? `No había socios nuevos con correo.${extra}` : `Invitando a ${data.queued} socios.${extra}`,
      }));
    } catch (err) {
      toast.error(parseApiError(err, "No se pudieron enviar las invitaciones"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-line bg-panel p-3">
      <p className="text-sm font-semibold text-ink">Siguiente paso: avísales a tus socios</p>
      <Row
        icon={<Mail className="h-4 w-4" />}
        text="Correo para que cada socio complete su ficha (contacto de emergencia, salud y autorización de datos)."
        result={done.profile}
        action={
          <Button size="sm" variant="outline" isLoading={busy === "profile"} disabled={busy !== null} onClick={sendProfileLinks}>
            Enviar por correo
          </Button>
        }
      />
      {appEnabled && (
        <Row
          icon={<Phone className="h-4 w-4" />}
          text="Invitación a la app de socios, con su código para vincularse."
          result={done.app}
          action={
            <Button size="sm" variant="outline" isLoading={busy === "app"} disabled={busy !== null} onClick={sendAppInvites}>
              Invitar a la app
            </Button>
          }
        />
      )}
    </div>
  );
}

function Row({ icon, text, result, action }: { icon: React.ReactNode; text: string; result?: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-ink-muted" aria-hidden>{icon}</span>
      <p className="min-w-[200px] flex-1 text-[13px] text-ink-muted">{text}</p>
      {result ? (
        <span className="flex items-center gap-1 text-[13px] font-medium text-ink">
          <Check className="h-4 w-4 text-[var(--signal-ok)]" aria-hidden /> {result}
        </span>
      ) : (
        action
      )}
    </div>
  );
}
