"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackupCodes } from "@/components/security/TwoStepSetup";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import {
  CheckCircleIcon as Check,
  DeviceMobileIcon as Phone,
  EnvelopeSimpleIcon as Mail,
  FingerprintIcon as Fingerprint,
  KeyIcon as Key,
  ShieldCheckIcon as Shield,
  ShieldWarningIcon as ShieldWarn,
} from "@phosphor-icons/react";

type Method = "totp" | "email" | "passkey";

interface Status {
  enabled: boolean;
  required: boolean;
  methods: Record<Method, boolean>;
  preferred: Method | null;
  backup_codes_left: number;
  email: string;
  email_hint: string;
  passkeys: { id: string; name: string; created_at: string; last_used_at: string | null }[];
}

type Flow =
  | { kind: "totp-setup"; secret: string; uri: string }
  | { kind: "email-setup" }
  | { kind: "disable"; method: "totp" | "email" }
  | { kind: "backup" }
  | { kind: "passkey-delete"; id: string; name: string }
  | null;

function group(secret: string) {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Métodos de verificación en dos pasos de la propia cuenta. Todos opcionales:
 * se recomienda la app autenticadora y nunca se obliga a nadie.
 */
export function TwoStepMethods({ onChange }: { onChange?: () => void } = {}) {
  const { data: session, update } = useSession();
  const token = session?.accessToken;
  const [status, setStatus] = useState<Status | null>(null);
  const [flow, setFlow] = useState<Flow>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [factor, setFactor] = useState<"totp" | "email">("totp");
  const [busy, setBusy] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [canPasskey, setCanPasskey] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiClient(token)
      .get<Status>("/api/v1/auth/mfa/status")
      .then((r) => setStatus(r.data))
      .catch(() => setStatus(null));
  }, [token]);

  useEffect(load, [load]);
  useEffect(() => setCanPasskey(browserSupportsWebAuthn()), []);

  const reset = () => {
    setFlow(null);
    setCode("");
    setPassword("");
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      toast.error(name === "NotAllowedError" ? "Se canceló la llave de acceso" : parseApiError(err, "No se pudo completar"));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (purpose: "mfa_email" | "mfa_disable" | "backup") =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/security/code", { purpose });
      toast.success(`Te enviamos un código a ${data.email_hint}`);
    });

  const done = (newCodes: string[] | undefined, msg: string) => {
    if (newCodes?.length) setCodes(newCodes);
    toast.success(msg);
    reset();
    load();
    onChange?.();
  };

  const startTotp = () =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/mfa/setup");
      setFlow({ kind: "totp-setup", secret: data.secret, uri: data.otpauth_uri });
    });

  const confirmTotp = () =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/mfa/enable", { code: code.replace(/\s/g, "") });
      await update({ accessToken: data.session.access_token, permissions: data.session.permissions });
      done(data.backup_codes, "App autenticadora activada");
    });

  const startEmail = async () => {
    setFlow({ kind: "email-setup" });
    await sendCode("mfa_email");
  };

  const confirmEmail = () =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/mfa/email/enable", { code: code.replace(/\s/g, "") });
      done(data.backup_codes, "Código por correo activado");
    });

  const addPasskey = () =>
    run(async () => {
      const { data: options } = await apiClient(token).post("/api/v1/auth/mfa/passkeys/options");
      const credential = await startRegistration(options);
      const name = passkeyName.trim() || "Llave de acceso";
      const { data } = await apiClient(token).post("/api/v1/auth/mfa/passkeys", { credential, name });
      setPasskeyName("");
      done(data.backup_codes, "Llave de acceso agregada");
    });

  const deletePasskey = (id: string) =>
    run(async () => {
      await apiClient(token).post(`/api/v1/auth/mfa/passkeys/${id}/delete`, { password });
      done(undefined, "Llave de acceso borrada");
    });

  const disable = (method: "totp" | "email") =>
    run(async () => {
      await apiClient(token).post("/api/v1/auth/mfa/disable", { method, password, code: code.replace(/\s/g, "") });
      done(undefined, method === "totp" ? "App autenticadora desactivada" : "Código por correo desactivado");
    });

  const newBackup = () =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/mfa/backup-codes", { code: code.replace(/\s/g, ""), method: factor });
      done(data.backup_codes, "Códigos de respaldo nuevos listos");
    });

  const choosePreferred = (method: Method) =>
    run(async () => {
      await apiClient(token).patch("/api/v1/auth/mfa/preferred", { method });
      load();
    });

  if (!status) return <div className="skeleton h-48 rounded-[var(--radius-lg)]" />;
  if (codes) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-ink">Tus códigos de respaldo</p>
        <BackupCodes codes={codes} />
        <Button type="button" onClick={() => setCodes(null)}>
          Ya los guardé
        </Button>
      </div>
    );
  }

  const active = (Object.keys(status.methods) as Method[]).filter((m) => status.methods[m]);

  const codeInput = (id: string, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="num max-w-[200px] text-lg tracking-[0.3em]"
      />
    </div>
  );

  const passwordInput = (
    <div className="space-y-1.5">
      <Label htmlFor="mfa-pass">Tu contraseña</Label>
      <Input id="mfa-pass" type="password" autoComplete="current-password" value={password}
        onChange={(e) => setPassword(e.target.value)} className="max-w-[280px]" />
    </div>
  );

  return (
    <div className="space-y-5">
      {status.enabled ? (
        <p className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--signal-ok-line)] bg-[var(--signal-ok-bg)] px-3 py-2 text-sm font-medium text-ink">
          <Shield className="size-4 shrink-0 text-[var(--signal-ok)]" weight="fill" aria-hidden />
          Tu cuenta está protegida con verificación en dos pasos.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--signal-warn-line)] bg-[var(--signal-warn-bg)] px-3 py-2 text-sm text-ink">
          <ShieldWarn className="mt-0.5 size-4 shrink-0 text-[var(--signal-warn)]" weight="fill" aria-hidden />
          <span>
            <strong className="font-semibold">Te recomendamos activarla.</strong> Si alguien consigue tu contraseña,
            igual necesitará tu celular, tu correo o tu huella para entrar. Toma un minuto y puedes quitarla cuando quieras.
          </span>
        </p>
      )}

      <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
        {/* App autenticadora */}
        <MethodRow
          icon={<Phone className="size-5" />}
          title="App autenticadora"
          badge="Recomendado"
          description="Un código que cambia cada 30 segundos en Google Authenticator, Microsoft Authenticator o Authy. Funciona sin internet en el celular."
          on={status.methods.totp}
          action={
            status.methods.totp ? (flow?.kind === "disable" && flow.method === "totp" ? null :
              <Button type="button" size="sm" variant="ghost" onClick={() => setFlow({ kind: "disable", method: "totp" })}>
                Desactivar
              </Button>
            ) : flow?.kind === "totp-setup" ? null : (
              <Button type="button" size="sm" isLoading={busy && flow === null} onClick={startTotp}>
                Activar
              </Button>
            )
          }
        >
          {flow?.kind === "totp-setup" && (
            <div className="mt-4 space-y-4">
              <ol className="space-y-1 text-sm text-ink-muted">
                <li>1. Instala Google Authenticator, Microsoft Authenticator o Authy en tu celular.</li>
                <li>2. En la app toca «Agregar» y escanea este código.</li>
                <li>3. Escribe el código de 6 dígitos que aparece.</li>
              </ol>
              <div className="flex flex-col items-start gap-3 sm:flex-row">
                <div className="rounded-[var(--radius-md)] bg-white p-3">
                  <QRCodeSVG value={flow.uri} size={156} level="M" />
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-ink-muted">¿No puedes escanear? Escribe esta clave en la app:</p>
                  <p className="num select-all break-all text-[13px] text-ink">{group(flow.secret)}</p>
                </div>
              </div>
              {codeInput("totp-code", "Código de la app")}
              <div className="flex gap-2">
                <Button type="button" size="sm" isLoading={busy} onClick={confirmTotp}>Activar</Button>
                <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
              </div>
            </div>
          )}
          {flow?.kind === "disable" && flow.method === "totp" && (
            <div className="mt-4 space-y-3">
              {passwordInput}
              {codeInput("totp-off", "Código actual de la app")}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="destructive" isLoading={busy} onClick={() => disable("totp")}>
                  Desactivar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
              </div>
            </div>
          )}
        </MethodRow>

        {/* Llaves de acceso */}
        {canPasskey && (
          <MethodRow
            icon={<Fingerprint className="size-5" />}
            title="Llave de acceso"
            description="Confirma con la huella, el rostro o el PIN de este computador o de tu celular. No hay códigos que escribir."
            on={status.methods.passkey}
            action={null}
          >
            {status.passkeys.length > 0 && (
              <ul className="mt-3 space-y-2">
                {status.passkeys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-muted px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-ink">
                      <Key className="size-4 text-ink-muted" aria-hidden />
                      {k.name}
                      <span className="text-xs text-ink-muted">
                        · agregada el {formatDate(k.created_at, "d MMM yyyy")}
                        {k.last_used_at ? ` · usada el ${formatDate(k.last_used_at, "d MMM yyyy")}` : ""}
                      </span>
                    </span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setFlow({ kind: "passkey-delete", id: k.id, name: k.name })}>
                      Borrar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {flow?.kind === "passkey-delete" ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-ink">Para borrar «{flow.name}» confirma tu contraseña.</p>
                {passwordInput}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="destructive" isLoading={busy} onClick={() => deletePasskey(flow.id)}>Borrar</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pk-name" className="text-xs">Nombre (para reconocerla)</Label>
                  <Input id="pk-name" placeholder="Ej.: PC de recepción" value={passkeyName} maxLength={100}
                    onChange={(e) => setPasskeyName(e.target.value)} className="h-9 w-56" />
                </div>
                <Button type="button" size="sm" variant="outline" isLoading={busy && flow === null} onClick={addPasskey}>
                  Agregar llave de acceso
                </Button>
              </div>
            )}
          </MethodRow>
        )}

        {/* Código por correo */}
        <MethodRow
          icon={<Mail className="size-5" />}
          title="Código por correo"
          description={`Cada vez que entres te enviamos un código a ${status.email_hint}. Es el más fácil, aunque si alguien entra a tu correo también podría verlo.`}
          on={status.methods.email}
          action={
            status.methods.email ? (flow?.kind === "disable" && flow.method === "email" ? null :
              <Button type="button" size="sm" variant="ghost" onClick={() => setFlow({ kind: "disable", method: "email" })}>
                Desactivar
              </Button>
            ) : flow?.kind === "email-setup" ? null : (
              <Button type="button" size="sm" variant="outline" isLoading={busy && flow === null} onClick={startEmail}>
                Activar
              </Button>
            )
          }
        >
          {flow?.kind === "email-setup" && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-ink-muted">Escribe el código que te enviamos para comprobar que el correo te llega.</p>
              {codeInput("email-code", "Código del correo")}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" isLoading={busy} onClick={confirmEmail}>Activar</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => sendCode("mfa_email")}>Reenviar</Button>
                <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
              </div>
            </div>
          )}
          {flow?.kind === "disable" && flow.method === "email" && (
            <div className="mt-4 space-y-3">
              {passwordInput}
              {codeInput("email-off", "Código del correo")}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => sendCode("mfa_disable")}>Enviarme el código</Button>
                <Button type="button" size="sm" variant="destructive" isLoading={busy} onClick={() => disable("email")}>Desactivar</Button>
                <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
              </div>
            </div>
          )}
        </MethodRow>
      </ul>

      {status.enabled && (
        <div className="space-y-3 rounded-[var(--radius-md)] bg-muted p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink">
              <strong className="font-semibold">Códigos de respaldo:</strong> te quedan{" "}
              <span className="num font-semibold">{status.backup_codes_left}</span>. Sirven si pierdes el celular o no te llega el correo.
            </p>
            {flow?.kind !== "backup" && (
              <Button type="button" size="sm" variant="outline" onClick={() => {
                setFactor(status.methods.totp ? "totp" : "email");
                setFlow({ kind: "backup" });
              }}>
                Generar nuevos
              </Button>
            )}
          </div>
          {flow?.kind === "backup" && (
            <div className="space-y-3">
              {status.methods.totp && status.methods.email && (
                <div className="flex gap-2 text-sm">
                  {(["totp", "email"] as const).map((f) => (
                    <label key={f} className="flex items-center gap-1.5">
                      <input type="radio" name="factor" checked={factor === f} onChange={() => setFactor(f)} />
                      {f === "totp" ? "Con la app" : "Con el correo"}
                    </label>
                  ))}
                </div>
              )}
              {codeInput("backup-code", factor === "totp" ? "Código de la app" : "Código del correo")}
              <div className="flex flex-wrap gap-2">
                {factor === "email" && (
                  <Button type="button" size="sm" variant="outline" onClick={() => sendCode("backup")}>Enviarme el código</Button>
                )}
                <Button type="button" size="sm" isLoading={busy} onClick={newBackup}>Generar</Button>
                <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
              </div>
              <p className="text-xs text-ink-muted">Los códigos anteriores dejarán de servir.</p>
            </div>
          )}
          {active.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-muted">Al entrar, pedirme primero:</span>
              {active.map((m) => (
                <button key={m} type="button" onClick={() => choosePreferred(m)} aria-pressed={status.preferred === m}
                  className={`min-h-8 rounded-[var(--radius-sm)] border px-2.5 text-[13px] font-medium ${
                    status.preferred === m ? "border-ink bg-ink text-surface" : "border-line bg-panel text-ink hover:bg-muted"
                  }`}>
                  {m === "totp" ? "La app" : m === "email" ? "El correo" : "La llave"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MethodRow({ icon, title, badge, description, on, action, children }: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  description: string;
  on: boolean;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 text-ink-muted" aria-hidden>{icon}</span>
        <div className="min-w-[200px] flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            {title}
            {badge && (
              <span className="rounded-[var(--radius-sm)] bg-primary-muted px-1.5 py-0.5 text-[11px] font-semibold text-primary-ink">
                {badge}
              </span>
            )}
            {on && (
              <span className="flex items-center gap-1 text-[12px] font-medium text-[var(--signal-ok)]">
                <Check className="size-3.5" weight="fill" aria-hidden /> Activa
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </li>
  );
}
