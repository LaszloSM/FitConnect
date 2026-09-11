"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { Lock, CreditCard, MessageCircle, CheckCircle2 } from "lucide-react";

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";

export default function IntegrationsSection() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<any>(null);
  const [wompi, setWompi] = useState({ public_key: "", private_key: "", events_secret: "", integrity_secret: "" });
  const [whatsapp, setWhatsapp] = useState({ phone_number_id: "", access_token: "" });
  const [savingWompi, setSavingWompi] = useState(false);
  const [savingWa, setSavingWa] = useState(false);

  const isOwner = (session as any)?.role === "owner" || (session?.user as any)?.role === "owner";

  useEffect(() => {
    if (!session?.accessToken || !isOwner) return;
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/settings/integrations").then((res) => {
      setStatus(res.data);
      setWompi((w) => ({ ...w, public_key: res.data.wompi_public_key ?? "" }));
      setWhatsapp((w) => ({ ...w, phone_number_id: res.data.whatsapp_phone_number_id ?? "" }));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  if (!isOwner) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg">
          <Lock className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Solo el propietario puede configurar integraciones.
          </p>
        </div>
      </GlassCard>
    );
  }

  const saveWompi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSavingWompi(true);
    try {
      const client = apiClient(session.accessToken as string);
      const payload: any = {};
      if (wompi.public_key) payload.wompi_public_key = wompi.public_key;
      if (wompi.private_key) payload.wompi_private_key = wompi.private_key;
      if (wompi.events_secret) payload.wompi_events_secret = wompi.events_secret;
      if (wompi.integrity_secret) payload.wompi_integrity_secret = wompi.integrity_secret;
      const res = await client.patch("/api/v1/settings/integrations", payload);
      setStatus(res.data);
      setWompi((w) => ({ ...w, private_key: "", events_secret: "", integrity_secret: "" }));
      toast.success("Llaves de Wompi guardadas");
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error guardando Wompi");
    } finally {
      setSavingWompi(false);
    }
  };

  const saveWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSavingWa(true);
    try {
      const client = apiClient(session.accessToken as string);
      const payload: any = {};
      if (whatsapp.phone_number_id) payload.whatsapp_phone_number_id = whatsapp.phone_number_id;
      if (whatsapp.access_token) payload.whatsapp_access_token = whatsapp.access_token;
      const res = await client.patch("/api/v1/settings/integrations", payload);
      setStatus(res.data);
      setWhatsapp((w) => ({ ...w, access_token: "" }));
      toast.success("Credenciales de WhatsApp guardadas");
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error guardando WhatsApp");
    } finally {
      setSavingWa(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Wompi */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[var(--color-primary-ink)]" />
          <h3 className="text-sm font-semibold text-[var(--text-base)]">Wompi (cobros en línea)</h3>
          {status?.wompi_configured && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Configurado
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Pega las llaves de tu cuenta Wompi (sandbox o producción). Los secretos se guardan cifrados y nunca se muestran de vuelta.
        </p>
        <form onSubmit={saveWompi} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[var(--text-muted)] text-xs">Llave pública</Label>
            <Input value={wompi.public_key} onChange={(e) => setWompi({ ...wompi, public_key: e.target.value })} placeholder="pub_test_..." className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Llave privada</Label>
              <Input type="password" value={wompi.private_key} onChange={(e) => setWompi({ ...wompi, private_key: e.target.value })} placeholder={status?.wompi_configured ? "•••• (guardada)" : "prv_test_..."} className={inputCls} />
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Secreto de eventos</Label>
              <Input type="password" value={wompi.events_secret} onChange={(e) => setWompi({ ...wompi, events_secret: e.target.value })} placeholder={status?.wompi_configured ? "•••• (guardado)" : "events_..."} className={inputCls} />
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Secreto de integridad</Label>
              <Input type="password" value={wompi.integrity_secret} onChange={(e) => setWompi({ ...wompi, integrity_secret: e.target.value })} placeholder={status?.wompi_configured ? "•••• (guardado)" : "integrity_..."} className={inputCls} />
            </div>
          </div>
          <div className="rounded-lg bg-[var(--bg-base)] border border-[var(--border-base)] p-3 text-xs text-[var(--text-muted)]">
            URL del webhook (configúrala en tu panel Wompi): <code className="text-[var(--text-base)]">{typeof window !== "undefined" ? window.location.origin.replace(":3000", ":8000") : ""}/api/v1/webhooks/wompi</code>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={savingWompi}>
              {savingWompi ? "Guardando..." : "Guardar Wompi"}
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* WhatsApp */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-[var(--text-base)]">WhatsApp (recordatorios)</h3>
          {status?.whatsapp_configured && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Configurado
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Conecta tu cuenta de WhatsApp Business (Meta Cloud API) para enviar recordatorios de vencimiento y confirmaciones de pago.
        </p>
        <form onSubmit={saveWhatsapp} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Phone Number ID</Label>
              <Input value={whatsapp.phone_number_id} onChange={(e) => setWhatsapp({ ...whatsapp, phone_number_id: e.target.value })} placeholder="1234567890" className={inputCls} />
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Access Token</Label>
              <Input type="password" value={whatsapp.access_token} onChange={(e) => setWhatsapp({ ...whatsapp, access_token: e.target.value })} placeholder={status?.whatsapp_configured ? "•••• (guardado)" : "EAAG..."} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={savingWa}>
              {savingWa ? "Guardando..." : "Guardar WhatsApp"}
            </Button>
          </div>
        </form>
        <div className="rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)] p-3 space-y-1.5">
          <p className="text-xs font-semibold text-[var(--text-base)]">Plantillas que debes aprobar en WhatsApp Business (idioma es_CO):</p>
          <ul className="text-[11px] text-[var(--text-muted)] space-y-1 font-mono">
            <li>recordatorio_vencimiento — {"{{1}}"} nombre, {"{{2}}"} plan, {"{{3}}"} fecha, {"{{4}}"} link de pago</li>
            <li>recordatorio_vencido — {"{{1}}"} nombre, {"{{2}}"} plan, {"{{3}}"} fecha, {"{{4}}"} link de pago</li>
            <li>confirmacion_pago — {"{{1}}"} nombre, {"{{2}}"} monto, {"{{3}}"} concepto</li>
            <li>link_de_pago — {"{{1}}"} nombre, {"{{2}}"} monto, {"{{3}}"} link</li>
          </ul>
          <p className="text-[11px] text-[var(--text-muted)]">
            Los recordatorios se envían solos cada día: 3 días antes de vencer, el día del vencimiento
            y 3 días después. Si Wompi está configurado, incluyen el link de pago.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
