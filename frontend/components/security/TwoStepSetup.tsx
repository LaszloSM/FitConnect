"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { CopyIcon as Copy, DownloadSimpleIcon as Download, ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react";

interface Status {
  enabled: boolean;
  required: boolean;
  backup_codes_left: number;
}

interface EnabledSession {
  access_token: string;
  permissions?: string[];
}

function groupSecret(secret: string) {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/** Códigos de respaldo: se muestran una sola vez, con copiar y descargar. */
export function BackupCodes({ codes }: { codes: string[] }) {
  const text = codes.join("\n");
  const download = () => {
    const blob = new Blob([`Códigos de respaldo de FitConnect\nCada uno sirve una sola vez.\n\n${text}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fitconnect-codigos-de-respaldo.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Guárdalos en un lugar seguro (no en este computador). Si pierdes el celular, cada código te deja entrar
        una vez. No los volverás a ver.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] border border-line bg-muted p-3">
        {codes.map((c) => (
          <li key={c} className="num text-center font-mono text-sm tracking-wider text-ink">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Códigos copiados"))}
        >
          <Copy /> Copiar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download /> Descargar
        </Button>
      </div>
    </div>
  );
}

/**
 * Configurar la verificación en dos pasos de la propia cuenta: QR para la app
 * autenticadora, confirmar un código y entregar los códigos de respaldo.
 * `onEnabled` recibe la sesión nueva que entrega el backend al activarla.
 */
export function TwoStepSetup({ onEnabled }: { onEnabled?: (session: EnabledSession, codes: string[]) => void }) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "regenerate" | "disable">("idle");

  useEffect(() => {
    if (!token) return;
    apiClient(token)
      .get<Status>("/api/v1/auth/mfa/status")
      .then((r) => setStatus(r.data))
      .catch(() => setStatus({ enabled: false, required: false, backup_codes_left: 0 }));
  }, [token]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo completar"));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/mfa/setup");
      setSetup(data);
    });

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/mfa/enable", { code: code.replace(/\s/g, "") });
      setCodes(data.backup_codes);
      setSetup(null);
      setCode("");
      setStatus((s) => ({ enabled: true, required: s?.required ?? false, backup_codes_left: data.backup_codes.length }));
      onEnabled?.(data.session, data.backup_codes);
    });
  };

  const regenerate = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/mfa/backup-codes", { code: code.replace(/\s/g, "") });
      setCodes(data.backup_codes);
      setCode("");
      setMode("idle");
      setStatus((s) => (s ? { ...s, backup_codes_left: data.backup_codes.length } : s));
    });
  };

  const disable = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await apiClient(token).post("/api/v1/auth/mfa/disable", { password, code: code.replace(/\s/g, "") });
      setStatus((s) => (s ? { ...s, enabled: false, backup_codes_left: 0 } : s));
      setCode("");
      setPassword("");
      setMode("idle");
      toast.success("Verificación en dos pasos desactivada");
    });
  };

  if (!status) return <div className="skeleton h-40 rounded-[var(--radius-lg)]" />;

  if (codes) return <BackupCodes codes={codes} />;

  if (setup) {
    return (
      <form onSubmit={confirm} className="space-y-5">
        <ol className="space-y-1.5 text-sm text-ink-muted">
          <li>1. Instala Google Authenticator, Microsoft Authenticator o Authy en tu celular.</li>
          <li>2. En la app toca «Agregar» y escanea este código.</li>
          <li>3. Escribe el código de 6 dígitos que aparece.</li>
        </ol>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div className="rounded-[var(--radius-md)] bg-white p-3">
            <QRCodeSVG value={setup.otpauth_uri} size={168} level="M" />
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-ink-muted">¿No puedes escanear? Escribe esta clave en la app:</p>
            <p className="num select-all break-all font-mono text-[13px] text-ink">{groupSecret(setup.secret)}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mfa-code">Código de la app</Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="num max-w-[200px] text-lg tracking-[0.3em]"
          />
        </div>
        <Button type="submit" isLoading={busy}>
          Activar
        </Button>
      </form>
    );
  }

  if (!status.enabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Además de la contraseña, al entrar se te pedirá un código que cambia cada 30 segundos en tu celular. Si alguien
          consigue tu contraseña, igual no puede entrar.
          {status.required && " Para dueños y administradores es obligatoria."}
        </p>
        <Button type="button" onClick={start} isLoading={busy}>
          Configurar la app autenticadora
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm font-medium text-[var(--signal-ok)]">
        <ShieldCheck className="size-4" aria-hidden /> Activa
      </p>
      <p className="text-sm text-ink-muted">
        Te quedan <span className="num font-semibold text-ink">{status.backup_codes_left}</span> códigos de respaldo.
      </p>
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setMode("regenerate")}>
            Generar códigos de respaldo nuevos
          </Button>
          {!status.required && (
            <Button type="button" variant="destructive" size="sm" onClick={() => setMode("disable")}>
              Desactivar
            </Button>
          )}
        </div>
      )}
      {mode !== "idle" && (
        <form onSubmit={mode === "regenerate" ? regenerate : disable} className="space-y-3">
          {mode === "disable" && (
            <div className="space-y-1.5">
              <Label htmlFor="mfa-pass">Contraseña</Label>
              <Input
                id="mfa-pass"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="max-w-[280px]"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mfa-code-2">Código actual de la app</Label>
            <Input
              id="mfa-code-2"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="num max-w-[200px] tracking-[0.3em]"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant={mode === "disable" ? "destructive" : "default"} isLoading={busy}>
              {mode === "disable" ? "Desactivar" : "Generar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
