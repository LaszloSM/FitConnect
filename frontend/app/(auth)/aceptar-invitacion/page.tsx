"use client";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/common/BrandMark";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    const confirm = String(form.get("confirm"));
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${apiUrl}/api/v1/auth/staff/accept-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.detail || "No se pudo aceptar la invitación");
      return;
    }
    router.push("/login?invited=1");
  }

  if (!token) {
    return (
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-base)] p-8 shadow-[var(--shadow-dialog)]">
        <div className="flex items-center gap-2.5 mb-4">
          <BrandMark size={32} />
          <span className="text-[var(--text-base)] font-extrabold text-xl tracking-tight">FitConnect</span>
        </div>
        <h2 className="text-[var(--text-base)] font-bold text-lg">Enlace inválido</h2>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          El enlace de invitación no es válido. Pídele a tu gimnasio uno nuevo.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-base)] p-8 shadow-[var(--shadow-dialog)]">
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-4">
          <BrandMark size={32} />
          <span className="text-[var(--text-base)] font-extrabold text-xl tracking-tight">FitConnect</span>
        </div>
        <h2 className="text-[var(--text-base)] font-bold text-lg">Activa tu cuenta</h2>
        <p className="text-[var(--text-muted)] text-sm mt-0.5">Crea tu contraseña para acceder a la plataforma</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[var(--text-muted)] text-sm font-medium">Nueva contraseña</Label>
          <Input id="password" name="password" type="password" required minLength={8}
            className="focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-[var(--text-muted)] text-sm font-medium">Confirmar contraseña</Label>
          <Input id="confirm" name="confirm" type="password" required minLength={8}
            className="focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button type="submit" disabled={loading}
          className="w-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)] transition-colors duration-150">
          {loading ? "Activando..." : "Activar cuenta"}
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
