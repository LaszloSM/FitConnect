"use client";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCardHeader } from "@/components/common/AuthCardHeader";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // Se lee de window y no con useSearchParams para no exigir un boundary de
  // Suspense en esta página (rompía el build de producción).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("expired")) {
      setNotice("Tu sesión se cerró por seguridad. Ingresa de nuevo.");
    }
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
      setError(
        msg && msg !== "credentials"
          ? msg
          : "Email o contraseña incorrectos"
      );
      return;
    }
    // El entrenador no tiene panel de gimnasio: su casa es su día.
    const sesion = await getSession();
    const rol = sesion?.role;
    router.push(rol === "trainer" ? "/entrenador" : "/dashboard");
  }

  return (
    <div className="rounded-2xl bg-white p-8 shadow-[0_20px_60px_-10px_rgb(0_0_0/0.5)]">
      <AuthCardHeader title="Inicia sesión" subtitle="Accede a tu plataforma de gestión" />
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-slate-600 text-sm font-medium">Email</Label>
          <Input id="email" name="email" type="email" required
            className="bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-slate-600 text-sm font-medium">Contraseña</Label>
          <Input id="password" name="password" type="password" required
            className="bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
        </div>
        {notice && !error && (
          <p className="text-sm rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-amber-700 dark:text-amber-300">{notice}</p>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button type="submit" disabled={loading}
          className="w-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)] transition-colors duration-150">
          {loading ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>
      <p className="mt-5 text-center text-slate-500 text-sm">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="text-lime-700 font-semibold hover:underline">Registra tu gym</Link>
      </p>
    </div>
  );
}
