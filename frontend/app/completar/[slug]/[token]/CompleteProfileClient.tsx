"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircleIcon as CheckCircle2, SpinnerGapIcon as Loader2, WarningIcon as TriangleAlert } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PARQForm, PARQ_KEYS } from "@/components/common/PARQForm";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";

interface ProfileInfo {
  gym_name: string;
  first_name: string;
  missing: string[];
  labels: Record<string, string>;
  has_photo: boolean;
  image_consent: boolean;
  expires_at: string;
}

const BLOOD = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const selectCls =
  "h-11 w-full rounded-[var(--radius-md)] border border-line bg-field px-3 text-base text-ink";

/**
 * La abre el socio desde el enlace que le mandó su gimnasio por WhatsApp o
 * correo. Solo pregunta lo que falta, nunca muestra lo que ya está registrado.
 */
export default function CompleteProfileClient({ slug, token }: { slug: string; token: string }) {
  const base = `/api/v1/public/profile/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [parq, setParq] = useState<Record<string, boolean>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [acceptData, setAcceptData] = useState(false);
  const [acceptImage, setAcceptImage] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ parq_alert: boolean } | null>(null);

  useEffect(() => {
    apiClient()
      .get<ProfileInfo>(base)
      .then((r) => setInfo(r.data))
      .catch((err) => setLoadError(parseApiError(err, "No pudimos abrir este enlace.")));
  }, [base]);

  const need = (k: string) => info?.missing.includes(k) ?? false;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (need("consent_data") && !acceptData) {
      setError("Para guardar tus datos debes aceptar la política de tratamiento de datos.");
      return;
    }
    if (need("parq") && PARQ_KEYS.some((k) => typeof parq[k] !== "boolean")) {
      setError("Responde las 7 preguntas del cuestionario de salud.");
      return;
    }
    if (photo && !acceptImage && !info?.image_consent) {
      setError("Para usar tu foto marca la autorización de imagen.");
      return;
    }
    setSending(true);
    try {
      const client = apiClient();
      if (photo) {
        const fd = new FormData();
        fd.append("file", photo);
        await client.post(`${base}/photo`, fd, { headers: { "Content-Type": undefined } });
      }
      const body: Record<string, unknown> = { accept_data: acceptData, accept_image: acceptImage || Boolean(photo) };
      for (const [k, v] of Object.entries(form)) if (v.trim()) body[k] = v.trim();
      if (need("parq")) body.parq_answers = parq;
      const { data } = await client.post(base, body);
      setDone({ parq_alert: Boolean(data.parq_alert) });
    } catch (err) {
      setError(parseApiError(err, "No se pudo guardar. Intenta de nuevo o avísale a recepción."));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-dvh bg-surface px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-md space-y-5">
        {!info && !loadError && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        )}

        {loadError && (
          <div className="card space-y-2 p-6 text-center">
            <TriangleAlert className="mx-auto h-8 w-8" style={{ color: "var(--signal-warn)" }} aria-hidden />
            <p className="text-base font-semibold text-ink">{loadError}</p>
          </div>
        )}

        {info && done && (
          <div className="card space-y-3 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: "var(--signal-ok)" }} aria-hidden />
            <p className="text-lg font-semibold text-ink">¡Listo, {info.first_name}!</p>
            <p className="text-sm text-ink-muted">Tu ficha en {info.gym_name} quedó al día. Ya puedes cerrar esta página.</p>
            {done.parq_alert && (
              <p
                className="rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-sm"
                style={{ color: "var(--signal-warn)", background: "var(--signal-warn-bg)", borderColor: "var(--signal-warn-line)" }}
              >
                Respondiste «Sí» en el cuestionario de salud. Antes de entrenar consulta con tu médico y cuéntale a tu
                entrenador.
              </p>
            )}
          </div>
        )}

        {info && !done && (
          <>
            <header className="space-y-1 px-1">
              <p className="text-sm font-medium text-ink-muted">{info.gym_name}</p>
              <h1 className="text-2xl font-bold tracking-tight text-ink">Hola, {info.first_name}</h1>
              <p className="text-sm text-ink-muted">
                Tu gimnasio necesita estos datos para cuidarte mejor. Toma unos 2 minutos.
              </p>
            </header>

            <form onSubmit={submit} className="card space-y-5 p-5">
              {need("id_number") && (
                <div className="space-y-1.5">
                  <Label htmlFor="id_number">Número de documento</Label>
                  <Input id="id_number" inputMode="numeric" autoComplete="off" required maxLength={20} onChange={set("id_number")} />
                </div>
              )}
              {need("phone") && (
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Celular</Label>
                  <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} onChange={set("phone")} />
                </div>
              )}
              {need("email") && (
                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo (opcional)</Label>
                  <Input id="email" type="email" autoComplete="email" maxLength={255} onChange={set("email")} />
                </div>
              )}
              {need("birth_date") && (
                <div className="space-y-1.5">
                  <Label htmlFor="birth_date">Fecha de nacimiento</Label>
                  <Input id="birth_date" type="date" required max={new Date().toISOString().split("T")[0]} onChange={set("birth_date")} />
                </div>
              )}
              {need("address") && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="address">Dirección (opcional)</Label>
                    <Input id="address" autoComplete="street-address" maxLength={500} onChange={set("address")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city">Ciudad (opcional)</Label>
                    <Input id="city" autoComplete="address-level2" maxLength={100} onChange={set("city")} />
                  </div>
                </div>
              )}
              {need("emergency_contact") && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-ink">¿A quién llamamos en una emergencia?</legend>
                  <div className="space-y-1.5">
                    <Label htmlFor="ec_name">Nombre</Label>
                    <Input id="ec_name" required maxLength={255} onChange={set("emergency_contact_name")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ec_phone">Celular</Label>
                    <Input id="ec_phone" type="tel" inputMode="tel" required maxLength={20} onChange={set("emergency_contact_phone")} />
                  </div>
                </fieldset>
              )}
              {(need("eps") || need("blood_type")) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {need("eps") && (
                    <div className="space-y-1.5">
                      <Label htmlFor="eps">EPS (opcional)</Label>
                      <Input id="eps" maxLength={100} onChange={set("eps")} />
                    </div>
                  )}
                  {need("blood_type") && (
                    <div className="space-y-1.5">
                      <Label htmlFor="blood_type">RH (opcional)</Label>
                      <select id="blood_type" className={selectCls} defaultValue="" onChange={set("blood_type")}>
                        <option value="">No sé</option>
                        {BLOOD.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              {need("parq") && <PARQForm value={parq} onChange={setParq} />}

              {!info.has_photo && (
                <div className="space-y-2">
                  <Label htmlFor="photo">Foto para tu ficha (opcional)</Label>
                  <input
                    id="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="user"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
                  />
                  {photo && !info.image_consent && (
                    <label className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-muted">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={acceptImage} onChange={(e) => setAcceptImage(e.target.checked)} />
                      Autorizo a {info.gym_name} a usar esta foto en mi ficha para reconocerme en recepción.
                    </label>
                  )}
                </div>
              )}

              {need("consent_data") && (
                <label className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-muted">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={acceptData} onChange={(e) => setAcceptData(e.target.checked)} />
                  <span>
                    Autorizo a {info.gym_name} a tratar mis datos personales y de salud para gestionar mi membresía, según
                    la{" "}
                    <Link href="/tratamiento-datos" target="_blank" className="font-medium text-primary-ink underline">
                      política de tratamiento de datos
                    </Link>{" "}
                    (Ley 1581 de 2012).
                  </span>
                </label>
              )}

              {error && (
                <p className="text-sm" style={{ color: "var(--signal-danger)" }} role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" isLoading={sending}>
                Guardar mis datos
              </Button>
              <p className="text-center text-xs text-ink-muted">
                Este enlace es personal. Solo agrega lo que falta: lo que ya registró tu gimnasio no se cambia aquí.
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
