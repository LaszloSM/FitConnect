"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { CityCombobox } from "@/components/ui/city-combobox";
import { CountrySelect } from "@/components/ui/country-select";
import { AuthCardHeader, AuthNotice } from "@/components/common/AuthCardHeader";

const registerSchema = z
  .object({
    gym_name: z.string().min(2, "El nombre del gimnasio debe tener al menos 2 caracteres"),
    full_name: z.string().min(2, "Escribe tu nombre completo"),
    email: z.string().email("Revisa el email: parece incompleto"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirm_password: z.string(),
    city: z.string().min(2, "Elige o escribe la ciudad del gimnasio"),
    country: z.string().min(2).max(2),
    phone: z.string().max(50, "Teléfono demasiado largo").optional(),
    terms_accepted: z.boolean().refine((v) => v, "Para crear la cuenta debes aceptar los términos y las políticas"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Las contraseñas no coinciden",
    path: ["confirm_password"],
  });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // La línea va en el contenedor: un borde en el <fieldset> hace que la
    // leyenda se monte sobre él.
    <div className="border-t border-line pt-6">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-4 p-0 text-base font-semibold tracking-tight text-ink">{title}</legend>
        <div className="space-y-4">{children}</div>
      </fieldset>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("CO");
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
      city,
      country,
      phone: phone || undefined,
      terms_accepted: termsAccepted,
    };

    const validation = registerSchema.safeParse(formData);
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          gym_name: formData.gym_name,
          city: formData.city,
          country: formData.country,
          phone: formData.phone,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.detail;
        setError(typeof detail === "string" ? detail : "No pudimos crear la cuenta. Revisa los datos e intenta de nuevo.");
        return;
      }
      router.push("/login?registered=1");
    } catch {
      setError("No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AuthCardHeader title="Crea la cuenta de tu gimnasio" subtitle="30 días gratis, sin tarjeta. Luego importas tus socios desde Excel." />
      <form onSubmit={handleSubmit} className="space-y-8">
        <Section title="Tu gimnasio">
          <div className="space-y-1.5">
            <Label htmlFor="gym_name">Nombre del gimnasio</Label>
            <Input id="gym_name" name="gym_name" type="text" autoComplete="organization" required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="city">Ciudad</Label>
              <CityCombobox id="city" value={city} onChange={setCity} />
            </div>
            <div className="space-y-1.5">
              <Label>País</Label>
              <CountrySelect value={country} onChange={(v) => setCountry(v || "CO")} />
            </div>
          </div>
        </Section>

        <Section title="Tu cuenta">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Tu nombre completo</Label>
            <Input id="full_name" name="full_name" type="text" autoComplete="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <Label>
              Teléfono <span className="font-normal text-ink-muted">(opcional)</span>
            </Label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>
          <div className="space-y-1.5">
            <Label>Contraseña</Label>
            <PasswordInput
              showStrength
              value={password}
              onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
              autoComplete="new-password"
              required
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirma la contraseña</Label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
              autoComplete="new-password"
              required
            />
          </div>
        </Section>

        <label className="flex cursor-pointer select-none items-start gap-3">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-line accent-[var(--color-primary)]"
          />
          <span className="text-sm text-ink-muted">
            Acepto los{" "}
            <Link href="/terminos" target="_blank" className="font-medium text-primary-ink hover:underline">términos de servicio</Link>
            , la{" "}
            <Link href="/privacidad" target="_blank" className="font-medium text-primary-ink hover:underline">política de privacidad</Link>
            {" "}y la{" "}
            <Link href="/tratamiento-datos" target="_blank" className="font-medium text-primary-ink hover:underline">política de tratamiento de datos</Link>.
          </span>
        </label>

        {error && <AuthNotice tone="danger">{error}</AuthNotice>}
        <Button type="submit" size="lg" isLoading={loading} className="w-full">
          Crear cuenta
        </Button>
      </form>
      <p className="mt-8 text-sm text-ink-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary-ink hover:underline">Ingresa</Link>
      </p>
    </div>
  );
}
