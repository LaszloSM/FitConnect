"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { parseApiError } from "@/lib/errors";
import { formatTimeAgo } from "@/lib/format";
import { P, useCan } from "@/lib/permissions";
import { ArrowsClockwiseIcon as Sync, DoorOpenIcon as DoorOpen, SpinnerGapIcon as Loader2 } from "@phosphor-icons/react";

export type AccessProtocol = "zk_adms" | "hik_isapi" | "zk_tcp" | "generic";

export interface AccessConfig {
  protocol?: AccessProtocol;
  block_strategy?: "timezone" | "delete" | "validity";
  pin_mode?: "document" | "sequential";
  enroll_command?: "ENROLL_FP" | "ENROLL_BIO";
  open_command?: string;
  allowed_ips?: string[];
}

export const PROTOCOLS: { value: AccessProtocol; label: string; hint: string; vendor: string }[] = [
  {
    value: "zk_adms",
    label: "ZKTeco con servidor en la nube (ADMS)",
    hint: "SpeedFace, ProFace, MB, iFace… El equipo llama solo a LSMFit: no necesita PC.",
    vendor: "zkteco",
  },
  {
    value: "hik_isapi",
    label: "Hikvision (MinMoe)",
    hint: "Se conecta con el agente de LSMFit instalado en el PC de recepción.",
    vendor: "hikvision",
  },
  {
    value: "zk_tcp",
    label: "ZKTeco sin ADMS (red local)",
    hint: "Equipos antiguos con puerto 4370. Usa el agente en el PC de recepción.",
    vendor: "zkteco",
  },
  {
    value: "generic",
    label: "Otra marca",
    hint: "Un agente o integrador consulta a LSMFit si el socio puede pasar.",
    vendor: "",
  },
];

interface Status {
  protocol: AccessProtocol | null;
  last_seen_at: string | null;
  users_on_device: number;
  linked: number;
  unlinked: number;
  with_face: number;
  with_fingerprint: number;
  pending_commands: number;
  failed_commands_24h: number;
  ip_conflict?: { ip: string; at: string } | null;
  has_allowed_ips?: boolean;
  recent_commands: { id: string; kind: string; status: string; error: string | null; pin: string | null; created_at: string }[];
}

interface RosterRow {
  pin: string;
  device_name: string | null;
  member_name: string | null;
  has_face: boolean;
  fingerprints: number;
}

const COMMAND_LABEL: Record<string, string> = {
  user_sync: "Actualizar socio",
  user_remove: "Quitar del equipo",
  enroll_face: "Registrar rostro",
  enroll_fingerprint: "Registrar huella",
  face_photo: "Enviar foto como rostro",
  biometric_delete: "Borrar biometría",
  open_door: "Abrir",
  query_users: "Leer usuarios del equipo",
};

const COMMAND_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  done: "success",
  pending: "warning",
  sent: "warning",
  failed: "danger",
  cancelled: "neutral",
};
const COMMAND_STATUS: Record<string, string> = {
  done: "Hecho",
  pending: "En cola",
  sent: "Enviado",
  failed: "Falló",
  cancelled: "Reemplazado",
};

/** Lo que hay que configurar en el equipo, según cómo se conecta. */
export function SetupSteps({ protocol, serial, token }: { protocol: AccessProtocol; serial?: string | null; token?: string }) {
  const apiHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_API_URL || window.location.origin).hostname;
    } catch {
      return window.location.hostname;
    }
  })();
  if (protocol === "zk_adms") {
    return (
      <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--text-base)]">
        <li>En el equipo: <strong>Menú › Comunicación › Servidor en la nube</strong> (en algunos dice «ADMS» o «Cloud Server»).</li>
        <li>
          Dirección del servidor: <code className="num">{apiHost}</code> · Puerto: <code className="num">443</code> · HTTPS:
          activado · Proxy: desactivado.
        </li>
        <li>
          Revisa que el número de serie del equipo sea <code className="num">{serial || "el que registraste aquí"}</code>{" "}
          (Menú › Sistema › Información).
        </li>
        <li>Guarda y espera un minuto: aquí aparecerá «Conectado». Luego pulsa «Sincronizar ahora».</li>
      </ol>
    );
  }
  if (protocol === "generic") {
    return (
      <p className="text-sm text-[var(--text-base)]">
        Entrega el token al integrador: su programa debe llamar <code>POST /api/v1/access/verify</code> con la cédula o el
        ID del lector y abrir solo si la respuesta trae <code>allow: true</code>.
      </p>
    );
  }
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--text-base)]">
      <li>Instala el agente de LSMFit en el PC de recepción (misma red del torniquete).</li>
      <li>
        En su archivo de configuración pon la URL de LSMFit, este token
        {token ? " (cópialo arriba)" : ""}, la IP del equipo y su usuario y clave
        {protocol === "hik_isapi" ? " de administrador" : " (o la clave de comunicación)"}.
      </li>
      <li>Ejecuta <code>lsmfit-agent --check</code> y luego déjalo como servicio. Guía: <code>agent/README.md</code>.</li>
    </ol>
  );
}

export function AccessDevicePanel({
  deviceId,
  serial,
  config,
  onSaved,
}: {
  deviceId: string;
  serial: string | null;
  config: AccessConfig;
  onSaved: () => void;
}) {
  const { data: session } = useSession();
  const token = session?.accessToken as string | undefined;
  const { can } = useCan();
  const [status, setStatus] = useState<Status | null>(null);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [busy, setBusy] = useState<"sync" | "open" | "save" | null>(null);
  const [draft, setDraft] = useState<AccessConfig>(config);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await apiClient(token).get<Status>(`/api/v1/access/devices/${deviceId}/status`);
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, [token, deviceId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (kind: "sync" | "open") => {
    if (!token) return;
    setBusy(kind);
    try {
      if (kind === "sync") {
        const { data } = await apiClient(token).post(`/api/v1/access/devices/${deviceId}/sync`);
        toast.success(`Sincronización en cola (${data.queued} socio(s) con cambios)`);
      } else {
        await apiClient(token).post(`/api/v1/access/devices/${deviceId}/open`, { reason: "Apertura desde Ajustes" });
        toast.success("Orden de abrir enviada");
      }
      load();
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo enviar la orden"));
    } finally {
      setBusy(null);
    }
  };

  const loadRoster = async () => {
    if (!token) return;
    try {
      const { data } = await apiClient(token).get<RosterRow[]>(`/api/v1/access/devices/${deviceId}/roster?filter=unlinked`);
      setRoster(data);
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo leer la lista del equipo"));
    }
  };

  const save = async () => {
    if (!token) return;
    setBusy("save");
    try {
      await apiClient(token).patch(`/api/v1/kiosk/devices/${deviceId}`, { access: draft });
      toast.success("Ajustes del torniquete guardados");
      onSaved();
    } catch (err) {
      toast.error(parseApiError(err, "No se pudieron guardar los ajustes"));
    } finally {
      setBusy(null);
    }
  };

  const online = status?.last_seen_at && Date.now() - new Date(status.last_seen_at + "Z").getTime() < 5 * 60_000;
  const protocol = config.protocol;

  if (!protocol) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Elige cómo se conecta este equipo en «Ajustes avanzados» para que LSMFit lo controle.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status="device" label={online ? "Conectado" : "Sin conexión"} tone={online ? "success" : "warning"} />
        {status && (
          <span className="text-[13px] text-[var(--text-muted)]">
            {status.users_on_device} en el equipo · {status.linked} enlazados · {status.with_face} con rostro ·{" "}
            {status.with_fingerprint} con huella
            {status.pending_commands ? ` · ${status.pending_commands} en cola` : ""}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => act("sync")} disabled={busy !== null}>
            {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sync className="h-4 w-4 mr-1.5" />}
            Sincronizar ahora
          </Button>
          {can(P.ACCESS_OVERRIDE) && (
            <Button type="button" variant="outline" size="sm" onClick={() => act("open")} disabled={busy !== null}>
              <DoorOpen className="h-4 w-4 mr-1.5" /> Abrir
            </Button>
          )}
        </div>
      </div>

      {status?.ip_conflict && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
          style={{ color: "var(--signal-danger)", background: "var(--signal-danger-bg)", borderColor: "var(--signal-danger-line)" }}
        >
          El {formatDateTime(status.ip_conflict.at + "Z")} otro aparato intentó conectarse con el serial de este torniquete
          desde la IP <span className="num">{status.ip_conflict.ip}</span> y se rechazó. Si no fue un cambio de internet del
          gimnasio, registra la IP pública del gimnasio en «IPs permitidas».
        </p>
      )}
      {online && protocol === "zk_adms" && status && !status.has_allowed_ips && (
        <p className="text-[13px] text-[var(--text-muted)]">
          Recomendado: registra la IP pública del gimnasio en «IPs permitidas». El equipo solo se identifica con su serial,
          que está impreso en él.
        </p>
      )}
      {!online && <SetupSteps protocol={protocol} serial={serial} />}

      {status && status.unlinked > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--text-base)]">
            {status.unlinked} usuario(s) del equipo no coinciden con ningún socio por cédula.{" "}
            <button type="button" onClick={loadRoster} className="text-[var(--brand-ink)] underline-offset-2 hover:underline">
              Ver cuáles
            </button>
          </p>
          {roster && (
            <ul className="max-h-48 divide-y divide-[var(--border-base)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-base)] text-sm">
              {roster.map((r) => (
                <li key={r.pin} className="flex items-center gap-3 px-3 py-2">
                  <span className="num w-28 shrink-0">{r.pin}</span>
                  <span className="flex-1 truncate">{r.device_name || "Sin nombre en el equipo"}</span>
                  <span className="text-[12.5px] text-[var(--text-muted)]">
                    {r.has_face ? "rostro" : ""}{r.has_face && r.fingerprints ? " · " : ""}{r.fingerprints ? "huella" : ""}
                  </span>
                </li>
              ))}
              <li className="px-3 py-2 text-[12.5px] text-[var(--text-muted)]">
                Si su ID en el equipo no es la cédula, enlázalo desde la ficha del socio › Acceso › Asignar un ID manualmente.
              </li>
            </ul>
          )}
        </div>
      )}

      {status && status.recent_commands.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">Últimas órdenes</p>
          <ul className="space-y-1 text-[13px]">
            {status.recent_commands.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <StatusBadge status={c.status} label={COMMAND_STATUS[c.status] ?? c.status} tone={COMMAND_TONE[c.status] ?? "neutral"} />
                <span>{COMMAND_LABEL[c.kind] ?? c.kind}</span>
                {c.pin && <span className="num text-[var(--text-muted)]">{c.pin}</span>}
                <span className="ml-auto text-[var(--text-muted)]">{formatTimeAgo(c.created_at)}</span>
                {c.error && <span className="basis-full text-[var(--signal-danger)]">{c.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="space-y-3">
        <summary className="cursor-pointer text-sm font-semibold">Ajustes avanzados (instalador)</summary>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--text-muted)]">Conexión</span>
            <select
              className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-field px-2.5 text-sm text-ink"
              value={draft.protocol ?? ""}
              onChange={(e) => setDraft({ ...draft, protocol: (e.target.value || undefined) as AccessProtocol | undefined })}
            >
              {PROTOCOLS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--text-muted)]">Cómo bloquear a quien se vence</span>
            <select
              className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-field px-2.5 text-sm text-ink"
              value={draft.block_strategy ?? (draft.protocol === "hik_isapi" ? "validity" : "timezone")}
              onChange={(e) => setDraft({ ...draft, block_strategy: e.target.value as AccessConfig["block_strategy"] })}
            >
              <option value="timezone">Sin acceso por horario (conserva rostro y huella)</option>
              <option value="validity">Fecha de vigencia en el equipo (Hikvision)</option>
              <option value="delete">Borrarlo del equipo (hay que volver a registrarlo)</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--text-muted)]">ID de cada socio en el equipo</span>
            <select
              className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-field px-2.5 text-sm text-ink"
              value={draft.pin_mode ?? "document"}
              onChange={(e) => setDraft({ ...draft, pin_mode: e.target.value as AccessConfig["pin_mode"] })}
            >
              <option value="document">La cédula</option>
              <option value="sequential">Números cortos (1, 2, 3…) para equipos con ID de pocos dígitos</option>
            </select>
          </label>
          {draft.protocol === "zk_adms" && (
            <label className="space-y-1 text-sm">
              <span className="text-[var(--text-muted)]">Orden para registrar huella</span>
              <select
                className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-field px-2.5 text-sm text-ink"
                value={draft.enroll_command ?? "ENROLL_FP"}
                onChange={(e) => setDraft({ ...draft, enroll_command: e.target.value as AccessConfig["enroll_command"] })}
              >
                <option value="ENROLL_FP">ENROLL_FP (la mayoría)</option>
                <option value="ENROLL_BIO">ENROLL_BIO (firmware reciente)</option>
              </select>
            </label>
          )}
          {draft.protocol === "zk_adms" && (
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-[var(--text-muted)]">IPs permitidas (IP pública del gimnasio, separadas por coma)</span>
              <input
                className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-field px-2.5 text-sm text-ink"
                placeholder="Vacío = cualquiera (no recomendado)"
                value={(draft.allowed_ips ?? []).join(", ")}
                onChange={(e) =>
                  setDraft({ ...draft, allowed_ips: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
                }
              />
            </label>
          )}
        </div>
        <p className="text-[12.5px] text-[var(--text-muted)]">
          Tras cambiar el bloqueo, prueba con un socio vencido: si el torniquete aún lo deja pasar, usa otra opción.
          Si registras IPs y el internet del gimnasio cambia de IP, el torniquete dejará de sincronizar hasta que la actualices.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={save} disabled={busy !== null}>
          {busy === "save" && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Guardar ajustes
        </Button>
      </details>
    </div>
  );
}
