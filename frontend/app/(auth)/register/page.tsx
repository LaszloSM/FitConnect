"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        setError(data.detail || "Error al registrar");
      } catch {
        setError("Error al registrar. Intenta nuevamente.");
      }
      return;
    }
    router.push("/login?registered=1");
  }

  return (
    <GlassCard className="p-6" glow>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white font-display">Registra tu Gym</h1>
        <p className="text-muted text-sm mt-1">Comienza gratis — Plan Basico</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { id: "gym_name", label: "Nombre del Gym", type: "text" },
          { id: "city", label: "Ciudad", type: "text" },
          { id: "full_name", label: "Tu nombre completo", type: "text" },
          { id: "email", label: "Email", type: "email" },
          { id: "password", label: "Contraseña", type: "password" },
        ].map(({ id, label, type }) => (
          <div key={id} className="space-y-2">
            <Label htmlFor={id} className="text-muted text-sm">{label}</Label>
            <Input id={id} name={id} type={type} required
              className="bg-surface border-border-dark text-white placeholder:text-muted" />
          </div>
        ))}
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" disabled={loading}
          className="w-full bg-primary text-bg-deep font-semibold hover:bg-primary/90">
          {loading ? "Registrando..." : "Crear cuenta"}
        </Button>
      </form>
      <p className="mt-4 text-center text-muted text-sm">
        Ya tienes cuenta?{" "}
        <Link href="/login" className="text-primary hover:underline">Inicia sesion</Link>
      </p>
    </GlassCard>
  );
}
