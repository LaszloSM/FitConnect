"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api";
import { formatTimeAgo } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { Copy, Loader2, MonitorSmartphone, Plus, ShieldOff } from "lucide-react";

interface KioskDevice {
  id: string;
  name: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export default function KioskSection() {
  const { data: session } = useSession();
  const devices = useApiResource<KioskDevice[]>("/api/v1/kiosk/devices", []);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ name: string; url: string } | null>(null);

  const createDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken || !name.trim()) return;
    setCreating(true);
    try {
      const client = apiClient(session.accessToken as string);
      const { data } = await client.post("/api/v1/kiosk/devices", { name: name.trim() });
      const url = `${window.location.origin}/kiosk?device=${data.token}`;
      setNewToken({ name: data.name, url });
      setName("");
      await devices.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error creando el dispositivo");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (device: KioskDevice) => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.delete(`/api/v1/kiosk/devices/${device.id}`);
      toast.success(`${device.name} revocado — el kiosko dejará de funcionar`);
      await devices.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error revocando");
    }
  };

  const copyUrl = () => {
    if (!newToken) return;
    void navigator.clipboard.writeText(newToken.url);
    toast.success("Enlace copiado — ábrelo en la tablet de la entrada");
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-base)] flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-[var(--color-primary)]" />
            Kiosko de entrada
          </h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Monta una tablet o celular viejo en la entrada: el miembro digita su cédula o escanea
            su carnet, y si está al día pasa solo. Los denegados saltan en vivo en la pantalla de Check-ins.
          </p>
        </div>

        <form onSubmit={createDevice} className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-[var(--text-muted)] text-sm">Nombre del dispositivo</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tablet entrada principal"
              className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]"
            />
          </div>
          <Button
            type="submit"
            disabled={creating || !name.trim()}
            className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Crear
          </Button>
        </form>

        {newToken && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Enlace de {newToken.name} — se muestra UNA sola vez
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate text-xs bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2 text-[var(--text-base)]">
                {newToken.url}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyUrl}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copiar
              </Button>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Ábrelo en el navegador de la tablet (modo pantalla completa). El dispositivo queda
              vinculado para siempre hasta que lo revoques.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {devices.loading ? (
            <div className="skeleton h-14 rounded-xl" />
          ) : devices.data.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Aún no hay dispositivos registrados.</p>
          ) : (
            devices.data.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-4 py-3"
              >
                <MonitorSmartphone className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-base)] truncate">{d.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {d.last_seen_at ? `Visto ${formatTimeAgo(d.last_seen_at)}` : "Nunca conectado"}
                  </p>
                </div>
                <StatusBadge
                  status={d.is_active ? "active" : "cancelled"}
                  label={d.is_active ? "Activo" : "Revocado"}
                />
                {d.is_active && (
                  <button
                    onClick={() => revoke(d)}
                    title="Revocar acceso"
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <ShieldOff className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}
