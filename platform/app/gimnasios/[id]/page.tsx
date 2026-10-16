"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Notice, StatusPill } from "@/components/StatusPill";
import { GymDataCard } from "@/components/GymDataCard";
import { PaymentsCard } from "@/components/PaymentsCard";
import { api } from "@/lib/api";
import { day, money, moment } from "@/lib/format";
import { ACTION_LABEL, type TenantDetail } from "@/lib/types";

const PLANS = [
  { value: "basic", label: "Básico" },
  { value: "advanced", label: "Avanzado" },
  { value: "premium_ai", label: "Premium IA" },
];
const MODULES = [
  { key: "member_app", label: "App para socios" },
  { key: "ai", label: "Inteligencia y asistente" },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [t, setT] = useState<TenantDetail | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [trialDays, setTrialDays] = useState(14);
  const [compUntil, setCompUntil] = useState("");
  const [compReason, setCompReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [notes, setNotes] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [mfaReason, setMfaReason] = useState("");

  const load = useCallback(() => {
    api<TenantDetail>(`/tenants/${id}`)
      .then((d) => {
        setT(d);
        setNotes(d.internal_notes ?? "");
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  const act = async (path: string, body: unknown, done: string, method = "POST") => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await api<{ notified?: boolean }>(`/tenants/${id}${path}`, { method, body });
      setOk(res?.notified ? `${done}. Le avisamos al dueño por correo.` : done);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setBusy(false);
    }
  };

  if (!t) {
    return (
      <Shell>
        {error ? <Notice tone="danger">{error}</Notice> : <p className="text-ink-muted">Cargando…</p>}
      </Shell>
    );
  }

  const sub = t.subscription;
  const m = t.metrics;
  const suspended = sub.status === "suspended";

  return (
    <Shell>
      <Link href="/" className="text-sm text-ink-muted hover:text-ink">
        ← Gimnasios
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[32px] font-bold tracking-tight">{t.name}</h1>
        <StatusPill status={sub.status} daysLeft={sub.days_left} />
      </div>
      <p className="text-sm text-ink-muted">
        {[t.city, t.owner_name, t.owner_email, t.phone].filter(Boolean).join(" · ")}
      </p>

      <div className="mt-4 space-y-2">
        {error && <Notice tone="danger">{error}</Notice>}
        {ok && <Notice tone="ok">{ok}</Notice>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Suscripción</h2>
          <dl className="mt-2 divide-y divide-line">
            <Row label="Plan">
              {sub.plan_label} · <span className="num">{money(t.monthly_price)}</span>/mes
              {t.price_cop != null && <span className="text-ink-muted"> (lista {money(t.list_price)})</span>}
            </Row>
            <Row label="Pagado hasta">{sub.paid_until ? day(sub.paid_until) : "Sin pagos registrados"}</Row>
            <Row label="Prueba hasta">{day(sub.trial_ends_at)}</Row>
            <Row label="Cortesía hasta">{sub.comp_until ? `${day(sub.comp_until)}${t.comp_reason ? ` · ${t.comp_reason}` : ""}` : "—"}</Row>
            <Row label="Módulos">{sub.modules.length ? sub.modules.map((k) => MODULES.find((x) => x.key === k)?.label ?? k).join(", ") : "Ninguno"}</Row>
            <Row label="Alta">{moment(t.created_at)}</Row>
          </dl>

          <h2 className="mt-6 text-base font-semibold">Uso</h2>
          {m?.error ? (
            <p className="mt-2 text-sm text-[var(--signal-danger)]">La base del gimnasio no responde.</p>
          ) : (
            <dl className="mt-2 divide-y divide-line">
              <Row label="Socios (activos)"><span className="num">{m?.members ?? "—"} ({m?.active_members ?? "—"})</span></Row>
              <Row label="Entradas en 30 días"><span className="num">{m?.checkins_30d ?? "—"}</span></Row>
              <Row label="Última entrada">{moment(m?.last_checkin)}</Row>
              <Row label="Último cobro">{moment(m?.last_payment)}</Row>
              <Row label="Torniquetes en línea"><span className="num">{m?.turnstiles_online ?? 0}/{m?.turnstiles ?? 0}</span></Row>
              <Row label="Personal"><span className="num">{m?.staff ?? "—"}</span></Row>
            </dl>
          )}
        </section>

        <section className="space-y-5">
          <PaymentsCard tenantId={id} onChange={load} />

          <div className="card space-y-3 p-5">
            <h2 className="text-base font-semibold">Prueba gratis</h2>
            <p className="text-sm text-ink-muted">Desde hoy, o se suma a la prueba vigente.</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                className="field num w-24"
                aria-label="Días de prueba"
                value={trialDays}
                onChange={(e) => setTrialDays(Number(e.target.value))}
              />
              <span className="text-sm text-ink-muted">días</span>
              <button className="btn btn-outline ml-auto" disabled={busy} onClick={() => act("/trial", { days: trialDays, notify }, "Prueba actualizada")}>
                Dar prueba
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[7, 15, 30].map((d) => (
                <button key={d} className="btn btn-outline" disabled={busy} onClick={() => act("/trial", { days: d, notify }, `Prueba extendida ${d} días`)}>
                  +{d} días
                </button>
              ))}
            </div>
          </div>

          <div className="card space-y-3 p-5">
            <h2 className="text-base font-semibold">Cortesía</h2>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Avisar al dueño por correo (prueba y cortesía)
            </label>
            <p className="text-sm text-ink-muted">Acceso completo sin cobro (pilotos, aliados, meses gratis).</p>
            <input className="field w-full" placeholder="Motivo (obligatorio)" aria-label="Motivo" value={compReason} onChange={(e) => setCompReason(e.target.value)} maxLength={255} />
            <div className="flex flex-wrap gap-1.5">
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  className="btn btn-outline"
                  disabled={busy || compReason.trim().length < 3}
                  onClick={() => act("/comp", { months: m, reason: compReason, notify }, `Cortesía de ${m} ${m === 1 ? "mes" : "meses"} guardada`)}
                >
                  +{m} {m === 1 ? "mes" : "meses"}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-muted">O hasta una fecha exacta:</p>
            <input type="date" className="field" aria-label="Hasta" value={compUntil} onChange={(e) => setCompUntil(e.target.value)} />
            <div className="flex justify-end gap-2">
              {sub.comp_until && (
                <button className="btn btn-outline" disabled={busy} onClick={() => act("/comp", { until: null }, "Cortesía retirada")}>
                  Quitar cortesía
                </button>
              )}
              <button
                className="btn btn-outline"
                disabled={busy || !compUntil}
                onClick={() => act("/comp", { until: compUntil, reason: compReason, notify }, "Cortesía guardada")}
              >
                Dar cortesía
              </button>
            </div>
          </div>

          <div className="card space-y-3 p-5">
            <h2 className="text-base font-semibold">Plan y módulos</h2>
            <select
              className="field"
              aria-label="Plan"
              value={sub.plan}
              disabled={busy}
              onChange={(e) => act("", { plan: e.target.value }, "Plan cambiado", "PATCH")}
            >
              {PLANS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {MODULES.map((mod) => (
              <label key={mod.key} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={busy}
                  checked={Boolean(t.modules[mod.key])}
                  onChange={(e) => act("", { modules: { [mod.key]: e.target.checked } }, "Módulos actualizados", "PATCH")}
                />
                {mod.label} <span className="text-ink-muted">(además de lo que incluye el plan)</span>
              </label>
            ))}
          </div>

          <GymDataCard tenant={t} onSaved={load} />

          <div className="card space-y-3 p-5">
            <h2 className="text-base font-semibold">Notas internas</h2>
            <textarea className="field" rows={3} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} aria-label="Notas internas" />
            <div className="flex justify-end">
              <button className="btn btn-primary" disabled={busy || notes === (t.internal_notes ?? "")} onClick={() => act("", { internal_notes: notes }, "Notas guardadas", "PATCH")}>
                Guardar notas
              </button>
            </div>
          </div>

          <div className="card space-y-3 p-5">
            <h2 className="text-base font-semibold">El dueño perdió el celular</h2>
            <p className="text-sm text-ink-muted">
              Borra su app autenticadora; en el próximo ingreso configura una nueva. Antes, confirma que es él llamando al
              teléfono registrado del gimnasio.
            </p>
            <input className="field" placeholder="Cómo se verificó (queda en la bitácora)" aria-label="Verificación" value={mfaReason} onChange={(e) => setMfaReason(e.target.value)} maxLength={255} />
            <button
              className="btn btn-outline"
              disabled={busy || mfaReason.trim().length < 5}
              onClick={() => act("/reset-owner-mfa", { reason: mfaReason }, "Verificación del dueño reiniciada").then(() => setMfaReason(""))}
            >
              Reiniciar verificación del dueño
            </button>
          </div>

          <div className="card space-y-3 p-5">
            <h2 className="text-base font-semibold">{suspended ? "Gimnasio suspendido" : "Suspender"}</h2>
            <p className="text-sm text-ink-muted">
              El personal no puede entrar al sistema. Los socios siguen entrando al gimnasio por el torniquete.
            </p>
            {suspended ? (
              <button className="btn btn-outline" disabled={busy} onClick={() => act("/reactivate", {}, "Gimnasio reactivado")}>
                Reactivar
              </button>
            ) : confirmSuspend ? (
              <div className="space-y-2">
                <input className="field" placeholder="Motivo (queda en la bitácora)" aria-label="Motivo de la suspensión" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
                <div className="flex gap-2">
                  <button
                    className="btn btn-danger"
                    disabled={busy || suspendReason.trim().length < 3}
                    onClick={() => act("/suspend", { reason: suspendReason }, "Gimnasio suspendido").then(() => setConfirmSuspend(false))}
                  >
                    Confirmar suspensión
                  </button>
                  <button className="btn btn-outline" onClick={() => setConfirmSuspend(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmSuspend(true)}>
                Suspender…
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="text-base font-semibold">Historial</h2>
        {t.history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Sin cambios desde el panel.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {t.history.map((h, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                  <span className="text-ink-muted"> · {h.admin_email}</span>
                  {Object.keys(h.details ?? {}).length > 0 && (
                    <span className="text-ink-muted"> · {Object.entries(h.details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ")}</span>
                  )}
                </span>
                <span className="text-ink-muted">{moment(h.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
