"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog, FormField } from "@/components/ui/form-dialog";
import { apiClient } from "@/lib/api";
import { useApiResource } from "@/hooks/useApiResource";
import { Copy, Users, UserPlus, UserMinus, UserCheck } from "lucide-react";

type Role = "owner" | "admin" | "receptionist";

interface Staff {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

const ROLE_META: Record<Role, { label: string; tone: StatusTone }> = {
  owner: { label: "Dueño", tone: "violet" },
  admin: { label: "Administrador", tone: "info" },
  receptionist: { label: "Recepcionista", tone: "neutral" },
};

const ASSIGNABLE_ROLES: Exclude<Role, "owner">[] = ["admin", "receptionist"];

const renderRoleValue = (v: Role | null) => (v ? ROLE_META[v]?.label ?? v : "Rol");

export default function TeamSection() {
  const { data: session } = useSession();
  // include_inactive: desactivar a alguien por error lo hacía desaparecer sin
  // forma de recuperarlo. Ahora sigue en la lista, apagado y reactivable.
  const staff = useApiResource<Staff[]>("/api/v1/users?include_inactive=true", []);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("receptionist");
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<{ name: string; url: string } | null>(null);

  const [toRemove, setToRemove] = useState<Staff | null>(null);
  const [removing, setRemoving] = useState(false);

  const sendInvite = async () => {
    if (!session?.accessToken || !email.trim() || !fullName.trim()) return;
    setInviting(true);
    try {
      const client = apiClient(session.accessToken as string);
      const { data } = await client.post("/api/v1/users/invite", {
        email: email.trim(),
        full_name: fullName.trim(),
        role,
      });
      setInviteUrl({ name: data.full_name, url: data.invite_url });
      setEmail("");
      setFullName("");
      setRole("receptionist");
      setInviteOpen(false);
      await staff.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error enviando la invitación");
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (member: Staff, newRole: string) => {
    if (!session?.accessToken || newRole === member.role) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.patch(`/api/v1/users/${member.id}/role`, { role: newRole });
      toast.success(`Rol de ${member.full_name} actualizado`);
      await staff.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error cambiando el rol");
    }
  };

  const deactivate = async () => {
    if (!session?.accessToken || !toRemove) return;
    setRemoving(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.delete(`/api/v1/users/${toRemove.id}`);
      toast.success(`${toRemove.full_name} ya no tiene acceso`);
      setToRemove(null);
      await staff.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error desactivando");
    } finally {
      setRemoving(false);
    }
  };

  const reactivate = async (member: Staff) => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.post(`/api/v1/users/${member.id}/reactivate`);
      toast.success(`${member.full_name} recuperó el acceso`);
      await staff.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error reactivando");
    }
  };

  const copyUrl = () => {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl.url);
    toast.success("Enlace copiado — compártelo con la persona invitada");
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-base)] flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--color-primary)]" />
              Equipo
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Invita a tu personal y asigna su rol. El administrador gestiona el gym; el
              recepcionista solo opera check-in y cobros del día.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]"
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Invitar
          </Button>
        </div>

        {inviteUrl && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Invitación para {inviteUrl.name} — válida 48 horas
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate text-xs bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2 text-[var(--text-base)]">
                {inviteUrl.url}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyUrl}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copiar
              </Button>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Compártelo por WhatsApp o correo. La persona fija su contraseña al abrirlo; el
              usuario no existe hasta que acepta.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {staff.loading ? (
            <div className="skeleton h-14 rounded-xl" />
          ) : staff.data.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Aún no hay personal registrado.</p>
          ) : (
            staff.data.map((m) => {
              const isOwner = m.role === "owner";
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-4 py-3"
                >
                  <div className={`flex-1 min-w-0 ${m.is_active ? "" : "opacity-60"}`}>
                    <p className="text-sm font-medium text-[var(--text-base)] truncate">
                      {m.full_name}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{m.email}</p>
                  </div>
                  {!m.is_active ? (
                    <>
                      <StatusBadge status="inactive" label="Sin acceso" tone="neutral" />
                      <Button type="button" variant="outline" size="sm" onClick={() => reactivate(m)}>
                        <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                        Reactivar
                      </Button>
                    </>
                  ) : isOwner ? (
                    <StatusBadge status="owner" label={ROLE_META.owner.label} tone={ROLE_META.owner.tone} />
                  ) : (
                    <Select value={m.role} onValueChange={(v) => changeRole(m, v as string)}>
                      <SelectTrigger size="sm" className="w-40">
                        <SelectValue>{renderRoleValue}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_META[r].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!isOwner && m.is_active && (
                    <button
                      onClick={() => setToRemove(m)}
                      title="Quitar acceso"
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </GlassCard>

      <FormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invitar al equipo"
        description="Genera un enlace de invitación de un solo uso."
        onSubmit={sendInvite}
        submitLabel={inviting ? "Generando..." : "Generar enlace"}
        submitting={inviting}
        submitDisabled={!email.trim() || !fullName.trim()}
      >
        <FormField label="Nombre completo" required>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="María Gómez"
          />
        </FormField>
        <FormField label="Correo" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maria@gimnasio.co"
          />
        </FormField>
        <FormField label="Rol" required hint="El rol owner no se puede invitar.">
          <Select value={role} onValueChange={(v) => setRole(v as Exclude<Role, "owner">)}>
            <SelectTrigger className="w-full">
              <SelectValue>{renderRoleValue}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_META[r].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormDialog>

      <FormDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Quitar acceso"
        description={
          toRemove
            ? `${toRemove.full_name} dejará de poder ingresar al sistema. Queda en la lista como "Sin acceso" y puedes reactivarlo cuando quieras.`
            : ""
        }
        onSubmit={deactivate}
        submitLabel="Quitar acceso"
        submitting={removing}
        destructive
      >
        <p className="text-sm text-[var(--text-muted)]">Esta acción desactiva la cuenta del usuario.</p>
      </FormDialog>
    </div>
  );
}
