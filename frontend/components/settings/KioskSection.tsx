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
import { parseApiError } from "@/lib/errors";
import { formatTimeAgo } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { CheckIcon as Check, CopyIcon as Copy, DoorOpenIcon as DoorOpen, FingerprintIcon as Fingerprint, LinkIcon as Link2, SpinnerGapIcon as Loader2, MonitorPlayIcon as MonitorPlay, DevicesIcon as MonitorSmartphone, PencilSimpleIcon as Pencil, PlusIcon as Plus, ShieldSlashIcon as ShieldOff, XIcon as X, WifiSlashIcon as WifiOff, ScrollIcon as ScrollText } from "@phosphor-icons/react";

type DeviceKind = "kiosk" | "turnstile" | "reader" | "screen";

interface KioskDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  vendor: string | null;
  model: string | null;
  serial: string | null;
  location: string | null;
  offline_policy: "deny" | "allow_recent";
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

interface AccessEvent {
  id: string; device_name: string | null; member_name: string | null; credential_kind: string; credential_ref: string | null;
  direction: string; decision: string; reason: string | null; offline: boolean; occurred_at: string;
}

const KINDS: { key: DeviceKind; label: string; hint: string; icon: React.ReactNode; path: string }[] = [
  { key: "kiosk", label: "Kiosko", hint: "Tablet en la entrada: el socio digita su cédula o escanea el carné", icon: <MonitorSmartphone className="h-4 w-4" />, path: "/kiosk" },
  { key: "turnstile", label: "Torniquete", hint: "Equipo con lector (huella, tarjeta) que pregunta a FitConnect antes de abrir", icon: <DoorOpen className="h-4 w-4" />, path: "" },
  { key: "reader", label: "Lector", hint: "Lector de huella o tarjeta sin torniquete (solo registra la entrada)", icon: <Fingerprint className="h-4 w-4" />, path: "" },
  { key: "screen", label: "Pantalla", hint: "TV o tablet del salón para mostrar las rutinas", icon: <MonitorPlay className="h-4 w-4" />, path: "/screen" },
];
const KIND_BY_KEY = Object.fromEntries(KINDS.map((k) => [k.key, k])) as Record<DeviceKind, (typeof KINDS)[number]>;
const DECISION_LABEL: Record<string, { label: string; tone: string }> = {
  allowed: { label: "Permitido", tone: "text-[var(--signal-ok)]" },
  duplicate: { label: "Reingreso", tone: "text-[var(--signal-ok)]" },
  denied: { label: "Denegado", tone: "text-[var(--signal-danger)]" },
  not_found: { label: "No reconocido", tone: "text-[var(--signal-warn)]" },
};
const CRED_LABEL: Record<string, string> = { id_number: "Cédula", qr: "Carné QR", fingerprint: "Huella", face: "Rostro", card: "Tarjeta", pin: "PIN" };

export default function KioskSection() {
  const { data: session } = useSession();
  const devices = useApiResource<KioskDevice[]>("/api/v1/kiosk/devices", []);
  const events = useApiResource<AccessEvent[]>("/api/v1/access/events/recent?limit=30", []);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DeviceKind>("kiosk");
  const [vendor, setVendor] = useState("");
  const [model, setModel] = useState("");
  const [location, setLocation] = useState("");
  const [offlinePolicy, setOfflinePolicy] = useState<"deny" | "allow_recent">("deny");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ name: string; kind: DeviceKind; url: string; token: string; regenerated?: boolean } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const client = () => apiClient(session?.accessToken as string);
  const linkFor = (k: DeviceKind, token: string) => {
    const path = KIND_BY_KEY[k].path;
    return path ? `${window.location.origin}${path}?device=${token}` : "";
  };

  const createDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken || !name.trim()) return;
    setCreating(true);
    try {
      const { data } = await client().post("/api/v1/kiosk/devices", {
        name: name.trim(), kind, vendor: vendor.trim() || null, model: model.trim() || null, location: location.trim() || null,
        offline_policy: kind === "turnstile" || kind === "reader" ? offlinePolicy : "deny",
      });
      setNewToken({ name: data.name, kind: data.kind, url: linkFor(data.kind, data.token), token: data.token });
      setName(""); setVendor(""); setModel(""); setLocation("");
      await devices.refetch();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error creando el dispositivo"));
    } finally {
      setCreating(false);
    }
  };

  const regenerateLink = async (device: KioskDevice) => {
    if (!session?.accessToken) return;
    setBusyId(device.id);
    try {
      const { data } = await client().post(`/api/v1/kiosk/devices/${device.id}/regenerate-link`);
      setNewToken({ name: data.name, kind: device.kind, url: linkFor(device.kind, data.token), token: data.token, regenerated: true });
      toast.success("Token regenerado. El anterior dejó de funcionar");
    } catch (err: any) {
      toast.error(parseApiError(err, "Error regenerando el enlace"));
    } finally {
      setBusyId(null);
    }
  };

  const saveRename = async (device: KioskDevice) => {
    if (!session?.accessToken || !renameValue.trim() || renameValue.trim() === device.name) { setRenamingId(null); return; }
    setBusyId(device.id);
    try {
      await client().patch(`/api/v1/kiosk/devices/${device.id}`, { name: renameValue.trim() });
      setRenamingId(null);
      await devices.refetch();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error renombrando"));
    } finally {
      setBusyId(null);
    }
  };

  const togglePolicy = async (device: KioskDevice) => {
    const next = device.offline_policy === "deny" ? "allow_recent" : "deny";
    try {
      await client().patch(`/api/v1/kiosk/devices/${device.id}`, { offline_policy: next });
      await devices.refetch();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error actualizando"));
    }
  };

  const [armedDevice, setArmedDevice] = useState<string | null>(null);
  const revoke = async (device: KioskDevice) => {
    setArmedDevice(null);
    if (!session?.accessToken) return;
    try {
      await client().delete(`/api/v1/kiosk/devices/${device.id}`);
      toast.success(`${device.name} revocado`);
      await devices.refetch();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error revocando"));
    }
  };

  const copy = (text: string, msg: string) => { void navigator.clipboard.writeText(text); toast.success(msg); };
  const needsPolicy = kind === "turnstile" || kind === "reader";

  return (
    <div className="space-y-4">
      <GlassCard className="p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-base)] flex items-center gap-2">
            <DoorOpen className="h-4 w-4 text-[var(--color-primary-ink)]" />
            Dispositivos de entrada y pantalla
          </h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Cada equipo tiene su propio token, revocable. Kiosko y pantalla abren un enlace; torniquetes y lectores usan el
            token desde su agente (o el simulador) para preguntar a FitConnect si el socio puede pasar.
          </p>
        </div>

        <form onSubmit={createDevice} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {KINDS.map((k) => (
              <button key={k.key} type="button" onClick={() => setKind(k.key)} title={k.hint}
                className={`rounded-xl border p-3 text-left transition-colors ${kind === k.key ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)]" : "border-[var(--border-base)] hover:bg-[var(--bg-muted)]"}`}>
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-base)]">{k.icon} {k.label}</div>
                <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{k.hint}</p>
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[180px] space-y-1.5">
              <Label className="text-[var(--text-muted)] text-sm">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "turnstile" ? "Torniquete entrada principal" : kind === "screen" ? "TV salón" : "Tablet entrada"} className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]" />
            </div>
            {(kind === "turnstile" || kind === "reader") && (
              <>
                <div className="w-32 space-y-1.5"><Label className="text-[var(--text-muted)] text-sm">Marca</Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="ZKTeco" className="bg-[var(--bg-base)] border-[var(--border-base)]" /></div>
                <div className="w-32 space-y-1.5"><Label className="text-[var(--text-muted)] text-sm">Modelo</Label><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="TS1000" className="bg-[var(--bg-base)] border-[var(--border-base)]" /></div>
              </>
            )}
            <div className="w-40 space-y-1.5"><Label className="text-[var(--text-muted)] text-sm">Ubicación</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Entrada principal" className="bg-[var(--bg-base)] border-[var(--border-base)]" /></div>
            {needsPolicy && (
              <div className="w-52 space-y-1.5">
                <Label className="text-[var(--text-muted)] text-sm">Si se va el internet</Label>
                <select value={offlinePolicy} onChange={(e) => setOfflinePolicy(e.target.value as any)} className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)]">
                  <option value="deny">No deja pasar a nadie</option>
                  <option value="allow_recent">Deja pasar a quien entró en 24 h</option>
                </select>
              </div>
            )}
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />} Crear
            </Button>
          </div>
        </form>

        {newToken && (
          <div className="rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary-muted)] p-4 space-y-2">
            <p className="text-sm font-medium text-[var(--text-base)]">
              {newToken.regenerated ? "Nuevo token para" : "Token de"} <strong>{newToken.name}</strong>. Se muestra una sola vez: guárdalo ahora.
              {newToken.regenerated ? " El enlace anterior quedó revocado." : ""}
            </p>
            {newToken.url ? (
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs bg-[var(--bg-base)] rounded px-2 py-1 max-w-full truncate flex-1">{newToken.url}</code>
                <Button type="button" variant="outline" size="sm" onClick={() => copy(newToken.url, "Enlace copiado. Ábrelo en el equipo")}><Copy className="h-3.5 w-3.5 mr-1" /> Copiar enlace</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs bg-[var(--bg-base)] rounded px-2 py-1 max-w-full truncate flex-1">{newToken.token}</code>
                <Button type="button" variant="outline" size="sm" onClick={() => copy(newToken.token, "Token copiado. Pégalo en el agente o en el simulador")}><Copy className="h-3.5 w-3.5 mr-1" /> Copiar token</Button>
              </div>
            )}
            {!newToken.url && (
              <p className="text-xs text-[var(--text-muted)]">
                Para probar sin equipo: <code>python scripts/access_simulator.py --token &lt;token&gt; --id &lt;cédula&gt;</code>. Guía completa en <code>docs/ACCESO_TORNIQUETE.md</code>.
              </p>
            )}
            <button type="button" onClick={() => setNewToken(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-base)]">Cerrar</button>
          </div>
        )}

        <div className="space-y-2">
          {devices.loading ? (
            <div className="skeleton h-14 rounded-xl" />
          ) : devices.data.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Aún no hay dispositivos registrados.</p>
          ) : devices.data.map((d) => {
            const k = KIND_BY_KEY[d.kind] ?? KIND_BY_KEY.kiosk;
            return (
              <div key={d.id} className="flex items-center gap-3 rounded-[var(--radius-md)] px-4 py-3 bg-muted/60">
                <span className="text-[var(--text-muted)] shrink-0">{k.icon}</span>
                <div className="flex-1 min-w-0">
                  {renamingId === d.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveRename(d); } if (e.key === "Escape") setRenamingId(null); }} autoFocus className="h-7 text-sm bg-[var(--bg-input)] border-[var(--border-base)]" />
                      <button onClick={() => saveRename(d)} disabled={busyId === d.id} className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--signal-ok)] hover:bg-[var(--signal-ok-bg)] shrink-0" title="Guardar"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setRenamingId(null)} className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-muted)] shrink-0" title="Cancelar"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-[var(--text-base)] truncate">{d.name} <span className="text-xs font-normal text-[var(--text-muted)]">· {k.label}{d.vendor ? ` · ${d.vendor}${d.model ? ` ${d.model}` : ""}` : ""}{d.location ? ` · ${d.location}` : ""}</span></p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {d.last_seen_at ? `Visto ${formatTimeAgo(d.last_seen_at)}` : "Nunca conectado"}
                        {(d.kind === "turnstile" || d.kind === "reader") && (
                          <button type="button" onClick={() => togglePolicy(d)} className="ml-2 inline-flex items-center gap-1 underline decoration-dotted hover:text-[var(--text-base)]" title="Cambiar política sin internet">
                            <WifiOff className="h-3 w-3" /> {d.offline_policy === "allow_recent" ? "sin internet: pasa quien entró en 24 h" : "sin internet: nadie pasa"}
                          </button>
                        )}
                      </p>
                    </>
                  )}
                </div>
                <StatusBadge status={d.is_active ? "active" : "cancelled"} label={d.is_active ? "Activo" : "Revocado"} />
                {d.is_active && renamingId !== d.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => regenerateLink(d)} disabled={busyId === d.id} title="Regenerar token (el anterior deja de funcionar)" className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--color-primary-ink)] hover:bg-[var(--color-primary-muted)] transition-colors disabled:opacity-50">
                      {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    </button>
                    <button onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }} title="Renombrar" className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors"><Pencil className="h-4 w-4" /></button>
                    {armedDevice === d.id ? (
                      <span className="flex items-center gap-1" title="El equipo dejará de poder verificar accesos">
                        <Button type="button" variant="destructive" onClick={() => revoke(d)} className="h-8 text-xs">Revocar</Button>
                        <Button type="button" variant="ghost" onClick={() => setArmedDevice(null)} className="h-8 text-xs">No</Button>
                      </span>
                    ) : (
                      <button onClick={() => setArmedDevice(d.id)} title="Revocar acceso" aria-label={`Revocar ${d.name}`} className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-danger)] hover:bg-[var(--signal-danger-bg)] transition-colors"><ShieldOff className="h-4 w-4" /></button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-[var(--text-base)] flex items-center gap-2"><ScrollText className="h-4 w-4 text-[var(--color-primary-ink)]" /> Últimos intentos de acceso</h3>
          <button type="button" onClick={() => events.refetch()} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-base)]">Actualizar</button>
        </div>
        {events.loading ? <div className="skeleton h-10 rounded-xl" /> : events.data.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Todavía no hay intentos registrados por dispositivos. Cuando el torniquete, el lector o el simulador pregunten por un socio, aparecen aquí.</p>
        ) : (
          <div className="divide-y divide-[var(--border-base)]">
            {events.data.map((ev) => {
              const d = DECISION_LABEL[ev.decision] ?? { label: ev.decision, tone: "" };
              return (
                <div key={ev.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className={`w-24 shrink-0 font-medium ${d.tone}`}>{d.label}</span>
                  <span className="flex-1 min-w-0 truncate text-[var(--text-base)]">{ev.member_name ?? <span className="text-[var(--text-muted)]">{ev.credential_ref ?? "—"}</span>}{ev.direction === "exit" ? " · salida" : ""}{ev.reason && ev.decision === "denied" ? <span className="text-[var(--text-muted)]"> · {ev.reason}</span> : null}</span>
                  <span className="text-xs text-[var(--text-muted)] shrink-0">{CRED_LABEL[ev.credential_kind] ?? ev.credential_kind}{ev.offline ? " · offline" : ""}</span>
                  <span className="text-xs text-[var(--text-muted)] shrink-0 w-28 truncate">{ev.device_name ?? "—"}</span>
                  <span className="text-xs text-[var(--text-muted)] shrink-0">{formatTimeAgo(ev.occurred_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
