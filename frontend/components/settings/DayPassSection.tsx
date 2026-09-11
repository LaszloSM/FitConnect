/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Switch } from "@/components/ui/switch";
import { FormDialog, FormField } from "@/components/ui/form-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { Archive, Dumbbell, Pencil, Plus, Ticket } from "lucide-react";

interface PassType {
  id: string;
  name: string;
  price: number;
  includes_trainer: boolean;
  is_active: boolean;
  sort_order: number;
}

const EMPTY = { name: "", price: 0, includes_trainer: false, is_active: true };

export default function DayPassSection() {
  const { data: session } = useSession();
  const types = useApiResource<PassType[]>("/api/v1/day-passes/types?include_inactive=true", []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PassType | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const client = () => apiClient(session?.accessToken as string);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (t: PassType) => {
    setEditing(t);
    setForm({ name: t.name, price: Number(t.price), includes_trainer: t.includes_trainer, is_active: t.is_active });
    setOpen(true);
  };

  const save = async () => {
    if (!session?.accessToken) return;
    if (!form.name.trim() || form.price <= 0) {
      toast.error("Nombre y precio son obligatorios");
      return;
    }
    setSaving(true);
    try {
      if (editing) await client().put(`/api/v1/day-passes/types/${editing.id}`, form);
      else await client().post("/api/v1/day-passes/types", form);
      toast.success(editing ? "Tipo de pase actualizado" : "Tipo de pase creado");
      setOpen(false);
      await types.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (t: PassType) => {
    if (!session?.accessToken) return;
    try {
      await client().delete(`/api/v1/day-passes/types/${t.id}`);
      toast.success(`"${t.name}" archivado`);
      await types.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error archivando");
    }
  };

  const columns: DataTableColumn<PassType>[] = [
    {
      key: "name",
      header: "Pase",
      cell: (t) => (
        <span className="font-medium text-[var(--text-base)] flex items-center gap-2">
          {t.includes_trainer && <Dumbbell className="h-3.5 w-3.5 text-[var(--color-primary-ink)]" />}
          {t.name}
        </span>
      ),
    },
    {
      key: "trainer",
      header: "Entrenador",
      hideOnMobile: true,
      cell: (t) => <span className="text-[var(--text-muted)] text-sm">{t.includes_trainer ? "Incluido" : "No"}</span>,
    },
    {
      key: "price",
      header: "Precio",
      cell: (t) => <span className="font-mono font-semibold text-[var(--text-base)]">{formatCOP(t.price)}</span>,
    },
    {
      key: "status",
      header: "Estado",
      cell: (t) => <StatusBadge status={t.is_active ? "active" : "inactive"} label={t.is_active ? "Activo" : "Archivado"} />,
    },
    {
      key: "actions",
      header: "",
      cell: (t) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            title="Editar"
            onClick={() => openEdit(t)}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {t.is_active && (
            <button
              type="button"
              title="Archivar"
              onClick={() => archive(t)}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <GlassCard className="p-6 space-y-4">
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Editar tipo de pase" : "Nuevo tipo de pase"}
        description="Lo que puede comprar quien viene por un día: valor y si incluye entrenador."
        onSubmit={save}
        submitting={saving}
      >
        <FormField label="Nombre" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pase del día" autoFocus />
        </FormField>
        <FormField label="Precio" required>
          <CurrencyInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
        </FormField>
        <Switch
          checked={form.includes_trainer}
          onCheckedChange={(v) => setForm({ ...form, includes_trainer: v })}
          label="Incluye entrenador"
        />
        {editing && (
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            label="Activo (visible al vender)"
          />
        )}
      </FormDialog>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <Ticket className="h-4 w-4 text-[var(--color-primary-ink)] mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-base)]">Tipos de pase del día</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Para quien entrena un día sin membresía. Se venden en Caja › Pase del día y dan acceso todo el día con la cédula.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)] h-8 text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo tipo
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={types.data}
        rowKey={(t) => t.id}
        loading={types.loading}
        emptyTitle="Sin tipos de pase"
        emptyDescription='Crea "Pase del día" y "Pase con entrenador" para empezar a venderlos'
        emptyAction={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Crear el primero
          </Button>
        }
      />
    </GlassCard>
  );
}
