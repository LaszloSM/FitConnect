"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        full_name: form.get("full_name"),
        gym_name: form.get("gym_name"),
        city: form.get("city"),
      }),
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
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-2xl text-white text-center">Registra tu Gym</CardTitle>
        <p className="text-zinc-400 text-center text-sm">Comienza gratis — Plan Básico</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { id: "gym_name", label: "Nombre del Gym", type: "text" },
            { id: "city", label: "Ciudad", type: "text" },
            { id: "full_name", label: "Tu nombre completo", type: "text" },
            { id: "email", label: "Email", type: "email" },
            { id: "password", label: "Contraseña", type: "password" },
          ].map(({ id, label, type }) => (
            <div key={id} className="space-y-2">
              <Label htmlFor={id} className="text-zinc-300">{label}</Label>
              <Input id={id} name={id} type={type} required
                className="bg-zinc-800 border-zinc-700 text-white" />
            </div>
          ))}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full bg-orange-500 hover:bg-orange-600">
            {loading ? "Registrando..." : "Crear cuenta"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
