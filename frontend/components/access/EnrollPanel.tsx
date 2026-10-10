"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import {
  FingerprintIcon as Fingerprint,
  ScanIcon as ScanFace,
  ImageIcon as ImageSquare,
  SpinnerGapIcon as Loader2,
  CheckCircleIcon as CheckCircle,
  WarningIcon as Warning,
} from "@phosphor-icons/react";

export interface AccessDevice {
  id: string;
  name: string;
  protocol: string | null;
  connected: boolean;
  online: boolean;
}

type Biometric = "face" | "fingerprint";
type EnrollKind = "face" | "fingerprint" | "face_photo";

interface Command {
  id: string;
  status: "pending" | "sent" | "done" | "failed" | "cancelled";
  error: string | null;
  pin: string | null;
}

const FINGERS = [
  { value: 6, label: "Índice derecho" },
  { value: 1, label: "Índice izquierdo" },
  { value: 5, label: "Pulgar derecho" },
  { value: 7, label: "Medio derecho" },
];

const CONSENT_TEXT: Record<Biometric, string> = {
  face:
    "El socio autoriza de forma previa, expresa e informada el uso de su rostro para controlar su ingreso. Es un dato sensible (Ley 1581 de 2012), es opcional y puede entrar con cédula o QR. Se guarda solo en el torniquete y puede retirarlo cuando quiera.",
  fingerprint:
    "El socio autoriza de forma previa, expresa e informada el uso de su huella para controlar su ingreso. Es un dato sensible (Ley 1581 de 2012), es opcional y puede entrar con cédula o QR. Se guarda solo en el torniquete y puede retirarla cuando quiera.",
};

const STEP_TEXT: Record<EnrollKind, string> = {
  face: "Pídele que se pare frente a la pantalla del torniquete, sin gorra ni gafas oscuras.",
  face_photo: "Enviando la foto de la ficha al torniquete…",
  fingerprint: "Pídele que ponga el dedo en el lector del torniquete tres veces.",
};

/**
 * Registrar rostro y huella en el torniquete desde LSMFit, igual que el
 * "Registrar Rostro / Registrar Huella" del programa anterior. Pide el
 * consentimiento primero y sigue el progreso del equipo en vivo.
 */
export function EnrollPanel({
  memberId,
  hasPhoto,
  onEnrolled,
}: {
  memberId: string;
  hasPhoto: boolean;
  onEnrolled?: () => void;
}) {
  const { data: session } = useSession();
  const token = session?.accessToken as string | undefined;
  const [devices, setDevices] = useState<AccessDevice[] | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [consents, setConsents] = useState<Record<Biometric, boolean>>({ face: false, fingerprint: false });
  const [accepted, setAccepted] = useState<Record<Biometric, boolean>>({ face: false, fingerprint: false });
  const [finger, setFinger] = useState(6);
  const [running, setRunning] = useState<{ kind: EnrollKind; command: Command } | null>(null);
  const [done, setDone] = useState<Record<Biometric, boolean>>({ face: false, fingerprint: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const client = apiClient(token);
    const [devs, access] = await Promise.all([
      client.get<AccessDevice[]>("/api/v1/access/devices").then((r) => r.data).catch(() => []),
      client.get(`/api/v1/members/${memberId}/access`).then((r) => r.data).catch(() => null),
    ]);
    const usable = devs.filter((d) => d.connected);
    setDevices(usable);
    setDeviceId((cur) => cur || usable[0]?.id || "");
    if (access) {
      const active = (k: string) => access.consents.some((c: { kind: string; revoked_at: string | null }) => c.kind === k && !c.revoked_at);
      setConsents({ face: active("face"), fingerprint: active("fingerprint") });
      const creds = access.credentials.filter((c: { revoked_at: string | null }) => !c.revoked_at);
      setDone({
        face: creds.some((c: { kind: string }) => c.kind === "face"),
        fingerprint: creds.some((c: { kind: string }) => c.kind === "fingerprint"),
      });
    }
  }, [token, memberId]);

  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const poll = (kind: EnrollKind, id: string, startedAt: number) => {
    timer.current = setTimeout(async () => {
      if (!token) return;
      try {
        const { data } = await apiClient(token).get<Command>(`/api/v1/access/commands/${id}`);
        setRunning({ kind, command: data });
        if (data.status === "done") {
          toast.success(kind === "fingerprint" ? "Huella registrada" : "Rostro registrado");
          setDone((d) => ({ ...d, [kind === "fingerprint" ? "fingerprint" : "face"]: true }));
          onEnrolled?.();
          return;
        }
        if (data.status === "failed" || data.status === "cancelled") return;
        if (Date.now() - startedAt > 120_000) {
          setRunning({ kind, command: { ...data, status: "failed", error: "El torniquete no respondió a tiempo" } });
          return;
        }
        poll(kind, id, startedAt);
      } catch {
        poll(kind, id, startedAt);
      }
    }, 1500);
  };

  const start = async (kind: EnrollKind) => {
    if (!token || !deviceId) return;
    const biometric: Biometric = kind === "fingerprint" ? "fingerprint" : "face";
    const client = apiClient(token);
    try {
      if (!consents[biometric]) {
        if (!accepted[biometric]) {
          toast.error("Primero marca la autorización del socio");
          return;
        }
        await client.post(`/api/v1/members/${memberId}/biometric-consents`, {
          kind: biometric,
          signature_method: "checkbox",
          accepted: true,
        });
        setConsents((c) => ({ ...c, [biometric]: true }));
      }
      const { data } = await client.post<Command>(`/api/v1/members/${memberId}/enroll`, {
        device_id: deviceId,
        kind,
        finger: kind === "fingerprint" ? finger : 0,
      });
      setRunning({ kind, command: data });
      poll(kind, data.id, Date.now());
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo iniciar el registro"));
    }
  };

  if (devices === null) return <div className="skeleton h-28 rounded-[var(--radius-lg)]" />;
  if (devices.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-[var(--bg-muted)] px-3 py-3 text-sm text-[var(--text-muted)]">
        Aún no hay un torniquete conectado. Conéctalo en Ajustes › Dispositivos; mientras tanto el socio entra con su
        cédula o su QR.
      </p>
    );
  }

  const busy = running && (running.command.status === "pending" || running.command.status === "sent");
  const device = devices.find((d) => d.id === deviceId);

  const row = (biometric: Biometric, icon: React.ReactNode, title: string, actions: React.ReactNode) => (
    <div className="space-y-2.5 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold">{title}</p>
        {done[biometric] && <StatusBadge status="enrolled" label="Registrado" tone="success" className="ml-auto" />}
      </div>
      {!consents[biometric] && (
        <label className="flex items-start gap-2.5 text-[13px] leading-snug text-[var(--text-muted)]">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            checked={accepted[biometric]}
            onChange={(e) => setAccepted((a) => ({ ...a, [biometric]: e.target.checked }))}
          />
          {CONSENT_TEXT[biometric]}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );

  return (
    <div className="space-y-1">
      {devices.length > 1 ? (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-muted)]">Torniquete</span>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="h-9 rounded-[var(--radius-md)] border border-line bg-field px-2.5 text-sm text-ink"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          Torniquete: <span className="font-medium text-[var(--text-base)]">{device?.name}</span>
        </p>
      )}
      {device && !device.online && (
        <p className="flex items-center gap-1.5 text-[13px] text-[var(--signal-warn)]">
          <Warning className="h-3.5 w-3.5" aria-hidden /> El torniquete no se ha conectado en los últimos minutos: el registro
          quedará en cola hasta que vuelva.
        </p>
      )}

      <div className="divide-y divide-[var(--border-base)]">
        {row(
          "face",
          <ScanFace className="h-4 w-4 text-[var(--text-muted)]" />,
          "Rostro",
          <>
            <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => start("face")}>
              <ScanFace className="h-4 w-4 mr-1.5" /> Registrar en el torniquete
            </Button>
            {hasPhoto && (
              <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => start("face_photo")}>
                <ImageSquare className="h-4 w-4 mr-1.5" /> Usar la foto de la ficha
              </Button>
            )}
          </>,
        )}
        {row(
          "fingerprint",
          <Fingerprint className="h-4 w-4 text-[var(--text-muted)]" />,
          "Huella (por si no lo reconoce el rostro)",
          <>
            <select
              aria-label="Dedo"
              value={finger}
              onChange={(e) => setFinger(Number(e.target.value))}
              className="h-8 rounded-[var(--radius-sm)] border border-line bg-field px-2 text-[13px] text-ink"
            >
              {FINGERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => start("fingerprint")}>
              <Fingerprint className="h-4 w-4 mr-1.5" /> Registrar huella
            </Button>
          </>,
        )}
      </div>

      {running && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--bg-muted)] px-3 py-2.5 text-sm"
        >
          {busy && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
          {running.command.status === "done" && <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--signal-ok)]" />}
          {(running.command.status === "failed" || running.command.status === "cancelled") && (
            <Warning className="mt-0.5 h-4 w-4 shrink-0 text-[var(--signal-danger)]" />
          )}
          <div>
            {running.command.status === "pending" && <p>Esperando al torniquete…</p>}
            {running.command.status === "sent" && <p>{STEP_TEXT[running.kind]}</p>}
            {running.command.status === "done" && <p>Listo. Ya puede entrar.</p>}
            {(running.command.status === "failed" || running.command.status === "cancelled") && (
              <>
                <p>{running.command.error || "El torniquete no pudo registrarlo."}</p>
                <p className="text-[13px] text-[var(--text-muted)]">
                  Si el equipo no acepta el registro remoto, hazlo desde su menú (Usuarios › Nuevo) con el ID{" "}
                  <span className="num font-semibold text-[var(--text-base)]">{running.command.pin}</span>: LSMFit lo
                  detecta solo.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
