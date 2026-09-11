"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import { CityCombobox } from "@/components/ui/city-combobox";
import { CountrySelect } from "@/components/ui/country-select";
import { apiClient } from "@/lib/api";
import { ImageIcon, Loader2, Lock, Upload } from "lucide-react";

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";
const readOnlyCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-muted)] cursor-not-allowed opacity-70";

interface GymData {
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  logo_url: string | null;
  plan: string | null;
  operating_hours?: OperatingHours;
}

interface DaySchedule {
  active: boolean;
  open: string;
  close: string;
}

interface OperatingHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

const DAY_KEYS: { key: keyof OperatingHours; label: string }[] = [
  { key: "monday",    label: "Lunes" },
  { key: "tuesday",   label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday",  label: "Jueves" },
  { key: "friday",    label: "Viernes" },
  { key: "saturday",  label: "Sábado" },
  { key: "sunday",    label: "Domingo" },
];

const DEFAULT_HOURS: OperatingHours = {
  monday:    { active: true,  open: "06:00", close: "22:00" },
  tuesday:   { active: true,  open: "06:00", close: "22:00" },
  wednesday: { active: true,  open: "06:00", close: "22:00" },
  thursday:  { active: true,  open: "06:00", close: "22:00" },
  friday:    { active: true,  open: "06:00", close: "22:00" },
  saturday:  { active: true,  open: "08:00", close: "18:00" },
  sunday:    { active: false, open: "08:00", close: "14:00" },
};

export default function GymSection() {
  const { data: session } = useSession();
  const [gymData, setGymData] = useState<GymData | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    country: "CO",
    logo_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(DEFAULT_HOURS);
  const [savingHours, setSavingHours] = useState(false);

  const isOwner = (session as any)?.role === "owner" || (session?.user as any)?.role === "owner";

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/settings/gym").then((res) => {
      setGymData(res.data);
      setForm({
        name:     res.data.name ?? "",
        phone:    res.data.phone ?? "",
        address:  res.data.address ?? "",
        city:     res.data.city ?? "",
        country:  res.data.country ?? "CO",
        logo_url: res.data.logo_url ?? "",
      });
      if (res.data.operating_hours) {
        setOperatingHours({ ...DEFAULT_HOURS, ...res.data.operating_hours });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.patch("/api/v1/settings/gym", {
        name:     form.name || undefined,
        phone:    form.phone || undefined,
        address:  form.address || undefined,
        city:     form.city || undefined,
        country:  form.country || undefined,
        logo_url: form.logo_url || undefined,
      });
      setGymData(res.data);
      toast.success("Datos del gym actualizados");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error actualizando gym");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!session?.accessToken) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const client = apiClient(session.accessToken as string);
      const res = await client.post("/api/v1/settings/gym/logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({ ...f, logo_url: res.data.logo_url ?? "" }));
      setGymData(res.data);
      toast.success("Logo actualizado");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error subiendo el logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveHours = async () => {
    if (!session?.accessToken) return;
    setSavingHours(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.patch("/api/v1/settings/gym", { operating_hours: operatingHours });
      toast.success("Horarios de atención guardados");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error guardando horarios");
    } finally {
      setSavingHours(false);
    }
  };

  const updateDay = (key: keyof OperatingHours, field: keyof DaySchedule, value: string | boolean) => {
    setOperatingHours((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  return (
    <GlassCard className="p-6 space-y-8">
      {!isOwner && (
        <div className="flex items-center gap-2 mb-5 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg">
          <Lock className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Solo el propietario puede editar los datos del gimnasio.
          </p>
        </div>
      )}

      {/* Logo del gym: se sube como imagen, aparece en el panel y los reportes */}
      <div className="flex items-center gap-4 flex-wrap">
        {form.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.logo_url}
            alt="Logo del gym"
            className="h-16 w-16 rounded-xl object-contain border border-[var(--border-base)] bg-white p-1"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span className="h-16 w-16 rounded-xl border border-dashed border-[var(--border-base)] bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-muted)]">
            <ImageIcon className="h-6 w-6" />
          </span>
        )}
        <div className="space-y-1.5">
          {isOwner && (
            <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)] text-sm font-medium text-[var(--text-base)] hover:border-[var(--color-primary)] transition-colors cursor-pointer">
              {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {form.logo_url ? "Cambiar logo" : "Subir logo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadingLogo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadLogo(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            JPG, PNG o WEBP · máx 2MB. Se usa en el panel y en los reportes PDF/Excel.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Nombre del gym</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!isOwner}
              required
              className={isOwner ? inputCls : readOnlyCls}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Teléfono</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              disabled={!isOwner}
              className={isOwner ? inputCls : readOnlyCls}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Dirección</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              disabled={!isOwner}
              className={isOwner ? inputCls : readOnlyCls}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Ciudad</Label>
            {isOwner ? (
              <CityCombobox value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            ) : (
              <Input value={form.city} disabled className={readOnlyCls} />
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">País</Label>
            {isOwner ? (
              <CountrySelect value={form.country} onChange={(v) => setForm({ ...form, country: v || "CO" })} />
            ) : (
              <Input value={form.country} disabled className={readOnlyCls} />
            )}
          </div>
        </div>

        {isOwner && (
          <details className="text-sm">
            <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors">
              Avanzado: usar una URL externa para el logo
            </summary>
            <div className="mt-2">
              <Input
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                placeholder="https://..."
                className={inputCls}
              />
            </div>
          </details>
        )}

        {gymData?.plan && (
          <div className="pt-4 border-t border-[var(--border-base)]">
            <p className="text-[var(--text-muted)] text-xs mb-1">Plan activo</p>
            <span className="inline-flex items-center px-3 py-1 bg-[var(--color-primary-muted)] dark:bg-[var(--color-primary)]/30 text-[var(--color-primary-ink)] dark:text-[var(--color-primary-ink)] text-xs font-semibold rounded-full capitalize">
              {gymData.plan}
            </span>
          </div>
        )}

        {isOwner && (
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        )}
      </form>

      {/* Operating Hours Section */}
      <div className="pt-6 border-t border-[var(--border-base)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-base)]">Horarios de atención</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Configura los horarios de apertura y cierre del gimnasio</p>
          </div>
        </div>

        <div className="space-y-3">
          {DAY_KEYS.map(({ key, label }) => {
            const day = operatingHours[key];
            return (
              <div
                key={key}
                className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)]"
              >
                <Switch
                  checked={day.active}
                  onCheckedChange={(v) => updateDay(key, "active", v)}
                  disabled={!isOwner}
                />
                <span className="w-24 text-sm font-medium text-[var(--text-base)] shrink-0">{label}</span>
                {day.active ? (
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex-1 min-w-0">
                      <TimePicker
                        value={day.open}
                        onChange={(t) => updateDay(key, "open", t)}
                        placeholder="Apertura"
                      />
                    </div>
                    <span className="text-[var(--text-muted)] text-xs shrink-0">a</span>
                    <div className="flex-1 min-w-0">
                      <TimePicker
                        value={day.close}
                        onChange={(t) => updateDay(key, "close", t)}
                        placeholder="Cierre"
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-[var(--text-muted)] text-sm flex-1">Cerrado</span>
                )}
              </div>
            );
          })}
        </div>

        {isOwner && (
          <div className="flex justify-end mt-4">
            <Button
              type="button"
              onClick={handleSaveHours}
              disabled={savingHours}
            >
              {savingHours ? "Guardando..." : "Guardar horarios"}
            </Button>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
