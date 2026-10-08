"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCardHeader, AuthNotice } from "@/components/common/AuthCardHeader";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Se lee de window para no exigir un boundary de Suspense (como en /login).
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== form.get("confirm")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiClient().post("/api/v1/auth/password/reset", { token, password });
      router.push("/login?reset=1");
    } catch (err) {
      setError(parseApiError(err, "No se pudo cambiar la contraseña."));
      setLoading(false);
    }
  }

  return (
    <div>
      <AuthCardHeader title="Elige una contraseña nueva" subtitle="Mínimo 8 caracteres. Mejor si es una frase que solo tú conozcas." />
      {token === null || token === "" ? (
        <AuthNotice tone="warn">
          Este enlace está incompleto. <Link href="/recuperar" className="underline">Pide uno nuevo</Link>.
        </AuthNotice>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña nueva</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Repítela</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
          </div>
          {error && (
            <AuthNotice tone="danger">
              {error}{" "}
              {error.includes("venció") && (
                <Link href="/recuperar" className="underline">
                  Pedir otro enlace
                </Link>
              )}
            </AuthNotice>
          )}
          <Button type="submit" size="lg" isLoading={loading} className="w-full" disabled={!token}>
            Guardar contraseña
          </Button>
        </form>
      )}
    </div>
  );
}
