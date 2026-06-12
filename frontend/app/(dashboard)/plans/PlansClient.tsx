/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { apiClient } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import * as PricingCard from "@/components/ui/pricing-card";
import {
  Plus,
  Pencil,
  Trash2,
  Tag,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";

const planSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  price: z.number().min(0, "Precio inválido"),
  duration_days: z.number().int().min(1, "Duración inválida"),
  description: z.string().optional(),
  is_active: z.boolean(),
});

type PlanForm = z.infer<typeof planSchema>;

interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  description?: string;
  is_active: boolean;
}

const DURATION_PRESETS = [
  { label: "15 días", value: 15 },
  { label: "1 mes", value: 30 },
  { label: "2 meses", value: 60 },
  { label: "3 meses", value: 90 },
  { label: "6 meses", value: 180 },
  { label: "1 año", value: 365 },
];

function durationLabel(days: number) {
  if (days === 15) return "15 días";
  if (days === 30) return "1 mes";
  if (days === 60) return "2 meses";
  if (days === 90) return "3 meses";
  if (days === 180) return "6 meses";
  if (days === 365) return "1 año";
  return `${days} días`;
}

function perMonthPrice(price: number, days: number) {
  const perMonth = (price / days) * 30;
  return formatCOP(Math.round(perMonth));
}

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

interface PlanCardItemProps {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
}

function PlanCardItem({ plan, onEdit, onDelete }: PlanCardItemProps) {
  const duration = durationLabel(plan.duration_days);
  const features = [
    `Acceso por ${duration}`,
    ...(plan.description ? [plan.description] : []),
  ];

  return (
    <motion.div
      variants={cardVariants}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className="flex"
    >
      <PricingCard.Card className="max-w-none w-full flex flex-col">
        <PricingCard.Header>
          {/* Plan name + status badge */}
          <PricingCard.Plan>
            <PricingCard.PlanName>
              <Tag className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="text-[var(--text-base)] font-semibold">{plan.name}</span>
            </PricingCard.PlanName>
            {plan.is_active ? (
              <PricingCard.Badge>Activo</PricingCard.Badge>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-base)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                <XCircle className="h-3 w-3" />
                Inactivo
              </span>
            )}
          </PricingCard.Plan>

          {/* Price */}
          <PricingCard.Price>
            <PricingCard.MainPrice>{formatCOP(plan.price)}</PricingCard.MainPrice>
          </PricingCard.Price>

          <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] mb-3">
            <Clock className="h-3 w-3" />
            {duration}
            {plan.duration_days !== 30 && (
              <span className="ml-1 opacity-60">
                · {perMonthPrice(plan.price, plan.duration_days)}/mes aprox.
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onEdit(plan)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            <button
              onClick={() => onDelete(plan)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 border border-transparent hover:border-red-200 dark:hover:border-red-900/40 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          </div>
        </PricingCard.Header>

        {/* Features */}
        <PricingCard.Body>
          <PricingCard.List>
            {features.map((feature) => (
              <PricingCard.ListItem key={feature}>
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-primary)] shrink-0 mt-0.5" />
                <span>{feature}</span>
              </PricingCard.ListItem>
            ))}
          </PricingCard.List>
        </PricingCard.Body>
      </PricingCard.Card>
    </motion.div>
  );
}

const emptyForm: PlanForm = {
  name: "",
  price: 0,
  duration_days: 30,
  description: "",
  is_active: true,
};

export default function PlansClient() {
  const { data: session } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof PlanForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPlans = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/member-plans/");
      setPlans(res.data);
    } catch {
      toast.error("Error cargando planes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.accessToken) fetchPlans();
  }, [session]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      price: plan.price,
      duration_days: plan.duration_days,
      description: plan.description ?? "",
      is_active: plan.is_active,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = planSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof PlanForm, string>> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof PlanForm;
        fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setSaving(true);
    const client = apiClient(session!.accessToken as string);
    try {
      if (editing) {
        await client.put(`/api/v1/member-plans/${editing.id}`, result.data);
        toast.success("Plan actualizado");
      } else {
        await client.post("/api/v1/member-plans/", result.data);
        toast.success("Plan creado");
      }
      setDialogOpen(false);
      fetchPlans();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error guardando plan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !session?.accessToken) return;
    setDeleting(true);
    const client = apiClient(session.accessToken as string);
    try {
      const res = await client.delete(`/api/v1/member-plans/${deleteTarget.id}`);
      // El backend archiva (soft-delete) si el plan tiene membresías asociadas
      if (res.data?.archived) {
        toast.success("Plan archivado: tiene membresías asociadas y se conservan los cobros");
      } else {
        toast.success("Plan eliminado");
      }
      setDeleteTarget(null);
      fetchPlans();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error eliminando plan");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <div className="flex items-start justify-between">
        <PageHeader
          module="plans"
          title="Planes de membresía"
          subtitle="Crea y gestiona los planes disponibles para tus miembros"
        />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={
            <Button
              onClick={openCreate}
              className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:opacity-90 transition-opacity shrink-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo plan
            </Button>
          } />
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar plan" : "Nuevo plan"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Nombre del plan</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Mensual, Trimestral..."
                  className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]"
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Precio (COP)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.price || ""}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    placeholder="90000"
                    className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]"
                  />
                  {errors.price && <p className="text-xs text-red-500">{errors.price}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Duración</Label>
                  <select
                    value={form.duration_days}
                    onChange={(e) => setForm({ ...form, duration_days: Number(e.target.value) })}
                    className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-1 text-sm text-[var(--text-base)]"
                  >
                    {DURATION_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {form.price > 0 && (
                <p className="text-xs text-[var(--text-muted)] -mt-1">
                  ≈ {perMonthPrice(form.price, form.duration_days)} / mes
                </p>
              )}

              <div className="space-y-1.5">
                <Label>Descripción (opcional)</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Acceso ilimitado, clases incluidas..."
                  rows={2}
                  className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_active}
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2",
                    form.is_active ? "bg-[var(--color-primary)]" : "bg-[var(--bg-muted)] border border-[var(--border-base)]"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200",
                      form.is_active ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
                <Label
                  className="cursor-pointer"
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                >
                  Plan activo
                </Label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                  className="text-[var(--text-muted)]"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:opacity-90"
                >
                  {saving ? "Guardando..." : editing ? "Actualizar" : "Crear plan"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Plans grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[var(--border-base)] bg-[var(--bg-card)] p-5 space-y-3">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-8 w-1/2 rounded" />
              <div className="skeleton h-4 w-1/3 rounded" />
              <div className="skeleton h-8 w-full rounded-lg mt-2" />
            </div>
          ))}
        </div>
      ) : plans.length === 0 ? (
        <GlassCard className="p-8">
          <EmptyState
            title="Sin planes de membresía"
            description="Crea el primer plan para que tus miembros puedan inscribirse"
          />
        </GlassCard>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {plans.map((plan) => (
            <PlanCardItem
              key={plan.id}
              plan={plan}
              onEdit={openEdit}
              onDelete={(p) => setDeleteTarget(p)}
            />
          ))}
        </motion.div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar plan</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">
                {`¿Eliminar el plan "${deleteTarget?.name}"? Si tiene membresías activas, será desactivado en lugar de borrado.`}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              className="text-[var(--text-muted)]"
            >
              Cancelar
            </Button>
            <Button
              disabled={deleting}
              onClick={handleDelete}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
