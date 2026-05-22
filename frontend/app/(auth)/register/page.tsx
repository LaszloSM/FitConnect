"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";

const registerSchema = z.object({
  gym_name: z.string().min(2, "El nombre del gym debe tener al menos 2 caracteres"),
  full_name: z.string().min(2, "Nombre demasiado corto"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  city: z.string().min(2, "Ciudad demasiado corta"),
});

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const formData = {
      email: form.get("email") as string,
      password: form.get("password") as string,
      full_name: form.get("full_name") as string,
      gym_name: form.get("gym_name") as string,
      city: form.get("city") as string,
    };

    const validation = registerSchema.safeParse(formData);
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      setLoading(false);
      return;
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    setLoading(false);
    if (!res.ok) {
      try {
        const data = await res.json();
        const detail = data.detail;
        setError(typeof detail === "string" ? detail : JSON.stringify(detail));
      } catch {
        setError("Error al registrar. Intenta nuevamente.");
      }
      return;
    }
    router.push("/login?registered=1");
  }

  return (
    <GlassCard className="p-8">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Zap className="h-7 w-7 text-orange-500" />
          <span className="text-slate-800 font-bold text-2xl font-display">FitConnect</span>
        </div>
        <p className="text-slate-500 text-sm">Comienza gratis — Plan Básico</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        {[
          { id: "gym_name", label: "Nombre del Gym", type: "text" },
          { id: "city", label: "Ciudad", type: "text" },
          { id: "full_name", label: "Tu nombre completo", type: "text" },
          { id: "email", label: "Email", type: "email" },
          { id: "password", label: "Contraseña", type: "password" },
        ].map(({ id, label, type }) => (
          <div key={id} className="space-y-1.5">
            <Label htmlFor={id} className="text-slate-600 text-sm font-medium">{label}</Label>
            <Input id={id} name={id} type={type} required
              className="bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400" />
          </div>
        ))}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button type="submit" disabled={loading}
          className="w-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors duration-150">
          {loading ? "Registrando..." : "Crear cuenta"}
        </Button>
      </form>
      <p className="mt-5 text-center text-slate-500 text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-orange-500 font-medium hover:underline">Inicia sesión</Link>
      </p>
    </GlassCard>
  );
}
