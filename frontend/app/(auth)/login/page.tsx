"use client";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCardHeader, AuthNotice } from "@/components/common/AuthCardHeader";
import { forgetOfflineData } from "@/lib/offline/logout";
import { MfaChallengeStep, decodeMfaStep, type MfaStep } from "@/components/security/MfaChallengeStep";

// Mensajes que llegan por la URL desde otros flujos.
const AVISOS: Record<string, { tone: "warn" | "ok"; text: string }> = {
  expired: { tone: "warn", text: "Tu sesión se cerró por seguridad. Ingresa de nuevo." },
  registered: { tone: "ok", text: "Tu gimnasio quedó creado. Ingresa con el email y la contraseña que elegiste." },
  invited: { tone: "ok", text: "Tu cuenta quedó activa. Ingresa con tu email y la contraseña nueva." },
  reset: { tone: "ok", text: "Tu contraseña cambió. Ingresa con la nueva." },
};

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<(typeof AVISOS)[string] | null>(null);
  const [loading, setLoading] = useState(false);
  // Segundo paso: el backend pidió verificar con alguno de los métodos activos.
  const [challenge, setChallenge] = useState<MfaStep | null>(null);

  // Se lee de window y no con useSearchParams para no exigir un boundary de
  // Suspense en esta página (rompía el build de producción).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = Object.keys(AVISOS).find((k) => params.has(k));
    if (key) setNotice(AVISOS[key]);
    // Sesión vencida o cerrada en otra pestaña: la copia de socios no se queda en el equipo.
    void forgetOfflineData();
  }, []);

  async function finish() {
    const sesion = await getSession();
    if (sesion?.mfaSetupRequired) {
      router.push("/seguridad/dos-pasos");
      return;
    }
    // El entrenador no tiene panel de gimnasio: su casa es su día.
    router.push(sesion?.role === "trainer" ? "/entrenador" : "/dashboard");
  }

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
      if (msg?.startsWith("mfa:")) {
        setChallenge(decodeMfaStep(msg.slice(4)));
        return;
      }
      setError(msg && msg !== "credentials" ? msg : "El email o la contraseña no coinciden. Revisa e intenta de nuevo.");
      return;
    }
    await finish();
  }

  if (challenge) {
    return (
      <MfaChallengeStep
        step={challenge}
        onDone={finish}
        onBack={(msg) => {
          setChallenge(null);
          setError(msg ?? "");
        }}
      />
    );
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
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link href="/recuperar" className="text-xs text-ink-muted hover:text-ink hover:underline">
              ¿La olvidaste?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && <AuthNotice tone="danger">{error}</AuthNotice>}
        <Button type="submit" size="lg" isLoading={loading} className="w-full">
          Ingresar
        </Button>
      </form>
      <p className="mt-8 text-sm text-ink-muted">
        ¿Tu gimnasio aún no usa LSMFit?{" "}
        <Link href="/register" className="font-medium text-primary-ink hover:underline">
          Crea una cuenta gratis
        </Link>
      </p>
    </div>
  );
}
