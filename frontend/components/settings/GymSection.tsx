"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { Lock } from "lucide-react";

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";
const readOnlyCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-muted)] cursor-not-allowed opacity-70";

interface GymData {
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  logo_url: string | null;
  plan: string | null;
}

export default function GymSection() {
  const { data: session } = useSession();
  const [gymData, setGymData] = useState<GymData | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    logo_url: "",
  });
  const [saving, setSaving] = useState(false);

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
        logo_url: res.data.logo_url ?? "",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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

  return (
    <GlassCard className="p-6">
      {!isOwner && (
        <div className="flex items-center gap-2 mb-5 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg">
          <Lock className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Solo el propietario puede editar los datos del gimnasio.
          </p>
        </div>
      )}

      {/* Logo preview */}
      {form.logo_url && (
        <div className="mb-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={form.logo_url}
            alt="Logo del gym"
            className="h-12 w-12 rounded-lg object-contain border border-[var(--border-base)] bg-[var(--bg-base)]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <p className="text-[var(--text-muted)] text-xs">Vista previa del logo</p>
        </div>
      )}

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
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              disabled={!isOwner}
              className={isOwner ? inputCls : readOnlyCls}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[var(--text-muted)] text-sm">URL del logo</Label>
          <Input
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            disabled={!isOwner}
            placeholder="https://..."
            className={isOwner ? inputCls : readOnlyCls}
          />
        </div>

        {gymData?.plan && (
          <div className="pt-4 border-t border-[var(--border-base)]">
            <p className="text-[var(--text-muted)] text-xs mb-1">Plan activo</p>
            <span className="inline-flex items-center px-3 py-1 bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 text-xs font-semibold rounded-full capitalize">
              {gymData.plan}
            </span>
          </div>
        )}

        {isOwner && (
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="bg-orange-500 text-white font-semibold hover:bg-orange-600"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        )}
      </form>
    </GlassCard>
  );
}
