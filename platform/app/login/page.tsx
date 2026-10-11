"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { api, saveSession, type PlatformSession } from "@/lib/api";
import { Notice } from "@/components/StatusPill";

type Step =
  | { kind: "password" }
  | { kind: "enroll"; ticket: string; secret: string; otpauth_uri: string }
  | { kind: "otp"; ticket: string }
  | { kind: "codes"; codes: string[]; session: PlatformSession };

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(new URLSearchParams(window.location.search).has("expired"));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar");
    } finally {
      setBusy(false);
    }
  };

  const onPassword = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    return run(async () => {
      const r = await api<{ step: "enroll" | "otp"; ticket: string; secret?: string; otpauth_uri?: string }>(
        "/auth/login",
        { method: "POST", auth: false, body: { email: f.get("email"), password: f.get("password") } },
      );
      setStep(r.step === "enroll"
        ? { kind: "enroll", ticket: r.ticket, secret: r.secret!, otpauth_uri: r.otpauth_uri! }
        : { kind: "otp", ticket: r.ticket });
    });
  };

  const onCode = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step.kind !== "enroll" && step.kind !== "otp") return;
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    return run(async () => {
      if (step.kind === "enroll") {
        const r = await api<PlatformSession & { backup_codes: string[] }>("/auth/enroll", {
          method: "POST", auth: false, body: { ticket: step.ticket, code },
        });
        setStep({ kind: "codes", codes: r.backup_codes, session: r });
      } else {
        const r = await api<PlatformSession>("/auth/verify", { method: "POST", auth: false, body: { ticket: step.ticket, code } });
        saveSession(r);
        router.replace("/");
      }
    });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="card w-full max-w-[420px] p-7">
        <p className="text-xs font-medium text-ink-muted">LSMFit</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">Plataforma</h1>
        <p className="mt-1 text-sm text-ink-muted">Acceso solo para el equipo de LSMFit.</p>

        <div className="mt-6 space-y-4">
          {expired && step.kind === "password" && !error && <Notice tone="warn">La sesión se cerró. Entra de nuevo.</Notice>}

          {step.kind === "password" && (
            <form onSubmit={onPassword} className="space-y-4">
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Correo</span>
                <input className="field" name="email" type="email" autoComplete="username" required />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Contraseña</span>
                <input className="field" name="password" type="password" autoComplete="current-password" required />
              </label>
              {error && <Notice tone="danger">{error}</Notice>}
              <button className="btn btn-primary w-full" disabled={busy}>
                {busy ? "Verificando…" : "Continuar"}
              </button>
            </form>
          )}

          {(step.kind === "enroll" || step.kind === "otp") && (
            <form onSubmit={onCode} className="space-y-4">
              {step.kind === "enroll" && (
                <>
                  <p className="text-sm text-ink-muted">
                    Primer ingreso: escanea el código con tu app autenticadora (Google Authenticator, Microsoft
                    Authenticator, Authy). Sin ella no hay acceso al panel.
                  </p>
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-[var(--radius-md)] bg-white p-3">
                      <QRCodeSVG value={step.otpauth_uri} size={176} level="M" />
                    </div>
                    <p className="num select-all break-all text-center text-[13px]">
                      {step.secret.replace(/(.{4})/g, "$1 ").trim()}
                    </p>
                  </div>
                </>
              )}
              {step.kind === "otp" && (
                <p className="text-sm text-ink-muted">Escribe el código de tu app autenticadora o un código de respaldo.</p>
              )}
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Código</span>
                <input
                  className="field num text-lg tracking-[0.3em]"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  autoFocus
                  required
                />
              </label>
              {error && <Notice tone="danger">{error}</Notice>}
              <button className="btn btn-primary w-full" disabled={busy}>
                {busy ? "Verificando…" : step.kind === "enroll" ? "Activar y entrar" : "Entrar"}
              </button>
              <button type="button" className="w-full text-sm text-ink-muted hover:text-ink" onClick={() => setStep({ kind: "password" })}>
                Volver
              </button>
            </form>
          )}

          {step.kind === "codes" && (
            <div className="space-y-4">
              <Notice tone="ok">App autenticadora activa.</Notice>
              <p className="text-sm text-ink-muted">
                Guarda estos códigos de respaldo fuera de este computador. Cada uno sirve una vez si pierdes el celular. No
                se vuelven a mostrar.
              </p>
              <ul className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] bg-muted p-3">
                {step.codes.map((c) => (
                  <li key={c} className="num text-center text-sm tracking-wider">
                    {c}
                  </li>
                ))}
              </ul>
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  saveSession(step.session);
                  router.replace("/");
                }}
              >
                Ya los guardé, entrar
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
