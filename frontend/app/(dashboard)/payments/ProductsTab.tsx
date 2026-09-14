/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { EmptyState } from "@/components/common/EmptyState";
import { FormDialog, FormField } from "@/components/ui/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP, formatTimeAgo } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { cn } from "@/lib/utils";
import { ArchiveIcon as Archive, ArrowLineDownIcon as ArrowDownToLine, ArrowLineUpIcon as ArrowUpFromLine, ClockCounterClockwiseIcon as History, PackageIcon as Package, PencilSimpleIcon as Pencil, PlusIcon as Plus, MagnifyingGlassIcon as Search, TagIcon as Tags, TrashIcon as Trash2, WarningIcon as TriangleAlert, WrenchIcon as Wrench } from "@phosphor-icons/react";

interface Product {
  id: string;
  name: string;
  photo_url: string | null;
  price: number;
  cost_price: number | null;
  stock: number;
  low_stock_threshold: number;
  is_active: boolean;
  category_id: string | null;
  category_name: string | null;
  sku: string | null;
  barcode: string | null;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface Movement {
  id: string;
  type: "purchase" | "sale" | "adjustment" | "waste" | "return";
  quantity: number;
  unit_cost: number | null;
  stock_after: number;
  note: string | null;
  payment_id: string | null;
  created_by_name: string | null;
  created_at: string;
}

const MOVEMENT_LABELS: Record<Movement["type"], { label: string; cls: string }> = {
  purchase: { label: "Compra", cls: "text-[var(--signal-ok)]" },
  sale: { label: "Venta", cls: "text-[var(--text-base)]" },
  adjustment: { label: "Ajuste", cls: "text-[var(--signal-info)]" },
  waste: { label: "Merma", cls: "text-[var(--signal-danger)]" },
  return: { label: "Devolución", cls: "text-ink-muted" },
};

type MovementType = "purchase" | "adjustment" | "waste";

const emptyForm = {
  name: "", price: 0, cost_price: 0, stock: 0, low_stock_threshold: 3,
  category_id: "", sku: "", barcode: "",
};

export function ProductsTab() {
  const { data: session } = useSession();
  const products = useApiResource<Product[]>("/api/v1/products", []);
  const categories = useApiResource<Category[]>("/api/v1/products/categories", []);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [movementFor, setMovementFor] = useState<Product | null>(null);
  const [movement, setMovement] = useState<{ type: MovementType; quantity: number; unit_cost: number; note: string }>({
    type: "purchase", quantity: 1, unit_cost: 0, note: "",
  });
  const [savingMovement, setSavingMovement] = useState(false);

  const [historyFor, setHistoryFor] = useState<Product | null>(null);
  const [history, setHistory] = useState<Movement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [catDialog, setCatDialog] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  const client = () => apiClient(session?.accessToken as string);

  useEffect(() => {
    if (!historyFor || !session?.accessToken) return;
    let cancelled = false;
    setLoadingHistory(true);
    client()
      .get(`/api/v1/products/${historyFor.id}/movements`, { params: { limit: 100 } })
      .then((res) => { if (!cancelled) setHistory(res.data); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFor, session]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, price: Number(p.price), cost_price: Number(p.cost_price ?? 0), stock: p.stock,
      low_stock_threshold: p.low_stock_threshold, category_id: p.category_id ?? "",
      sku: p.sku ?? "", barcode: p.barcode ?? "",
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
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        cost_price: form.cost_price > 0 ? form.cost_price : null,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
      };
      if (editing) {
        await client().put(`/api/v1/products/${editing.id}`, payload);
        toast.success("Producto actualizado");
      } else {
        await client().post("/api/v1/products", payload);
        toast.success("Producto creado");
      }
      setDialogOpen(false);
      await products.refetch();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error guardando el producto"));
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (p: Product) => {
    if (!session?.accessToken) return;
    try {
      await client().delete(`/api/v1/products/${p.id}`);
      toast.success(`${p.name} archivado`);
      await products.refetch();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error archivando"));
    }
  };

  const openMovement = (p: Product, type: MovementType) => {
    setMovementFor(p);
    setMovement({ type, quantity: 1, unit_cost: Number(p.cost_price ?? 0), note: "" });
  };

  const saveMovement = async () => {
    if (!session?.accessToken || !movementFor) return;
    if (movement.quantity === 0) {
      toast.error("La cantidad no puede ser cero");
      return;
    }
    setSavingMovement(true);
    try {
      const { data } = await client().post(`/api/v1/products/${movementFor.id}/movements`, {
        type: movement.type,
        quantity: movement.quantity,
        unit_cost: movement.type === "purchase" && movement.unit_cost > 0 ? movement.unit_cost : null,
        note: movement.note.trim() || null,
      });
      toast.success(`${MOVEMENT_LABELS[movement.type as Movement["type"]].label} registrada · stock ${data.stock_after}`);
      setMovementFor(null);
      await products.refetch();
      if (historyFor?.id === movementFor.id) setHistory((h) => [data, ...h]);
    } catch (err: any) {
      toast.error(parseApiError(err, "Error registrando el movimiento"));
    } finally {
      setSavingMovement(false);
    }
  };

  const addCategory = async () => {
    if (!session?.accessToken || !newCat.trim()) return;
    setSavingCat(true);
    try {
      await client().post("/api/v1/products/categories", { name: newCat.trim() });
      setNewCat("");
      await categories.refetch();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error creando la categoría"));
    } finally {
      setSavingCat(false);
    }
  };

  const [catToDelete, setCatToDelete] = useState<string | null>(null);

  // Confirmación en línea en vez de window.confirm: el diálogo nativo no sigue
  // el tema y en móvil tapa el formulario desde el que se llamó.
  const removeCategory = async (c: Category) => {
    if (!session?.accessToken) return;
    if (catToDelete !== c.id) {
      setCatToDelete(c.id);
      return;
    }
    setCatToDelete(null);
    try {
      await client().delete(`/api/v1/products/categories/${c.id}`);
      await Promise.all([categories.refetch(), products.refetch()]);
    } catch (err: any) {
      toast.error(parseApiError(err, "Error eliminando"));
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.data.filter(
      (p) =>
        (!categoryFilter || p.category_id === categoryFilter) &&
        (!q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.barcode ?? "") === q)
    );
  }, [products.data, query, categoryFilter]);

  const inventoryValue = products.data.reduce((a, p) => a + Number(p.cost_price ?? 0) * p.stock, 0);
  const lowCount = products.data.filter((p) => p.stock <= p.low_stock_threshold).length;

  const historyColumns: DataTableColumn<Movement>[] = [
    {
      key: "type",
      header: "Movimiento",
      cell: (m) => (
        <div>
          <p className={cn("text-sm font-semibold", MOVEMENT_LABELS[m.type]?.cls)}>{MOVEMENT_LABELS[m.type]?.label ?? m.type}</p>
          {m.note && <p className="text-xs text-[var(--text-muted)]">{m.note}</p>}
        </div>
      ),
    },
    {
      key: "qty",
      header: "Cant.",
      cell: (m) => (
        <span className={cn("font-mono font-semibold", m.quantity > 0 ? "text-[var(--signal-ok)]" : "text-ink")}>
          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
        </span>
      ),
    },
    { key: "after", header: "Quedan", cell: (m) => <span className="font-mono text-[var(--text-muted)]">{m.stock_after}</span> },
    {
      key: "cost",
      header: "Costo u.",
      hideOnMobile: true,
      cell: (m) => <span className="text-[var(--text-muted)] text-sm">{m.unit_cost != null ? formatCOP(m.unit_cost) : "—"}</span>,
    },
    {
      key: "who",
      header: "Quién · cuándo",
      cell: (m) => (
        <span className="text-xs text-[var(--text-muted)]">
          {m.created_by_name ?? "Sistema"} · {formatTimeAgo(m.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[var(--color-primary-ink)]" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-base)]">Inventario</h2>
              <p className="text-xs text-[var(--text-muted)]">
                {products.data.length} producto{products.data.length === 1 ? "" : "s"} · valor a costo {formatCOP(inventoryValue)}
                {lowCount > 0 && <span className="text-[var(--signal-warn)] font-medium"> · {lowCount} con stock bajo</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" onClick={() => setCatDialog(true)}>
              <Tags className="h-3.5 w-3.5 mr-1.5" /> Categorías
            </Button>
            <FormDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              title={editing ? "Editar producto" : "Nuevo producto"}
              trigger={
                <Button onClick={openCreate} size="lg">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo producto
                </Button>
              }
              onSubmit={handleSubmit}
              submitting={submitting}
              submitLabel={editing ? "Guardar cambios" : "Crear producto"}
            >
              <FormField label="Nombre" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Agua 600ml, Proteína, Guantes..." />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Precio de venta" required>
                  <CurrencyInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
                </FormField>
                <FormField label="Costo de compra" hint="Para calcular el margen">
                  <CurrencyInput value={form.cost_price} onChange={(v) => setForm({ ...form, cost_price: v })} />
                </FormField>
              </div>
              <FormField label="Categoría">
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink"
                >
                  <option value="">Sin categoría</option>
                  {categories.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="SKU / código interno">
                  <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="AGUA-600" />
                </FormField>
                <FormField label="Código de barras">
                  <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="7701234567890" inputMode="numeric" />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={editing ? "Stock (corrige con un ajuste)" : "Stock inicial"} hint={editing ? "Cambiarlo aquí registra un ajuste en el historial" : undefined}>
                  <Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: Math.max(0, Number(e.target.value)) })} />
                </FormField>
                <FormField label="Alerta de stock bajo" hint="Aviso cuando queden estas unidades o menos">
                  <Input type="number" min={0} value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Math.max(0, Number(e.target.value)) })} />
                </FormField>
              </div>
            </FormDialog>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, SKU o código de barras" className="pl-8" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setCategoryFilter("")}
              className={cn("h-8 rounded-[var(--radius-md)] px-3 text-xs font-medium border transition-colors", !categoryFilter ? "bg-[var(--text-base)] text-[var(--bg-base)] border-transparent" : "border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]")}
            >
              Todas
            </button>
            {categories.data.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryFilter(c.id === categoryFilter ? "" : c.id)}
                className={cn("h-8 rounded-[var(--radius-md)] px-3 text-xs font-medium border transition-colors", categoryFilter === c.id ? "bg-[var(--text-base)] text-[var(--bg-base)] border-transparent" : "border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]")}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {products.loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-32 rounded-xl" />)}
          </div>
        ) : products.data.length === 0 ? (
          <EmptyState
            icon={<Package className="h-10 w-10 text-[var(--text-muted)] opacity-50" />}
            title="Sin productos"
            description="Agrega lo que vendes en mostrador: agua, proteína, accesorios..."
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> Nuevo producto
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-6 text-center">Ningún producto coincide con la búsqueda.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((p, i) => {
              const low = p.stock <= p.low_stock_threshold;
              const margin = p.cost_price != null ? Number(p.price) - Number(p.cost_price) : null;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
                  className="group rounded-[var(--radius-lg)] border border-line bg-surface p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-base)] truncate">{p.name}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {p.category_name ?? "Sin categoría"}{p.sku ? ` · ${p.sku}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-0.5 shrink-0 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <button onClick={() => openEdit(p)} title="Editar" aria-label={"Editar " + p.name} className="size-8 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)]"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => archive(p)} title="Archivar" aria-label={"Archivar " + p.name} className="size-8 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-danger)]"><Archive className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-base font-bold text-[var(--text-base)] font-mono">{formatCOP(p.price)}</p>
                    {margin != null && (
                      <p className={cn("text-xs font-mono tabular-nums", margin >= 0 ? "text-ink-muted" : "text-[var(--signal-danger)]")}>
                        margen {formatCOP(margin)}
                      </p>
                    )}
                  </div>
                  <p className={cn("text-xs flex items-center gap-1", p.stock <= 0 ? "text-[var(--signal-danger)] font-medium" : low ? "text-[var(--signal-warn)] font-medium" : "text-[var(--text-muted)]")}>
                    {low && <TriangleAlert className="h-3 w-3" />}
                    {p.stock <= 0 ? "Agotado" : `${p.stock} en stock`}
                  </p>
                  <div className="flex items-center gap-1 pt-1 border-t border-[var(--border-base)]">
                    <button type="button" onClick={() => openMovement(p, "purchase")} title="Entrada por compra" className="flex-1 h-8 rounded-md text-xs font-medium text-ink-muted hover:text-[var(--signal-ok)] hover:bg-muted flex items-center justify-center gap-1 transition-colors">
                      <ArrowDownToLine className="h-3 w-3" /> Entrada
                    </button>
                    <button type="button" onClick={() => openMovement(p, "waste")} title="Merma / dañado" className="flex-1 h-8 rounded-md text-xs font-medium text-ink-muted hover:text-[var(--signal-danger)] hover:bg-muted flex items-center justify-center gap-1 transition-colors">
                      <ArrowUpFromLine className="h-3 w-3" /> Merma
                    </button>
                    <button type="button" onClick={() => setHistoryFor(p)} title="Historial" aria-label={"Historial de " + p.name} className="size-8 rounded-md text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)] flex items-center justify-center transition-colors">
                      <History className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Movimiento manual */}
      <FormDialog
        open={movementFor !== null}
        onOpenChange={(o) => !o && setMovementFor(null)}
        title={movementFor ? `${movementFor.name} · movimiento de stock` : ""}
        description={movementFor ? `Stock actual: ${movementFor.stock}` : undefined}
        onSubmit={saveMovement}
        submitting={savingMovement}
        submitLabel="Registrar"
      >
        <div className="grid grid-cols-3 gap-2">
          {([["purchase", "Entrada", ArrowDownToLine], ["waste", "Merma", ArrowUpFromLine], ["adjustment", "Ajuste", Wrench]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMovement({ ...movement, type: key })}
              className={cn("flex flex-col items-center gap-1 rounded-[var(--radius-md)] border px-2 py-2.5 text-xs font-medium transition-ui", movement.type === key ? "border-primary bg-primary-muted text-ink" : "border-line text-ink-muted hover:text-ink")}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <FormField label={movement.type === "adjustment" ? "Cantidad (+ entra, − sale)" : "Cantidad"} required>
          <Input
            type="number"
            value={movement.quantity}
            onChange={(e) => setMovement({ ...movement, quantity: Number(e.target.value) })}
            min={movement.type === "adjustment" ? undefined : 1}
          />
        </FormField>
        {movement.type === "purchase" && (
          <FormField label="Costo unitario de compra" hint="Actualiza el costo de referencia del producto">
            <CurrencyInput value={movement.unit_cost} onChange={(v) => setMovement({ ...movement, unit_cost: v })} />
          </FormField>
        )}
        <FormField label="Nota">
          <Input value={movement.note} onChange={(e) => setMovement({ ...movement, note: e.target.value })} placeholder={movement.type === "waste" ? "Vencido, dañado..." : movement.type === "purchase" ? "Proveedor, factura..." : "Conteo físico"} />
        </FormField>
      </FormDialog>

      {/* Historial */}
      <Sheet open={historyFor !== null} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{historyFor?.name}</SheetTitle>
            <SheetDescription>Historial de inventario · stock actual {historyFor?.stock}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <DataTable
              columns={historyColumns}
              rows={history}
              rowKey={(m) => m.id}
              loading={loadingHistory}
              emptyTitle="Sin movimientos"
              emptyDescription="Las entradas, ventas, mermas y ajustes aparecen aquí"
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Categorías */}
      <FormDialog
        open={catDialog}
        onOpenChange={setCatDialog}
        title="Categorías de productos"
        description="Bebidas, suplementos, accesorios... para filtrar el catálogo y los reportes."
        onSubmit={async () => { await addCategory(); }}
        submitLabel="Agregar"
        submitting={savingCat}
        submitDisabled={!newCat.trim()}
        cancelLabel="Cerrar"
      >
        <FormField label="Nueva categoría">
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Bebidas" />
        </FormField>
        {categories.data.length > 0 && (
          <div className="space-y-1">
            {categories.data.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-[var(--border-base)] px-3 py-1.5">
                <span className="text-sm text-[var(--text-base)]">{c.name}</span>
                <button
                  type="button"
                  onClick={() => removeCategory(c)}
                  aria-label={catToDelete === c.id ? `Confirmar: eliminar ${c.name}` : `Eliminar ${c.name}`}
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                    catToDelete === c.id ? "bg-[var(--signal-danger-bg)] text-[var(--signal-danger)]" : "text-ink-muted hover:text-[var(--signal-danger)]"
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {catToDelete === c.id && "¿Eliminar?"}
                </button>
              </div>
            ))}
          </div>
        )}
      </FormDialog>
    </div>
  );
}
