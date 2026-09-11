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

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";

interface ProfileData {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function ProfileSection() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    current_password: "",
    new_password: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/settings/profile").then((res) => {
      setProfile(res.data);
      setForm((f) => ({
        ...f,
        full_name: res.data.full_name,
        email: res.data.email,
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      const client = apiClient(session.accessToken as string);
      const payload: Record<string, string> = {};
      if (form.full_name !== profile?.full_name) payload.full_name = form.full_name;
      if (form.email !== profile?.email) payload.email = form.email;
      if (form.new_password) {
        payload.current_password = form.current_password;
        payload.new_password = form.new_password;
      }
      const res = await client.patch("/api/v1/settings/profile", payload);
      setProfile(res.data);
      setForm((f) => ({ ...f, current_password: "", new_password: "" }));
      toast.success("Perfil actualizado");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error actualizando perfil");
    } finally {
      setSaving(false);
    }
  };

  const initials = (profile?.full_name ?? "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="h-14 w-14 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] text-lg font-bold flex items-center justify-center shrink-0 select-none">
          {initials}
        </div>
        <div>
          <p className="text-[var(--text-base)] font-semibold">{profile?.full_name ?? "—"}</p>
          <p className="text-[var(--text-muted)] text-sm">{profile?.email ?? "—"}</p>
          {profile?.role && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-[var(--color-primary-muted)] dark:bg-[var(--color-primary)]/30 text-[var(--color-primary-ink)] dark:text-[var(--color-primary-ink)] text-xs rounded-full font-medium capitalize">
              {profile.role}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Nombre completo</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
              className={inputCls}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className={inputCls}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--border-base)]">
          <p className="text-[var(--text-base)] text-sm font-semibold mb-3">Cambiar contraseña</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Contraseña actual</Label>
              <Input
                type="password"
                value={form.current_password}
                onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                placeholder="Requerida para cambiar"
                autoComplete="current-password"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Nueva contraseña</Label>
              <Input
                type="password"
                value={form.new_password}
                onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
