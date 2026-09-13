"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthCardHeader, AuthNotice } from "@/components/common/AuthCardHeader";

function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/auth/staff/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(typeof err.detail === "string" ? err.detail : "No pudimos activar la cuenta. Pídele a tu gimnasio un enlace nuevo.");
        return;
      }
      router.push("/login?invited=1");
    } catch {
      setError("No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div>
        <AuthCardHeader title="Este enlace no sirve" subtitle="Le falta el código de invitación o está incompleto." />
        <p className="text-sm text-ink-muted">
          Pídele al dueño o administrador de tu gimnasio que te envíe una invitación nueva desde Configuración → Equipo.
          Las invitaciones vencen a las 48 horas.
        </p>
        <p className="mt-8 text-sm text-ink-muted">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-primary-ink hover:underline">Ingresa</Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <AuthCardHeader title="Activa tu cuenta" subtitle="Tu gimnasio te invitó. Elige la contraseña con la que vas a entrar." />
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label>Contraseña nueva</Label>
          <PasswordInput
            showStrength
            value={password}
            onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
            autoComplete="new-password"
            required
            placeholder="Mínimo 8 caracteres"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Confirma la contraseña</Label>
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm((e.target as HTMLInputElement).value)}
            autoComplete="new-password"
            required
          />
        </div>
        {error && <AuthNotice tone="danger">{error}</AuthNotice>}
        <Button type="submit" size="lg" isLoading={loading} className="w-full">
          Activar cuenta
        </Button>
      </form>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
