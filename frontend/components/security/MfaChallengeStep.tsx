"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCardHeader, AuthNotice } from "@/components/common/AuthCardHeader";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";

export type MfaMethod = "totp" | "email" | "passkey" | "backup";

export interface MfaStep {
  t: string;
  m: MfaMethod[];
  p: MfaMethod | null;
  e: string | null;
}

/** Lo que manda `auth.ts` en el error `mfa:<base64url>`. */
export function decodeMfaStep(raw: string): MfaStep {
  try {
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const step = JSON.parse(decodeURIComponent(escape(json))) as MfaStep;
    if (step.t) return step;
  } catch {
    // Formato viejo: solo el token, con la app autenticadora.
  }
  return { t: raw, m: ["totp", "backup"], p: "totp", e: null };
}

const COPY: Record<MfaMethod, { tab: string; title: string; subtitle: (e: string | null) => string }> = {
  totp: {
    tab: "App autenticadora",
    title: "Escribe el código de tu app",
    subtitle: () => "Abre Google Authenticator, Microsoft Authenticator o Authy y escribe el código de 6 dígitos de LSMFit.",
  },
  email: {
    tab: "Código por correo",
    title: "Revisa tu correo",
    subtitle: (e) => `Te enviamos un código de 6 dígitos a ${e ?? "tu correo"}. Vence en 10 minutos.`,
  },
  passkey: {
    tab: "Llave de acceso",
    title: "Confirma con tu llave de acceso",
    subtitle: () => "Usa la huella, el rostro o el PIN de este equipo o de tu celular.",
  },
  backup: {
    tab: "Código de respaldo",
    title: "Usa un código de respaldo",
    subtitle: () => "Escribe uno de los códigos que guardaste al activar la verificación. Cada uno sirve una sola vez.",
  },
};

/** Segundo paso del ingreso: la persona elige con qué se verifica. */
export function MfaChallengeStep({ step, onDone, onBack }: { step: MfaStep; onDone: () => void; onBack: (msg?: string) => void }) {
  const [method, setMethod] = useState<MfaMethod>(step.p && step.m.includes(step.p) ? step.p : step.m[0]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const emailSent = useRef(false);
  const api = apiClient();

  const sendEmail = async () => {
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/auth/mfa/challenge/email", { challenge_token: step.t });
      emailSent.current = true;
      setInfo(`Código enviado a ${data.email_hint}.`);
    } catch (err) {
      setError(parseApiError(err, "No pudimos enviar el código"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (method === "email" && !emailSent.current) void sendEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  const finish = async (fields: Record<string, string>) => {
    setLoading(true);
    setError("");
    const result = await signIn("credentials", { challenge_token: step.t, method, redirect: false, ...fields });
    setLoading(false);
    if (result?.error) {
      const msg = result.code ?? "";
      if (msg.includes("venció")) {
        onBack("Pasaron más de 5 minutos. Escribe de nuevo tu contraseña.");
        return;
      }
      setError(msg && msg !== "credentials" ? msg : "No pudimos verificarte");
      return;
    }
    onDone();
  };

  const usePasskey = async () => {
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/auth/mfa/challenge/passkey", { challenge_token: step.t });
      const credential = await startAuthentication(data);
      await finish({ credential: JSON.stringify(credential) });
    } catch (err) {
      setLoading(false);
      const name = (err as { name?: string })?.name;
      setError(name === "NotAllowedError" ? "Se canceló la llave de acceso. Intenta de nuevo o usa otro método." : parseApiError(err, "No se pudo usar la llave de acceso"));
    }
  };

  const copy = COPY[method];

  return (
    <div>
      <AuthCardHeader title={copy.title} subtitle={copy.subtitle(step.e)} />
      {step.m.length > 1 && (
        <div role="tablist" aria-label="Método de verificación" className="mb-5 flex flex-wrap gap-1.5">
          {step.m.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              onClick={() => {
                setMethod(m);
                setError("");
                setInfo("");
              }}
              className={`min-h-9 rounded-[var(--radius-sm)] border px-3 text-[13px] font-medium transition-colors ${
                method === m ? "border-ink bg-ink text-surface" : "border-line bg-panel text-ink hover:bg-muted"
              }`}
            >
              {COPY[m].tab}
            </button>
          ))}
        </div>
      )}

      {method === "passkey" ? (
        <div className="space-y-5">
          {error && <AuthNotice tone="danger">{error}</AuthNotice>}
          <Button type="button" size="lg" isLoading={loading} className="w-full" onClick={usePasskey}>
            Usar mi llave de acceso
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const code = String(new FormData(e.currentTarget).get("code") ?? "");
            void finish({ code });
          }}
          className="space-y-5"
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">{method === "backup" ? "Código de respaldo" : "Código de 6 dígitos"}</Label>
            <Input
              key={method}
              id="code"
              name="code"
              inputMode={method === "backup" ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={12}
              className="num text-lg tracking-[0.3em]"
            />
            {method === "email" && (
              <button type="button" onClick={sendEmail} disabled={loading} className="text-xs text-ink-muted hover:text-ink hover:underline">
                ¿No te llegó? Revisa spam o envíalo de nuevo
              </button>
            )}
          </div>
          {info && !error && <AuthNotice tone="ok">{info}</AuthNotice>}
          {error && <AuthNotice tone="danger">{error}</AuthNotice>}
          <Button type="submit" size="lg" isLoading={loading} className="w-full">
            Verificar
          </Button>
        </form>
      )}
      <button type="button" onClick={() => onBack()} className="mt-4 w-full text-sm text-ink-muted hover:text-ink">
        Volver
      </button>
    </div>
  );
}
