"use client";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      // result.error is always "CredentialsSignin" for credentials provider in NextAuth v5
      // result.code carries the message from BackendAuthError.code
      const msg = result.code;
      setError(
        msg && msg !== "credentials"
          ? msg
          : "Email o contraseña incorrectos"
      );
      return;
    }
    router.push("/dashboard");
  }

  return (
    <GlassCard className="p-6" glow>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white font-display">SaaS Gym</h1>
        <p className="text-muted text-sm mt-1">Inicia sesion en tu plataforma</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-muted text-sm">Email</Label>
          <Input id="email" name="email" type="email" required
            className="bg-surface border-border-dark text-white placeholder:text-muted" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-muted text-sm">Contraseña</Label>
          <Input id="password" name="password" type="password" required
            className="bg-surface border-border-dark text-white placeholder:text-muted" />
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" disabled={loading}
          className="w-full bg-primary text-bg-deep font-semibold hover:bg-primary/90">
          {loading ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>
      <p className="mt-4 text-center text-muted text-sm">
        No tienes cuenta?{" "}
        <Link href="/register" className="text-primary hover:underline">Registra tu gym</Link>
      </p>
    </GlassCard>
  );
}
