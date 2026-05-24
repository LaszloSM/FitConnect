"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Zap } from "lucide-react";

const registerSchema = z
  .object({
    gym_name: z.string().min(2, "El nombre del gym debe tener al menos 2 caracteres"),
    full_name: z.string().min(2, "Nombre demasiado corto"),
    email: z.string().email("Email inválido"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirm_password: z.string(),
    city: z.string().min(2, "Ciudad demasiado corta"),
    phone: z.string().optional(),
    terms_accepted: z.boolean().refine((v) => v, "Debes aceptar los términos de servicio"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Las contraseñas no coinciden",
    path: ["confirm_password"],
  });

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const formData = {
      email: form.get("email") as string,
      password,
      confirm_password: confirmPassword,
      full_name: form.get("full_name") as string,
      gym_name: form.get("gym_name") as string,
      city: form.get("city") as string,
      phone: phone || undefined,
      terms_accepted: termsAccepted,
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
      body: JSON.stringify({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        gym_name: formData.gym_name,
        city: formData.city,
        phone: formData.phone,
      }),
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
        {/* Gym name */}
        <div className="space-y-1.5">
          <Label htmlFor="gym_name" className="text-slate-600 text-sm font-medium">Nombre del Gym</Label>
          <Input
            id="gym_name"
            name="gym_name"
            type="text"
            required
            className="bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400"
          />
        </div>

        {/* City */}
        <div className="space-y-1.5">
          <Label htmlFor="city" className="text-slate-600 text-sm font-medium">Ciudad</Label>
          <Input
            id="city"
            name="city"
            type="text"
            required
            className="bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400"
          />
        </div>

        {/* Full name */}
        <div className="space-y-1.5">
          <Label htmlFor="full_name" className="text-slate-600 text-sm font-medium">Tu nombre completo</Label>
          <Input
            id="full_name"
            name="full_name"
            type="text"
            required
            className="bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400"
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-slate-600 text-sm font-medium">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            className="bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400"
          />
        </div>

        {/* Phone (optional) */}
        <div className="space-y-1.5">
          <Label className="text-slate-600 text-sm font-medium">Teléfono (opcional)</Label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>

        {/* Password with strength */}
        <div className="space-y-1.5">
          <Label className="text-slate-600 text-sm font-medium">Contraseña</Label>
          <PasswordInput
            showStrength
            value={password}
            onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
            required
            placeholder="Mínimo 8 caracteres"
          />
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <Label className="text-slate-600 text-sm font-medium">Confirmar contraseña</Label>
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
            required
            placeholder="Repite tu contraseña"
          />
        </div>

        {/* Terms */}
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-orange-500"
          />
          <span className="text-sm text-slate-500">
            Acepto los{" "}
            <a href="#" className="text-orange-500 hover:underline font-medium">términos de servicio</a>
            {" "}y la{" "}
            <a href="#" className="text-orange-500 hover:underline font-medium">política de privacidad</a>
          </span>
        </label>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors duration-150"
        >
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
