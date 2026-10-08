"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCardHeader, AuthNotice } from "@/components/common/AuthCardHeader";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    try {
      await apiClient().post("/api/v1/auth/password/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo enviar. Intenta en un minuto."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AuthCardHeader title="Recupera tu contraseña" subtitle="Te enviamos un enlace al correo para elegir una nueva." />
      {sent ? (
        <AuthNotice tone="ok">
          Si ese correo tiene una cuenta en FitConnect, en unos minutos te llega el enlace. Vence en una hora. Revisa
          también la carpeta de spam.
        </AuthNotice>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          {error && <AuthNotice tone="danger">{error}</AuthNotice>}
          <Button type="submit" size="lg" isLoading={loading} className="w-full">
            Enviar enlace
          </Button>
        </form>
      )}
      <p className="mt-8 text-sm text-ink-muted">
        <Link href="/login" className="font-medium text-primary-ink hover:underline">
          Volver a ingresar
        </Link>
      </p>
    </div>
  );
}
