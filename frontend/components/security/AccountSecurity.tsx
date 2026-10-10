"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";

interface NewSession {
  access_token: string;
  permissions?: string[];
}

function useRun() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(parseApiError(err, fallback));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/**
 * Cambiar la contraseña: la actual, la nueva y un código que llega al correo
 * (o el de la app autenticadora). Sin el código no se cambia: quien encuentre
 * la sesión abierta no puede quedarse con la cuenta.
 */
export function PasswordChange({ hasTotp }: { hasTotp: boolean }) {
  const { data: session, update } = useSession();
  const token = session?.accessToken;
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "code">("form");
  const [method, setMethod] = useState<"email" | "totp">("email");
  const [form, setForm] = useState({ current: "", next: "", confirm: "", code: "" });

  const close = () => {
    setOpen(false);
    setStep("form");
    setForm({ current: "", next: "", confirm: "", code: "" });
  };

  const valid = form.current && form.next.length >= 8 && form.next === form.confirm;

  const toCode = () =>
    run(async () => {
      if (method === "email") {
        const { data } = await apiClient(token).post("/api/v1/auth/security/code", { purpose: "password" });
        toast.success(`Te enviamos un código a ${data.email_hint}`);
      }
      setStep("code");
    }, "No pudimos enviar el código");

  const save = () =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/password/change", {
        current_password: form.current,
        new_password: form.next,
        code: form.code.replace(/\s/g, ""),
        method,
      });
      const s = data.session as NewSession;
      await update({ accessToken: s.access_token, permissions: s.permissions });
      toast.success("Contraseña cambiada. Cerramos tu sesión en los demás equipos.");
      close();
    }, "No se pudo cambiar la contraseña");

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Para cambiarla te pediremos la actual y un código. ¿No la recuerdas?{" "}
          <Link href="/recuperar" className="font-medium text-primary-ink hover:underline">Restablécela por correo</Link>.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Cambiar contraseña
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step === "form" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
              <Label htmlFor="pw-current">Contraseña actual</Label>
              <PasswordInput id="pw-current" autoComplete="current-password" value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">Contraseña nueva</Label>
              <PasswordInput id="pw-new" autoComplete="new-password" showStrength value={form.next}
                onChange={(e) => setForm({ ...form, next: e.target.value })} />
              <p className="text-xs text-ink-muted">Mínimo 8 caracteres. Mejor una frase larga que una palabra con símbolos.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">Repite la contraseña nueva</Label>
              <PasswordInput id="pw-confirm" autoComplete="new-password" value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
              {form.confirm && form.confirm !== form.next && (
                <p className="text-xs text-[var(--signal-danger)]">No coincide con la contraseña nueva.</p>
              )}
            </div>
          </div>
          {hasTotp && (
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-ink-muted">Confirmar con:</span>
              {(["email", "totp"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-ink">
                  <input type="radio" name="pw-method" checked={method === m} onChange={() => setMethod(m)} />
                  {m === "email" ? "Código al correo" : "App autenticadora"}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!valid} isLoading={busy} onClick={toCode}>Continuar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={close}>Cancelar</Button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="pw-code">{method === "email" ? "Código que te llegó al correo" : "Código de la app autenticadora"}</Label>
            <Input id="pw-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} className="num max-w-[200px] text-lg tracking-[0.3em]" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" isLoading={busy} onClick={save}>Cambiar contraseña</Button>
            {method === "email" && (
              <Button type="button" size="sm" variant="ghost" onClick={toCode}>Reenviar código</Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => setStep("form")}>Atrás</Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Cambiar el correo de acceso: se confirma con un código que llega al correo NUEVO. */
export function EmailChange({ email, onChanged }: { email: string; onChanged: (email: string) => void }) {
  const { data: session, update } = useSession();
  const token = session?.accessToken;
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", code: "" });

  const close = () => {
    setOpen(false);
    setSent(false);
    setForm({ email: "", password: "", code: "" });
  };

  const sendCode = () =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/email/change/code", {
        new_email: form.email.trim(), current_password: form.password,
      });
      setSent(true);
      toast.success(`Te enviamos un código a ${data.email_hint}`);
    }, "No pudimos enviar el código");

  const confirm = () =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/email/change", {
        new_email: form.email.trim(), code: form.code.replace(/\s/g, ""),
      });
      await update({ accessToken: data.session.access_token, permissions: data.session.permissions });
      onChanged(data.email);
      toast.success("Listo: ahora entras con tu correo nuevo");
      close();
    }, "No se pudo cambiar el correo");

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Entras con <strong className="font-semibold text-ink">{email}</strong>. Ahí te llegan los códigos y avisos de seguridad.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Cambiar correo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="em-new">Correo nuevo</Label>
          <Input id="em-new" type="email" autoComplete="email" value={form.email} disabled={sent}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="em-pass">Tu contraseña</Label>
          <PasswordInput id="em-pass" autoComplete="current-password" value={form.password} disabled={sent}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
      </div>
      {sent && (
        <div className="space-y-1.5">
          <Label htmlFor="em-code">Código que llegó al correo nuevo</Label>
          <Input id="em-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })} className="num max-w-[200px] text-lg tracking-[0.3em]" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {sent ? (
          <Button type="button" size="sm" isLoading={busy} onClick={confirm}>Confirmar correo nuevo</Button>
        ) : (
          <Button type="button" size="sm" isLoading={busy} disabled={!form.email.includes("@") || !form.password} onClick={sendCode}>
            Enviar código al correo nuevo
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={close}>Cancelar</Button>
      </div>
    </div>
  );
}

/** Cerrar la sesión en todos los equipos menos en este. */
export function SessionsCard() {
  const { data: session, update } = useSession();
  const token = session?.accessToken;
  const { busy, run } = useRun();
  const [confirm, setConfirm] = useState(false);

  const revoke = () =>
    run(async () => {
      const { data } = await apiClient(token).post("/api/v1/auth/sessions/revoke-all");
      await update({ accessToken: data.session.access_token, permissions: data.session.permissions });
      toast.success("Cerramos tu sesión en los demás equipos");
      setConfirm(false);
    }, "No se pudo cerrar las sesiones");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-muted">
        ¿Entraste en un computador que no es tuyo o perdiste el celular? Cierra la sesión en todos los demás equipos.
      </p>
      {confirm ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="destructive" isLoading={busy} onClick={revoke}>Sí, cerrarlas</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(true)}>
          Cerrar sesión en todos los equipos
        </Button>
      )}
    </div>
  );
}
