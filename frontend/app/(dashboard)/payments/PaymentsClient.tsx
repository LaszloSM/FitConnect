/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import MemberSelect from "@/components/common/MemberSelect";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, AlertCircle, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface Payment {
  id: string;
  member_id: string;
  member_name?: string;
  amount: number;
  method: string | null;
  status: string;
  concept: string;
  created_at: string;
}

type StatusFilter = "" | "paid" | "pending" | "overdue";

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";
const selectCls =
  "w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-1 text-sm text-[var(--text-base)]";

const STATUS_LABELS: Record<string, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  overdue: "Vencido",
};

const STATUS_DOT: Record<string, string> = {
  paid: "bg-green-500",
  pending: "bg-amber-400",
  overdue: "bg-red-500",
};

const STATUS_BADGE: Record<string, string> = {
  paid:    "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
  pending: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
  overdue: "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  wompi: "Wompi",
};

export default function PaymentsClient() {
  const { data: session } = useSession();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    member_id: "",
    amount: "",
    method: "cash",
    concept: "",
  });

  const fetchPayments = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/payments");
      setPayments(res.data);
      setError("");
    } catch (err: any) {
      setError(
        typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Error cargando pagos"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    setLoading(true);
    const client = apiClient(session.accessToken as string);
    client
      .get("/api/v1/payments")
      .then((res) => {
        if (!cancelled) { setPayments(res.data); setError(""); }
      })
      .catch((err: any) => {
        if (!cancelled)
          setError(
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Error cargando pagos"
          );
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);
    try {
      await client.post("/api/v1/payments", {
        ...form,
        amount: parseFloat(form.amount),
      });
      toast.success("Pago registrado correctamente");
      setDialogOpen(false);
      setForm({ member_id: "", amount: "", method: "cash", concept: "" });
      fetchPayments();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail[0]?.msg
          : "Error guardando pago"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered payments
  const filtered = statusFilter
    ? payments.filter((p) => p.status === statusFilter)
    : payments;

  // Totals
  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((acc, p) => acc + p.amount, 0);
  const totalPending = payments
    .filter((p) => p.status === "pending")
    .reduce((acc, p) => acc + p.amount, 0);

  const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "",        label: "Todos" },
    { key: "paid",    label: "Pagados" },
    { key: "pending", label: "Pendientes" },
    { key: "overdue", label: "Vencidos" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <PageHeader
          title="Pagos"
          subtitle="Registra y gestiona pagos de miembros"
          action={
            <DialogTrigger asChild>
              <Button className="bg-orange-500 text-white hover:bg-orange-600">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo pago
              </Button>
            </DialogTrigger>
          }
        />

        <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-base)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-base)] font-display">
              Nuevo pago
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Miembro</Label>
              <MemberSelect
                value={form.member_id}
                onChange={(id) => setForm({ ...form, member_id: id })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Monto</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Método</Label>
                <select
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}
                  className={selectCls}
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="card">Tarjeta</option>
                  <option value="wompi">Wompi</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Concepto</Label>
              <Input
                value={form.concept}
                onChange={(e) => setForm({ ...form, concept: e.target.value })}
                required
                className={inputCls}
              />
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
                disabled={submitting}
                className="bg-orange-500 text-white font-semibold hover:bg-orange-600"
              >
                {submitting ? "Registrando..." : "Registrar pago"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Totals summary bar */}
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="surface-1 rounded-xl p-4 flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
            </span>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Total cobrado</p>
              <p className="text-sm font-bold text-[var(--text-base)] font-mono">
                ${totalPaid.toLocaleString("es-CO")}
              </p>
            </div>
          </div>
          <div className="surface-1 rounded-xl p-4 flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-amber-500" />
            </span>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Por cobrar</p>
              <p className="text-sm font-bold text-[var(--text-base)] font-mono">
                ${totalPending.toLocaleString("es-CO")}
              </p>
            </div>
          </div>
          <div className="surface-1 rounded-xl p-4 flex items-center gap-3 col-span-2 sm:col-span-1">
            <span className="h-8 w-8 rounded-full bg-[var(--bg-base)] border border-[var(--border-base)] flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-[var(--text-muted)]">#</span>
            </span>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Total registros</p>
              <p className="text-sm font-bold text-[var(--text-base)] font-mono">
                {payments.length}
              </p>
            </div>
          </div>
        </div>
      )}

      <GlassCard className="p-4">
        {/* Status filter pills */}
        <div
          className="flex gap-2 flex-wrap mb-4"
          role="group"
          aria-label="Filtrar por estado"
        >
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              aria-pressed={statusFilter === key}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                statusFilter === key
                  ? "bg-orange-500 text-white"
                  : "bg-[var(--bg-base)] border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 mb-4">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                <TableHead className="text-[var(--text-muted)] w-4" />
                <TableHead className="text-[var(--text-muted)]">Miembro</TableHead>
                <TableHead className="text-[var(--text-muted)]">Concepto</TableHead>
                <TableHead className="text-[var(--text-muted)]">Monto</TableHead>
                <TableHead className="text-[var(--text-muted)]">Método</TableHead>
                <TableHead className="text-[var(--text-muted)]">Estado</TableHead>
                <TableHead className="text-[var(--text-muted)]">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-[var(--border-base)]">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="skeleton h-4 rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      title={statusFilter ? "Sin pagos en este estado" : "Sin pagos registrados"}
                      description={
                        statusFilter
                          ? "Cambia el filtro para ver otros pagos"
                          : "Registra el primer pago de un miembro"
                      }
                      action={
                        !statusFilter ? (
                          <Button
                            onClick={() => setDialogOpen(true)}
                            className="bg-orange-500 text-white hover:bg-orange-600"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nuevo pago
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="border-[var(--border-base)] hover:bg-[var(--bg-base)]"
                  >
                    {/* Status dot */}
                    <TableCell className="py-3 pr-0">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full inline-block",
                          STATUS_DOT[p.status] ?? "bg-gray-400"
                        )}
                        aria-hidden="true"
                      />
                    </TableCell>
                    <TableCell className="text-[var(--text-base)] font-medium">
                      {p.member_name ?? `${p.member_id.slice(0, 8)}…`}
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)]">{p.concept}</TableCell>
                    <TableCell className="text-[var(--text-base)] font-semibold font-mono">
                      ${p.amount.toLocaleString("es-CO")}
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] capitalize">
                      {METHOD_LABELS[p.method ?? ""] ?? p.method ?? "-"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          STATUS_BADGE[p.status] ?? "bg-[var(--bg-base)] text-[var(--text-muted)]"
                        )}
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] text-sm">
                      {new Date(p.created_at).toLocaleDateString("es-ES")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
    </motion.div>
  );
}
