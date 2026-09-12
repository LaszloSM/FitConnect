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
import { FormDialog } from "@/components/ui/form-dialog";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP, formatDateTime } from "@/lib/format";
import { P, useCan } from "@/lib/permissions";
import { DENOMINATIONS, EXPENSE_LABELS, MANUAL_EXPENSE_CATEGORIES } from "../shared";
import {
  ArrowLeft, Lock, Unlock, Loader2, TrendingDown, Plus, RotateCcw, Vault, Printer, EyeOff, Users,
} from "lucide-react";
import { toast } from "sonner";

interface CurrentShift {
  open: boolean;
  cash_shifts_enabled?: boolean;
  blind?: boolean;
  shift?: any;
  cash_income?: string | null;
  cash_expenses?: string | null;
  drops_total?: string;
  drops?: { id: string; amount: string; note: string | null; created_at: string | null }[];
  expected_cash?: string | null;
}

interface CashierRow {
  staff_id: string | null;
  name: string;
  shifts: number;
  with_difference: number;
  shortage: string;
  overage: string;
  net: string;
  last_closed_at: string | null;
}

const EMPTY_EXPENSE = { amount: 0, category: "insumos", concept: "", method: "cash" };

const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function tonoDiferencia(n: number) {
  return n === 0 ? "var(--signal-ok)" : n < 0 ? "var(--signal-danger)" : "var(--signal-warn)";
}

function textoDiferencia(n: number) {
  if (n === 0) return "Cuadrado";
  return `${n < 0 ? "Faltante" : "Sobrante"} ${formatCOP(Math.abs(n))}`;
}

export default function CashClient() {
  const { data: session } = useSession();
  const { can } = useCan();
  const supervisa = can(P.CASH_READ);

  const [current, setCurrent] = useState<CurrentShift | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  // Una lista vacía y una lista que no se pudo leer no son lo mismo: decir
  // "no hay cierres" cuando en realidad no se pudo mirar es afirmar algo falso.
  const [historyDenied, setHistoryDenied] = useState(false);
  const [cashiers, setCashiers] = useState<CashierRow[] | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const [openingAmount, setOpeningAmount] = useState(0);
  const [expense, setExpense] = useState(EMPTY_EXPENSE);
  const [drop, setDrop] = useState({ amount: 0, note: "" });

  // El arqueo por denominación es el modo por defecto: es como cuenta un cajero
  // de verdad, y deja rastro de en qué se equivocó.
  const [countMode, setCountMode] = useState<"denom" | "total">("denom");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countedCash, setCountedCash] = useState(0);
  const [closeResult, setCloseResult] = useState<any | null>(null);

  const [toReopen, setToReopen] = useState<any | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const denomTotal = DENOMINATIONS.reduce((acc, d) => acc + d * (counts[String(d)] ?? 0), 0);
  const counted = countMode === "denom" ? denomTotal : countedCash;

  const load = useCallback(async () => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);

    // Cada fuente cae por su cuenta: recepción puede abrir turno pero no leer el
    // histórico, y un 403 no puede dejarla sin la tarjeta de abrir turno.
    const [cur, hist, diffs] = await Promise.all([
      client.get("/api/v1/cash/shifts/current").catch(() => null),
      client.get("/api/v1/cash/shifts", { params: { limit: 20 } }).catch(() => null),
      client.get("/api/v1/cash/differences").catch(() => null),
    ]);
    if (cur) setCurrent(cur.data);
    setHistory(hist ? hist.data : []);
    setHistoryDenied(!hist);
    setCashiers(diffs ? diffs.data.items : null);

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

  const run = async (fn: () => Promise<void>, fallback: string) => {
    if (!session?.accessToken) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      toast.error(parseApiError(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const client = () => apiClient(session!.accessToken as string);

  const openShift = () =>
    run(async () => {
      await client().post("/api/v1/cash/shifts/open", { opening_amount: openingAmount });
      toast.success("Turno de caja abierto");
      setOpeningAmount(0);
      setCloseResult(null);
    }, "Error abriendo turno");

  const closeShift = () =>
    run(async () => {
      // El total va siempre: con el cajón vacío el desglose sale vacío y el
      // backend necesita al menos una de las dos cosas.
      const body =
        countMode === "denom"
          ? { denominations: Object.fromEntries(Object.entries(counts).filter(([, q]) => q > 0)), counted_cash: denomTotal }
          : { counted_cash: countedCash };
      const res = await client().post(`/api/v1/cash/shifts/${current!.shift.id}/close`, body);
      setCloseResult(res.data);
      setCounts({});
      setCountedCash(0);
    }, "Error cerrando turno");

  const addExpense = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await client().post("/api/v1/cash/expenses", expense);
      toast.success("Egreso registrado");
      setExpense(EMPTY_EXPENSE);
    }, "Error registrando egreso");
  };

  const addDrop = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await client().post(`/api/v1/cash/shifts/${current!.shift.id}/drops`, {
        amount: drop.amount,
        note: drop.note.trim() || null,
      });
      toast.success("Retiro a bóveda registrado");
      setDrop({ amount: 0, note: "" });
    }, "No se pudo registrar el retiro");
  };

  const reopenShift = async () => {
    if (reopenReason.trim().length < 10) {
      toast.error("Explica el motivo en al menos 10 caracteres: queda en la auditoría.");
      return;
    }
    await run(async () => {
      await client().post(`/api/v1/cash/shifts/${toReopen.id}/reopen`, { reason: reopenReason.trim() });
      toast.success("Turno reabierto. Cuenta de nuevo y ciérralo.");
      setToReopen(null);
      setReopenReason("");
      setCloseResult(null);
    }, "No se pudo reabrir el turno");
  };

  const printXReport = () =>
    run(async () => {
      const { data: x } = await client().get("/api/v1/cash/shifts/current/x-report");
      const fila = (a: string, b: string, cls = "") => `<div class="row ${cls}"><span>${a}</span><span>${b}</span></div>`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Corte X</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          body { font-family: -apple-system, system-ui, sans-serif; width: 72mm; margin: 0 auto; color: #111; }
          h1 { font-size: 15px; text-align: center; margin: 0; }
          .sub { text-align: center; font-size: 11px; color: #555; margin: 2px 0 8px; }
          h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #555; margin: 10px 0 2px; }
          .row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
          .total { border-top: 1px dashed #999; margin-top: 6px; padding-top: 6px; font-weight: 700; font-size: 14px; }
          .foot { text-align: center; font-size: 10px; color: #888; margin-top: 10px; }
        </style></head><body>
        <h1>Corte X</h1>
        <div class="sub">Parcial · el turno sigue abierto</div>
        ${fila("Abrió", escapeHtml(x.opened_by_name ?? "—"))}
        ${fila("Desde", escapeHtml(formatDateTime(x.opened_at)))}
        <h2>Efectivo en caja</h2>
        ${fila("Base", formatCOP(Number(x.opening_amount)))}
        ${fila("Cobros en efectivo", "+" + formatCOP(Number(x.cash_income)))}
        ${fila("Egresos", "−" + formatCOP(Number(x.cash_expenses)))}
        ${fila("Retiros a bóveda", "−" + formatCOP(Number(x.drops_total)))}
        ${fila("Esperado", formatCOP(Number(x.expected_cash)), "total")}
        <h2>Cobros por método</h2>
        ${x.by_method.length ? x.by_method.map((m: any) => fila(`${escapeHtml(m.label)} · ${m.count}`, formatCOP(Number(m.amount)))).join("") : fila("Sin cobros", "")}
        ${x.expenses.length ? `<h2>Egresos por categoría</h2>${x.expenses.map((e: any) => fila(`${escapeHtml(e.label)} · ${e.count}`, formatCOP(Number(e.amount)))).join("")}` : ""}
        <div class="foot">Generado ${escapeHtml(formatDateTime(x.generated_at))}</div>
        <script>window.onload = () => window.print();</script>
        </body></html>`;
      const w = window.open("", "_blank", "width=380,height=640");
      if (!w) throw new Error("El navegador bloqueó la ventana del corte");
      w.document.write(html);
      w.document.close();
    }, "No se pudo generar el corte X");

  const open = !!(current?.open && current.shift);
  const blind = current?.blind !== false;
  const closedHistory = history.filter((s) => s.status === "closed");

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
      <PageHeader
        module="payments"
        title="Caja"
        subtitle="Turno, egresos, retiros y cierre con arqueo"
        action={
          open && supervisa ? (
            <Button variant="outline" onClick={printXReport} disabled={busy}>
              <Printer className="h-4 w-4" /> Corte X
            </Button>
          ) : undefined
        }
      />

      {closeResult && !open && (
        <GlassCard className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-[var(--text-base)]">Turno cerrado</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {closeResult.closed_at ? formatDateTime(closeResult.closed_at) : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCloseResult(null)}>Listo</Button>
          </div>
          <dl className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Contado</dt>
              <dd className="text-lg font-bold tabular-nums text-[var(--text-base)]">{formatCOP(Number(closeResult.counted_cash))}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Esperado</dt>
              <dd className="text-lg font-bold tabular-nums text-[var(--text-base)]">{formatCOP(Number(closeResult.expected_cash))}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Resultado</dt>
              <dd className="text-lg font-bold tabular-nums" style={{ color: tonoDiferencia(Number(closeResult.difference)) }}>
                {textoDiferencia(Number(closeResult.difference))}
              </dd>
            </div>
          </dl>
        </GlassCard>
      )}

      {current && !current.open && current.cash_shifts_enabled === false && (
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
            <Unlock className="h-4 w-4" style={{ color: "var(--signal-ok)" }} />
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

      {open && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Base" value={formatCOP(Number(current!.shift.opening_amount))} caption={current!.shift.opened_by_name ? `Abrió ${current!.shift.opened_by_name}` : undefined} />
            <Stat label="Retiros a bóveda" value={formatCOP(Number(current!.drops_total ?? 0))} caption={`${current!.drops?.length ?? 0} retiro(s)`} />
            {blind ? (
              <GlassCard className="p-4 col-span-2 flex items-start gap-3">
                <EyeOff className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-muted)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-base)]">Cierre ciego</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Cuenta el efectivo sin mirar el esperado. El sistema te muestra la diferencia al cerrar.
                  </p>
                </div>
              </GlassCard>
            ) : (
              <>
                <Stat
                  label="Movimiento en efectivo"
                  value={`+${formatCOP(Number(current!.cash_income))}`}
                  caption={`−${formatCOP(Number(current!.cash_expenses))} en egresos`}
                  color="var(--signal-ok)"
                />
                <Stat label="Esperado en caja" value={formatCOP(Number(current!.expected_cash))} caption="Solo lo ve quien supervisa" />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4" style={{ color: "var(--signal-danger)" }} />
                <h3 className="text-sm font-semibold text-[var(--text-base)]">Registrar egreso</h3>
              </div>
              <form onSubmit={addExpense} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[var(--text-muted)] text-xs">Monto</Label>
                    <CurrencyInput value={expense.amount} onChange={(v) => setExpense({ ...expense, amount: v })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="exp-cat" className="text-[var(--text-muted)] text-xs">Categoría</Label>
                    <select
                      id="exp-cat"
                      value={expense.category}
                      onChange={(e) => setExpense({ ...expense, category: e.target.value })}
                      className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-base)]"
                    >
                      {MANUAL_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_LABELS[c]}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exp-concept" className="text-[var(--text-muted)] text-xs">Concepto</Label>
                  <Input
                    id="exp-concept"
                    value={expense.concept}
                    onChange={(e) => setExpense({ ...expense, concept: e.target.value })}
                    placeholder="Pago de servicios, compra de toallas..."
                    required
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <select
                    aria-label="Medio del egreso"
                    value={expense.method}
                    onChange={(e) => setExpense({ ...expense, method: e.target.value })}
                    className="h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-base)]"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                  <Button type="submit" variant="destructive" disabled={busy || !expense.amount}>
                    <Plus className="h-4 w-4" /> Egreso
                  </Button>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Las devoluciones se hacen desde el pago, en Historial.
                </p>
              </form>
              {expenses.length > 0 && (
                <ul className="space-y-1.5 pt-2 border-t border-[var(--border-base)]">
                  {expenses.map((ex) => (
                    <li key={ex.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-[var(--text-base)] truncate">{ex.concept}</span>
                      <span className="shrink-0 tabular-nums" style={{ color: "var(--signal-danger)" }}>−{formatCOP(Number(ex.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Vault className="h-4 w-4 text-[var(--text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--text-base)]">Retiro a bóveda</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Efectivo que sacas del cajón para guardarlo. No es un gasto: no afecta la utilidad, solo el cuadre.
              </p>
              <form onSubmit={addDrop} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[var(--text-muted)] text-xs">Monto</Label>
                  <CurrencyInput value={drop.amount} onChange={(v) => setDrop({ ...drop, amount: v })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="drop-note" className="text-[var(--text-muted)] text-xs">Nota</Label>
                  <Input
                    id="drop-note"
                    value={drop.note}
                    onChange={(e) => setDrop({ ...drop, note: e.target.value })}
                    placeholder="Sobre sellado, lo recibió la administradora"
                    maxLength={255}
                  />
                </div>
                <Button type="submit" variant="outline" className="w-full" disabled={busy || !drop.amount}>
                  Registrar retiro
                </Button>
              </form>
              {(current!.drops?.length ?? 0) > 0 && (
                <ul className="space-y-1.5 pt-2 border-t border-[var(--border-base)]">
                  {current!.drops!.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-[var(--text-base)] truncate">
                        {d.note || "Retiro"}
                        {d.created_at && <span className="text-xs text-[var(--text-muted)]"> · {formatDateTime(d.created_at)}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--text-base)]">{formatCOP(Number(d.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" style={{ color: "var(--signal-warn)" }} />
                  <h3 className="text-sm font-semibold text-[var(--text-base)]">Cerrar turno</h3>
                </div>
                <div role="tablist" aria-label="Forma de contar" className="flex rounded-md border border-[var(--border-base)] p-0.5 text-xs">
                  {([["denom", "Por billete"], ["total", "Solo total"]] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={countMode === v}
                      onClick={() => setCountMode(v)}
                      className={`px-2 py-1 rounded transition-colors ${countMode === v ? "bg-[var(--bg-muted)] text-[var(--text-base)] font-medium" : "text-[var(--text-muted)] hover:text-[var(--text-base)]"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {countMode === "denom" ? (
                <div className="space-y-1">
                  {DENOMINATIONS.map((d) => {
                    const key = String(d);
                    const q = counts[key] ?? 0;
                    return (
                      <div key={d} className="grid grid-cols-[1fr_4.5rem_1fr] items-center gap-2 text-sm">
                        <label htmlFor={`den-${d}`} className="text-[var(--text-muted)] tabular-nums">{formatCOP(d)}</label>
                        <Input
                          id={`den-${d}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={q || ""}
                          placeholder="0"
                          onChange={(e) => {
                            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setCounts((prev) => ({ ...prev, [key]: n }));
                          }}
                          className="h-8 text-right tabular-nums"
                        />
                        <span className="text-right tabular-nums text-[var(--text-base)]">{q ? formatCOP(d * q) : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-[var(--text-muted)] text-xs">Efectivo contado</Label>
                  <CurrencyInput value={countedCash} onChange={setCountedCash} />
                </div>
              )}

              <div className="flex items-baseline justify-between border-t border-[var(--border-base)] pt-3">
                <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Total contado</span>
                <span className="text-xl font-bold tabular-nums text-[var(--text-base)]">{formatCOP(counted)}</span>
              </div>
              <Button onClick={closeShift} disabled={busy} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cerrar turno"}
              </Button>
            </GlassCard>
          </div>
        </>
      )}

      {cashiers && cashiers.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-[var(--text-muted)]" />
            <h3 className="text-sm font-semibold text-[var(--text-base)]">Diferencias por cajero</h3>
            <span className="text-xs text-[var(--text-muted)]">· últimos 90 días</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="py-1.5 pr-3 font-medium">Cajero</th>
                  <th className="py-1.5 px-3 font-medium text-right">Cierres</th>
                  <th className="py-1.5 px-3 font-medium text-right">Con diferencia</th>
                  <th className="py-1.5 px-3 font-medium text-right">Faltantes</th>
                  <th className="py-1.5 pl-3 font-medium text-right">Sobrantes</th>
                </tr>
              </thead>
              <tbody>
                {cashiers.map((c) => (
                  <tr key={c.staff_id ?? c.name} className="border-t border-[var(--border-base)]">
                    <td className="py-2 pr-3 text-[var(--text-base)]">{c.name}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-[var(--text-base)]">{c.shifts}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-[var(--text-base)]">{c.with_difference}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={{ color: Number(c.shortage) > 0 ? "var(--signal-danger)" : "var(--text-muted)" }}>
                      {Number(c.shortage) > 0 ? formatCOP(Number(c.shortage)) : "—"}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums" style={{ color: Number(c.overage) > 0 ? "var(--signal-warn)" : "var(--text-muted)" }}>
                      {Number(c.overage) > 0 ? formatCOP(Number(c.overage)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Histórico de cierres — recepción no puede leerlo: se oculta en vez de
          mostrarle una tarjeta vacía que parece un gimnasio sin cierres. */}
      {!historyDenied && (
        <GlassCard className="p-4">
          <h3 className="text-sm font-semibold text-[var(--text-base)] mb-3">Cierres anteriores</h3>
          {closedHistory.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-2">Aún no hay cierres registrados.</p>
          ) : (
            <div className="space-y-1.5">
              {closedHistory.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] text-sm flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[var(--text-base)]">{s.closed_at ? formatDateTime(s.closed_at) : "—"}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {s.closed_by_name ?? "Sin registro"}
                      {s.denominations ? " · arqueo por billete" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 tabular-nums">
                    <span className="text-[var(--text-muted)] hidden sm:inline">Esperado {formatCOP(Number(s.expected_cash ?? 0))}</span>
                    <span style={{ color: tonoDiferencia(Number(s.difference)) }}>{textoDiferencia(Number(s.difference))}</span>
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
            ? `Cerrado el ${toReopen.closed_at ? formatDateTime(toReopen.closed_at) : "—"} por ${toReopen.closed_by_name ?? "—"} (${textoDiferencia(Number(toReopen.difference ?? 0)).toLowerCase()}). Se borra el conteo y el turno vuelve a quedar abierto.`
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

function Stat({ label, value, caption, color }: { label: string; value: string; caption?: string; color?: string }) {
  return (
    <GlassCard className="p-4">
      <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="text-lg font-bold tabular-nums text-[var(--text-base)] mt-0.5" style={color ? { color } : undefined}>{value}</p>
      {caption && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{caption}</p>}
    </GlassCard>
  );
}
