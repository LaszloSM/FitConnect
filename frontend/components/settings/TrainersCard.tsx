/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { FormDialog, FormField } from "@/components/ui/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useApiResource } from "@/hooks/useApiResource";
import { ArchiveIcon as Archive, DotIcon as Dot, BarbellIcon as Dumbbell, KeyIcon as KeyRound, PencilSimpleIcon as Pencil, PlusIcon as Plus, UserIcon as UserRound } from "@phosphor-icons/react";

interface Trainer {
  id: string;
  full_name: string;
  photo_url: string | null;
  phone: string | null;
  specialty: string | null;
  is_active: boolean;
  classes_count: number;
  /** Cuenta del sistema enlazada, si esta persona además entra al software. */
  staff_id: string | null;
  account_email: string | null;
  account_role: string | null;
}

const emptyForm = { full_name: "", phone: "", specialty: "" };

export function TrainersCard({ onChanged }: { onChanged?: () => void }) {
  const { data: session } = useSession();
  const trainers = useApiResource<Trainer[]>("/api/v1/instructors", []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Trainer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (i: Trainer) => {
    setEditing(i);
    setForm({ full_name: i.full_name, phone: i.phone ?? "", specialty: i.specialty ?? "" });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!session?.accessToken || !form.full_name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone || undefined,
      specialty: form.specialty || undefined,
    };
    try {
      if (editing) {
        await client.put(`/api/v1/instructors/${editing.id}`, payload);
        toast.success("Entrenador actualizado");
      } else {
        await client.post("/api/v1/instructors", payload);
        toast.success("Entrenador creado");
      }
      setDialogOpen(false);
      await trainers.refetch();
      onChanged?.();
    } catch (err: unknown) {
      toast.error(parseApiError(err, "Error guardando entrenador"));
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (i: Trainer) => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.delete(`/api/v1/instructors/${i.id}`);
      toast.success(`${i.full_name} archivado: sus clases conservan el nombre`);
      await trainers.refetch();
      onChanged?.();
    } catch (err: unknown) {
      toast.error(parseApiError(err, "Error archivando"));
    }
  };

  return (
    <GlassCard className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-[var(--color-primary-ink)]" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-base)]">Entrenadores</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Quienes pueden dictar clases. No necesitan cuenta en el software.
            </p>
          </div>
        </div>
        <FormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={editing ? "Editar entrenador" : "Nuevo entrenador"}
          trigger={
            <Button
              onClick={openCreate}
              variant="outline"
              size="sm"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nuevo entrenador
            </Button>
          }
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel={editing ? "Guardar cambios" : "Crear entrenador"}
        >
          <FormField label="Nombre completo" required>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Carlos Pérez"
            />
          </FormField>
          <FormField label="Especialidad" hint="Crossfit, spinning, yoga...">
            <Input
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
            />
          </FormField>
          <FormField label="Teléfono">
            <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          </FormField>
        </FormDialog>
      </div>

      {trainers.loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : trainers.data.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Agrega entrenadores para poder asignarlos a las clases. Si además entran
          al software, invítalos arriba y márcalos como que dictan clases.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {trainers.data.map((i, idx) => (
            <motion.div
              key={i.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(idx * 0.04, 0.3) }}
              className="group rounded-[var(--radius-md)] p-3 bg-muted/60"
            >
              <div className="flex items-start gap-2.5">
                <span className="h-10 w-10 rounded-full bg-muted text-ink flex items-center justify-center text-sm font-bold shrink-0">
                  {i.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-base)] truncate">{i.full_name}</p>
                  {i.specialty && (
                    <p className="text-xs text-[var(--text-muted)] truncate">{i.specialty}</p>
                  )}
                  <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                    <Dumbbell className="h-3 w-3" />
                    {i.classes_count} clase{i.classes_count !== 1 ? "s" : ""}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5 truncate">
                    {i.staff_id ? (
                      <>
                        <KeyRound className="h-3 w-3 shrink-0" />
                        <span className="truncate">{i.account_email}</span>
                      </>
                    ) : (
                      <>
                        <Dot className="h-3 w-3 shrink-0" />
                        Sin cuenta
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(i)}
                    title="Editar"
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)]"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {!i.staff_id && (
                    <button
                      onClick={() => archive(i)}
                      title="Archivar"
                      className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-danger)]"
                    >
                      <Archive className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
