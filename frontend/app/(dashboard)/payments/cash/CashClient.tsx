/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP, formatDateTime } from "@/lib/format";
import { ArrowLeft, Lock, Unlock, Loader2, TrendingDown, Plus, RotateCcw } from "lucide-react";
import { FormDialog } from "@/components/ui/form-dialog";
import { P, useCan } from "@/lib/permissions";
import { toast } from "sonner";

const EXPENSE_CATEGORIES = [
  { value: "servicios", label: "Servicios" },
  { value: "nomina", label: "Nómina" },
  { value: "insumos", label: "Insumos" },
  { value: "devolucion", label: "Devolución" },
  { value: "otros", label: "Otros" },
];

interface CurrentShift {
  open: boolean;
  shift?: any;
  cash_income?: string;
  cash_expenses?: string;
  expected_cash?: string;
}

export default function CashClient() {
  const { data: session } = useSession();
  const [current, setCurrent] = useState<CurrentShift | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  // Una lista vacía y una lista que no se pudo leer no son lo mismo: decir
  // "no hay cierres" cuando en realidad no se pudo mirar es afirmar algo falso.
  const [historyDenied, setHistoryDenied] = useState(false);
  // Reabrir existe en el backend desde hace tiempo y ninguna pantalla lo usaba:
  // un cierre mal contado quedaba fijo, y la única salida era borrar pagos.
  const { can } = useCan();
  const [toReopen, setToReopen] = useState<any | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [openingAmount, setOpeningAmount] = useState(0);
  const [countedCash, setCountedCash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [expense, setExpense] = useState({ amount: 0, category: "insumos", concept: "", method: "cash" });
  const [expenses, setExpenses] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);

    // Cada fuente cae por su cuenta. Antes iban en un Promise.all estricto y
    // recepción —que puede abrir turno pero no leer el histórico— se quedaba
    // SIN la tarjeta de abrir turno porque un 403 rechazaba el bloque entero.
    const cur = await client.get("/api/v1/cash/shifts/current").catch(() => null);
    if (cur) setCurrent(cur.data);

    const hist = await client
      .get("/api/v1/cash/shifts", { params: { limit: 20 } })
      .catch(() => null);
    setHistory(hist ? hist.data : []);
    setHistoryDenied(!hist);

    if (cur?.data?.open && cur.data.shift) {
      const exp = await client
        .get("/api/v1/cash/expenses", { params: { shift_id: cur.data.shift.id } })
        .catch(() => null);
      setExpenses(exp ? exp.data : []);
    } else {
      setExpenses([]);
    }
  }, [session?.accessToken]);

  useEffect(() => { void load(); }, [load]);

  const openShift = async () => {
    if (!session?.accessToken) return;
    setBusy(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.post("/api/v1/cash/shifts/open", { opening_amount: openingAmount });
      toast.success("Turno de caja abierto");
      setOpeningAmount(0);
      await load();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error abriendo turno"));
    } finally {
      setBusy(false);
    }
  };

  const closeShift = async () => {
    if (!session?.accessToken || !current?.shift) return;
    setBusy(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.post(`/api/v1/cash/shifts/${current.shift.id}/close`, { counted_cash: countedCash });
      const diff = Number(res.data.difference);
      if (diff === 0) toast.success("Caja cerrada y cuadrada ✓");
      else toast.warning(`Caja cerrada con diferencia de ${formatCOP(diff)}`);
      setCountedCash(0);
      await load();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error cerrando turno"));
    } finally {
      setBusy(false);
    }
  };

  const reopenShift = async () => {
    if (!session?.accessToken || !toReopen) return;
    if (reopenReason.trim().length < 10) {
      toast.error("Explica el motivo en al menos 10 caracteres: queda en la auditoría.");
      return;
    }
    setBusy(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.post(`/api/v1/cash/shifts/${toReopen.id}/reopen`, { reason: reopenReason.trim() });
      toast.success("Turno reabierto. Cuenta de nuevo y ciérralo.");
      setToReopen(null);
      setReopenReason("");
      await load();
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo reabrir el turno"));
    } finally {
      setBusy(false);
    }
  };

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setBusy(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.post("/api/v1/cash/expenses", expense);
      toast.success("Egreso registrado");
      setExpense({ amount: 0, category: "insumos", concept: "", method: "cash" });
      await load();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error registrando egreso"));
    } finally {
      setBusy(false);
    }
  };

  const expected = current?.expected_cash ? Number(current.expected_cash) : 0;
  const diff = countedCash - expected;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-5"
    >
      <div className="flex items-center gap-3">
        <Link href="/payments" className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-base)] text-sm transition-colors">
          <ArrowLeft className="h-4 w-4" /> Pagos
        </Link>
      </div>
      <PageHeader module="payments" title="Caja" subtitle="Turno, egresos y cierre con cuadre" />

      {current && !current.open && (current as any).cash_shifts_enabled === false && (
        <GlassCard className="p-5">
          <p className="text-sm text-[var(--text-base)] font-medium">Turnos de caja desactivados</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Este gym cobra en efectivo sin abrir turno. Puedes activarlos en{" "}
            <Link href="/settings" className="text-[var(--color-primary-ink)] font-medium hover:underline">
              Configuración → Operación
            </Link>{" "}
            si quieres cuadre de caja por empleado. Abrir un turno abajo sigue siendo opcional.
          </p>
        </GlassCard>
      )}

      {current && !current.open && (
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Unlock className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-[var(--text-base)]">Abrir turno de caja</h3>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            No hay turno abierto. Para cobrar en efectivo, abre uno con el monto base de la caja.
          </p>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Base inicial</Label>
              <CurrencyInput value={openingAmount} onChange={setOpeningAmount} />
            </div>
            <Button onClick={openShift} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Abrir turno"}
            </Button>
          </div>
        </GlassCard>
      )}

      {current?.open && current.shift && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <GlassCard className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Base</p>
              <p className="text-lg font-bold text-[var(--text-base)]">{formatCOP(Number(current.shift.opening_amount))}</p>
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Ingresos efectivo</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">+{formatCOP(Number(current.cash_income))}</p>
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Egresos efectivo</p>
              <p className="text-lg font-bold text-red-500">−{formatCOP(Number(current.cash_expenses))}</p>
            </GlassCard>
            <GlassCard className="p-4 ring-1 ring-[var(--color-primary)]/30">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Esperado en caja</p>
              <p className="text-lg font-bold text-[var(--text-base)]">{formatCOP(expected)}</p>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Egresos */}
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold text-[var(--text-base)]">Registrar egreso</h3>
              </div>
              <form onSubmit={addExpense} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[var(--text-muted)] text-xs">Monto</Label>
                    <CurrencyInput value={expense.amount} onChange={(v) => setExpense({ ...expense, amount: v })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[var(--text-muted)] text-xs">Categoría</Label>
                    <select
                      value={expense.category}
                      onChange={(e) => setExpense({ ...expense, category: e.target.value })}
                      className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)]"
                    >
                      {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[var(--text-muted)] text-xs">Concepto</Label>
                  <Input
                    value={expense.concept}
                    onChange={(e) => setExpense({ ...expense, concept: e.target.value })}
                    placeholder="Pago de servicios, compra de toallas..."
                    required
                    className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <select
                    value={expense.method}
                    onChange={(e) => setExpense({ ...expense, method: e.target.value })}
                    className="h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)]"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                  <Button type="submit" disabled={busy || !expense.amount} className="bg-red-600 hover:bg-red-700 text-white">
                    <Plus className="h-4 w-4 mr-1" /> Egreso
                  </Button>
                </div>
              </form>
              {expenses.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[var(--border-base)]">
                  {expenses.map((ex) => (
                    <div key={ex.id} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-base)] truncate">{ex.concept}</span>
                      <span className="text-red-500 shrink-0">−{formatCOP(Number(ex.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Cierre */}
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-[var(--text-base)]">Cerrar turno</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Cuenta el efectivo físico en caja y compáralo con lo esperado.
              </p>
              <div className="space-y-1">
                <Label className="text-[var(--text-muted)] text-xs">Efectivo contado</Label>
                <CurrencyInput value={countedCash} onChange={setCountedCash} />
              </div>
              {countedCash > 0 && (
                <div className={`rounded-lg p-3 text-sm ${diff === 0 ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"}`}>
                  {diff === 0 ? "Caja cuadrada ✓" : `Diferencia: ${formatCOP(diff)} (${diff > 0 ? "sobrante" : "faltante"})`}
                </div>
              )}
              <Button onClick={closeShift} disabled={busy || countedCash <= 0} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cerrar turno"}
              </Button>
            </GlassCard>
          </div>
        </>
      )}

      {/* Histórico de cierres — recepción no puede leerlo: se oculta en vez de
          mostrarle una tarjeta vacía que parece un gimnasio sin cierres. */}
      {!historyDenied && (
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold text-[var(--text-base)] mb-3">Cierres anteriores</h3>
        {history.filter((s) => s.status === "closed").length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-2">Aún no hay cierres registrados.</p>
        ) : (
          <div className="space-y-1.5">
            {history.filter((s) => s.status === "closed").map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] text-sm">
                <span className="text-[var(--text-muted)]">
                  {s.closed_at ? formatDateTime(s.closed_at) : "—"}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-[var(--text-base)]">Esperado {formatCOP(Number(s.expected_cash ?? 0))}</span>
                  <span style={{ color: Number(s.difference) === 0 ? "var(--signal-ok)" : "var(--signal-danger)" }}>
                    {Number(s.difference) === 0 ? "cuadrado" : `${formatCOP(Number(s.difference))}`}
                  </span>
                  {/* Solo sin turno abierto: el efectivo nuevo iría al turno equivocado. */}
                  {can(P.CASH_REOPEN) && !current?.open && (
                    <button
                      type="button"
                      onClick={() => { setToReopen(s); setReopenReason(""); }}
                      title="Reabrir este turno"
                      aria-label="Reabrir este turno"
                      className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-card)] transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
      )}

      <FormDialog
        open={!!toReopen}
        onOpenChange={(o) => !o && setToReopen(null)}
        title="Reabrir turno"
        description={
          toReopen
            ? `Cerrado el ${toReopen.closed_at ? formatDateTime(toReopen.closed_at) : "—"} con una diferencia de ${formatCOP(Number(toReopen.difference ?? 0))}. Se borra el conteo y el turno vuelve a quedar abierto.`
            : ""
        }
        onSubmit={reopenShift}
        submitLabel="Reabrir turno"
        submitting={busy}
      >
        <div className="space-y-2">
          <Label htmlFor="reopen-reason">Motivo</Label>
          <Input
            id="reopen-reason"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="Conté mal los billetes de 50.000"
          />
          <p className="text-xs text-[var(--text-muted)]">Queda registrado en la auditoría con tu nombre.</p>
        </div>
      </FormDialog>
    </motion.div>
  );
}
