"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import Link from "next/link";
import { rolLegible } from "@/lib/permissions";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";

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
  const [form, setForm] = useState({ full_name: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/settings/profile").then((res) => {
      setProfile(res.data);
      setForm({ full_name: res.data.full_name });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.patch("/api/v1/settings/profile", { full_name: form.full_name });
      setProfile(res.data);
      toast.success("Perfil actualizado");
    } catch (err: any) {
      toast.error(parseApiError(err, "Error actualizando perfil"));
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
            <span className="mt-1 inline-block rounded-[var(--radius-sm)] bg-primary-muted px-2 py-0.5 text-xs font-semibold text-primary-ink">
              {rolLegible(profile.role) || profile.role}
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
            <Input type="email" value={profile?.email ?? ""} readOnly disabled className={inputCls} />
          </div>
        </div>
        <p className="text-sm text-ink-muted">
          El correo y la contraseña se cambian en{" "}
          <Link href="/settings?tab=security" className="font-medium text-primary-ink hover:underline">Seguridad</Link>,
          con un código de verificación.
        </p>

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
