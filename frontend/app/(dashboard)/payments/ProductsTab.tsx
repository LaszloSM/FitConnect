/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { EmptyState } from "@/components/common/EmptyState";
import { FormDialog, FormField } from "@/components/ui/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { apiClient } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { cn } from "@/lib/utils";
import { Archive, Package, Pencil, Plus, TriangleAlert } from "lucide-react";

interface Product {
  id: string;
  name: string;
  photo_url: string | null;
  price: number;
  stock: number;
  low_stock_threshold: number;
  is_active: boolean;
}

const emptyForm = { name: "", price: 0, stock: 0, low_stock_threshold: 3 };

export function ProductsTab() {
  const { data: session } = useSession();
  const products = useApiResource<Product[]>("/api/v1/products", []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      price: Number(p.price),
      stock: p.stock,
      low_stock_threshold: p.low_stock_threshold,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!session?.accessToken) return;
    if (!form.name.trim() || form.price <= 0) {
      toast.error("Nombre y precio son obligatorios");
      return;
    }
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);
    try {
      if (editing) {
        await client.put(`/api/v1/products/${editing.id}`, form);
        toast.success("Producto actualizado");
      } else {
        await client.post("/api/v1/products", form);
        toast.success("Producto creado");
      }
      setDialogOpen(false);
      await products.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error guardando el producto");
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (p: Product) => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    try {
      await client.delete(`/api/v1/products/${p.id}`);
      toast.success(`${p.name} archivado`);
      await products.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error archivando");
    }
  };

  return (
    <GlassCard className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--text-base)]">Catálogo de productos</h2>
        </div>
        <FormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={editing ? "Editar producto" : "Nuevo producto"}
          trigger={
            <Button
              onClick={openCreate}
              className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo producto
            </Button>
          }
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel={editing ? "Guardar cambios" : "Crear producto"}
        >
          <FormField label="Nombre" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Agua 600ml, Proteína, Guantes..."
            />
          </FormField>
          <FormField label="Precio de venta" required>
            <CurrencyInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Stock actual">
              <Input
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: Math.max(0, Number(e.target.value)) })}
              />
            </FormField>
            <FormField label="Alerta de stock bajo" hint="Aviso cuando queden estas unidades o menos">
              <Input
                type="number"
                min={0}
                value={form.low_stock_threshold}
                onChange={(e) =>
                  setForm({ ...form, low_stock_threshold: Math.max(0, Number(e.target.value)) })
                }
              />
            </FormField>
          </div>
        </FormDialog>
      </div>

      {products.loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      ) : products.data.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10 text-[var(--text-muted)] opacity-50" />}
          title="Sin productos"
          description="Agrega lo que vendes en mostrador: agua, proteína, accesorios..."
          action={
            <Button
              onClick={openCreate}
              className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo producto
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.data.map((p, i) => {
            const low = p.stock <= p.low_stock_threshold;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
                className="group rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-3 space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-base)] truncate">{p.name}</p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(p)}
                      title="Editar"
                      className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)]"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => archive(p)}
                      title="Archivar"
                      className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-red-500"
                    >
                      <Archive className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <p className="text-base font-bold text-[var(--text-base)] font-mono">{formatCOP(p.price)}</p>
                <p
                  className={cn(
                    "text-xs flex items-center gap-1",
                    p.stock <= 0
                      ? "text-red-500 font-semibold"
                      : low
                      ? "text-amber-600 dark:text-amber-400 font-semibold"
                      : "text-[var(--text-muted)]"
                  )}
                >
                  {low && <TriangleAlert className="h-3 w-3" />}
                  {p.stock <= 0 ? "Agotado" : `${p.stock} en stock`}
                </p>
              </motion.div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
