"use client";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCardHeader, AuthNotice } from "@/components/common/AuthCardHeader";

// Mensajes que llegan por la URL desde otros flujos.
const AVISOS: Record<string, { tone: "warn" | "ok"; text: string }> = {
  expired: { tone: "warn", text: "Tu sesión se cerró por seguridad. Ingresa de nuevo." },
  registered: { tone: "ok", text: "Tu gimnasio quedó creado. Ingresa con el email y la contraseña que elegiste." },
  invited: { tone: "ok", text: "Tu cuenta quedó activa. Ingresa con tu email y la contraseña nueva." },
};

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<(typeof AVISOS)[string] | null>(null);
  const [loading, setLoading] = useState(false);

  // Se lee de window y no con useSearchParams para no exigir un boundary de
  // Suspense en esta página (rompía el build de producción).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = Object.keys(AVISOS).find((k) => params.has(k));
    if (key) setNotice(AVISOS[key]);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      const msg = result.code;
      setError(msg && msg !== "credentials" ? msg : "El email o la contraseña no coinciden. Revisa e intenta de nuevo.");
      return;
    }
    // El entrenador no tiene panel de gimnasio: su casa es su día.
    const sesion = await getSession();
    router.push(sesion?.role === "trainer" ? "/entrenador" : "/dashboard");
  }

  return (
    <div>
      <AuthCardHeader title="Ingresa a tu gimnasio" subtitle="Dueños, administradores, recepción y entrenadores entran por aquí." />
      <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
        {notice && !error && <AuthNotice tone={notice.tone}>{notice.text}</AuthNotice>}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && <AuthNotice tone="danger">{error}</AuthNotice>}
        <Button type="submit" size="lg" isLoading={loading} className="w-full">
          Ingresar
        </Button>
      </form>
      <p className="mt-8 text-sm text-ink-muted">
        ¿Tu gimnasio aún no usa FitConnect?{" "}
        <Link href="/register" className="font-medium text-primary-ink hover:underline">
          Crea una cuenta gratis
        </Link>
      </p>
    </div>
  );
}
