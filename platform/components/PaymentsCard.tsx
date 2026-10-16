"use client";

import { useCallback, useEffect, useState } from "react";
import { Notice } from "@/components/StatusPill";
import { api } from "@/lib/api";
import { day, money } from "@/lib/format";
import type { PaymentsResponse, SubscriptionPayment } from "@/lib/types";

const MONTHS = [1, 3, 6, 12];

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function addMonthsMinusDay(start: string, months: number): string {
  const [y, m, d] = start.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const end = new Date(target.getFullYear(), target.getMonth(), Math.min(d, last));
  end.setDate(end.getDate() - 1);
  return end.toLocaleDateString("en-CA");
}

/** Pagos de la suscripción del gimnasio: registrar, ver el historial y anular. */
export function PaymentsCard({ tenantId, onChange }: { tenantId: string; onChange: () => void }) {
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transfer");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [voiding, setVoiding] = useState<SubscriptionPayment | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const load = useCallback(() => {
    api<PaymentsResponse>(`/tenants/${tenantId}/payments`)
      .then((d) => {
        setData(d);
        setAmount(String(d.monthly_price * months));
      })
      .catch((e) => setError(e.message));
    // El monto se recalcula al cambiar los meses; no al recargar por otras razones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(load, [load]);

  const pickMonths = (n: number) => {
    setMonths(n);
    if (data) setAmount(String(data.monthly_price * n));
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await api<{ notified: boolean; payment: SubscriptionPayment }>(`/tenants/${tenantId}/payments`, {
        method: "POST",
        body: { months, amount_cop: Number(amount), method, paid_on: paidOn, reference, note, notify },
      });
      setOk(
        `Pago registrado: cubre hasta el ${day(res.payment.period_end)}.` +
          (res.notified ? " Le enviamos el comprobante al dueño." : ""),
      );
      setReference("");
      setNote("");
      load();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setBusy(false);
    }
  };

  const confirmVoid = async () => {
    if (!voiding) return;
    setBusy(true);
    setError("");
    try {
      await api(`/tenants/${tenantId}/payments/${voiding.id}/void`, { method: "POST", body: { reason: voidReason } });
      setOk("Pago anulado.");
      setVoiding(null);
      setVoidReason("");
      load();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular");
    } finally {
      setBusy(false);
    }
  };

  const validAmount = amount !== "" && Number(amount) >= 0;
  const covers = data ? addMonthsMinusDay(data.next_period_start, months) : null;

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Cobros de la suscripción</h2>
        <p className="text-sm">
          <span className="text-ink-muted">Pagado hasta </span>
          <span className="font-semibold">{data ? (data.paid_until ? day(data.paid_until) : "sin pagos") : "…"}</span>
        </p>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {ok && <Notice tone="ok">{ok}</Notice>}

      <fieldset className="space-y-3" disabled={busy || !data}>
        <legend className="text-sm font-medium">Registrar un pago</legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meses que paga">
          {MONTHS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={months === n}
              className={`btn btn-sm ${months === n ? "btn-primary" : "btn-outline"}`}
              onClick={() => pickMonths(n)}
            >
              {n} {n === 1 ? "mes" : "meses"}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-ink-muted">Valor recibido (COP)</span>
            <input className="field num w-full" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-ink-muted">Medio de pago</span>
            <select className="field w-full" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(data?.methods ?? {}).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-ink-muted">Fecha del pago</span>
            <input type="date" className="field w-full" max={todayISO()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-ink-muted">Referencia (opcional)</span>
            <input className="field w-full" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>
        <input className="field w-full" placeholder="Nota interna (opcional)" aria-label="Nota" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        {data && covers && (
          <p className="text-sm text-ink-muted">
            Cubre del <span className="text-ink">{day(data.next_period_start)}</span> al{" "}
            <span className="text-ink">{day(covers)}</span>. Precio mensual de este gimnasio:{" "}
            <span className="num">{money(data.monthly_price)}</span>.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Enviar comprobante al dueño
          </label>
          <button type="button" className="btn btn-primary" disabled={!validAmount} onClick={submit}>
            Registrar pago
          </button>
        </div>
      </fieldset>

      <div>
        <h3 className="text-sm font-medium">Historial</h3>
        {!data ? (
          <p className="mt-2 text-sm text-ink-muted">Cargando…</p>
        ) : data.items.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {data.items.map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${p.voided_at ? "opacity-60" : ""}`}>
                <div>
                  <p>
                    <span className={`num font-semibold ${p.voided_at ? "line-through" : ""}`}>{money(p.amount_cop)}</span>
                    <span className="text-ink-muted"> · {p.method_label} · {day(p.paid_on)}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {day(p.period_start)} – {day(p.period_end)}
                    {p.reference ? ` · Ref. ${p.reference}` : ""}
                    {p.voided_at ? ` · Anulado: ${p.void_reason}` : ""}
                  </p>
                </div>
                {!p.voided_at && (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setVoiding(p)}>
                    Anular
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {voiding && (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--signal-danger-line)] bg-[var(--signal-danger-bg)] p-3">
          <p className="text-sm">
            Anular el pago de <span className="num font-semibold">{money(voiding.amount_cop)}</span> del {day(voiding.paid_on)}. «Pagado
            hasta» vuelve al pago anterior.
          </p>
          <input className="field w-full" placeholder="Motivo (queda en la bitácora)" aria-label="Motivo de la anulación" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={255} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-danger" disabled={busy || voidReason.trim().length < 3} onClick={confirmVoid}>
              Confirmar anulación
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setVoiding(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
