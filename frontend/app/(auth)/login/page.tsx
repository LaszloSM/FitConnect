"use client";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";

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
    <GlassCard className="p-8">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Zap className="h-7 w-7 text-orange-500" />
          <span className="text-slate-800 font-bold text-2xl font-display">FitConnect</span>
        </div>
        <p className="text-slate-500 text-sm">Inicia sesión en tu plataforma</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-slate-600 text-sm font-medium">Email</Label>
          <Input id="email" name="email" type="email" required
            className="bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-slate-600 text-sm font-medium">Contraseña</Label>
          <Input id="password" name="password" type="password" required
            className="bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400" />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button type="submit" disabled={loading}
          className="w-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors duration-150">
          {loading ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>
      <p className="mt-5 text-center text-slate-500 text-sm">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="text-orange-500 font-medium hover:underline">Registra tu gym</Link>
      </p>
    </GlassCard>
  );
}
