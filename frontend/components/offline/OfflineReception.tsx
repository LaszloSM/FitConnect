"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PARQForm, PARQ_KEYS } from "@/components/common/PARQForm";
import { formatCOP, formatDate, formatDateTime } from "@/lib/format";
import { P, useCan } from "@/lib/permissions";
import { listQueue, saveSnapshot, subscribe, type QueueItem, type Snapshot, type SnapshotMember } from "@/lib/offline/store";
import { discard, loadSnapshot, queueCheckin, queueRequest, retry } from "@/lib/offline/sync";
import { useOffline } from "./OfflineProvider";
import { CloudSlashIcon as CloudOff, UserPlusIcon as UserPlus } from "@phosphor-icons/react";

const STATUS: Record<SnapshotMember["status"], { label: string; tone: "ok" | "warn" | "danger" }> = {
  ok: { label: "Al día", tone: "ok" },
  in_grace: { label: "En días de gracia", tone: "warn" },
  scheduled: { label: "Aún no inicia", tone: "warn" },
  expired: { label: "Vencido", tone: "danger" },
  frozen: { label: "Congelado", tone: "warn" },
  no_entries: { label: "Sin entradas", tone: "danger" },
  no_membership: { label: "Sin membresía", tone: "danger" },
};
const CAN_ENTER = new Set(["ok", "in_grace"]);
const DUP_MS = 5 * 60_000;

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "danger" | "info"; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-6 items-center rounded-[var(--radius-sm)] border px-2 text-xs font-medium"
      style={{ color: `var(--signal-${tone})`, background: `var(--signal-${tone}-bg)`, borderColor: `var(--signal-${tone}-line)` }}
    >
      {children}
    </span>
  );
}

/** Lo pendiente y lo que el servidor rechazó al sincronizar. Visible siempre que haya algo. */
function QueueTray() {
  const { data: session } = useSession();
  const { online } = useOffline();
  const [items, setItems] = useState<QueueItem[]>([]);
  const load = useCallback(() => void listQueue().then(setItems).catch(() => setItems([])), []);
  useEffect(() => {
    load();
    return subscribe(load);
  }, [load]);
  if (items.length === 0) return null;
  const review = items.filter((i) => i.status === "review");
  const pending = items.filter((i) => i.status === "pending");

  return (
    <section className="card space-y-3 p-5" aria-label="Pendientes de sincronizar">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Hecho sin conexión</h2>
        <p className="text-xs text-ink-muted">
          {pending.length > 0 && `${pending.length} por subir${online ? "" : " cuando vuelva la red"}`}
          {pending.length > 0 && review.length > 0 && " · "}
          {review.length > 0 && `${review.length} por revisar`}
        </p>
      </div>
      <ul className="divide-y divide-line text-sm">
        {[...review, ...pending].map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="min-w-0 flex-1">
              <span className="font-medium text-ink">{item.label}</span>
              <span className="text-ink-muted"> · {formatDateTime(item.created_at, "HH:mm")}</span>
              {item.error && <span className="block text-[13px]" style={{ color: "var(--signal-danger)" }}>{item.error}</span>}
            </span>
            {item.status === "review" && item.payload.kind === "checkin" ? (
              // La entrada ya quedó registrada en el servidor: es un aviso, no algo por reenviar.
              <Button size="xs" variant="outline" onClick={() => void discard(item)}>
                Entendido
              </Button>
            ) : item.status === "review" ? (
              <span className="flex gap-1.5">
                <Button size="xs" variant="outline" onClick={() => void retry(item, session?.accessToken)}>
                  Reintentar
                </Button>
                <Button size="xs" variant="ghost" onClick={() => void discard(item)}>
                  Descartar
                </Button>
              </span>
            ) : (
              <Pill tone="info">Pendiente</Pill>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const EMPTY_NEW = {
  full_name: "", id_number: "", phone: "", email: "", birth_date: "", address: "", city: "",
  emergency_contact_name: "", emergency_contact_phone: "",
};

function NewMemberForm({ snapshot, onDone }: { snapshot: Snapshot; onDone: (m: SnapshotMember) => void }) {
  const [f, setF] = useState(EMPTY_NEW);
  const [planId, setPlanId] = useState(snapshot.plans[0]?.id ?? "");
  const [parq, setParq] = useState<Record<string, boolean>>({});
  const [consent, setConsent] = useState(false);
  const set = (k: keyof typeof EMPTY_NEW) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (snapshot.members.some((m) => m.id_number && m.id_number === f.id_number.trim())) {
      toast.error("Esa cédula ya está registrada: búscala arriba");
      return;
    }
    if (PARQ_KEYS.some((k) => typeof parq[k] !== "boolean")) {
      toast.error("Responde las 7 preguntas del cuestionario de salud");
      return;
    }
    if (!consent) {
      toast.error("El socio debe aceptar la política de datos");
      return;
    }
    const plan = snapshot.plans.find((p) => p.id === planId);
    const tempId = `tmp-${crypto.randomUUID()}`;
    await queueRequest(`Alta de ${f.full_name} (${plan?.name ?? "plan"}, efectivo)`, "/api/v1/members", {
      ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])),
      id_type: "CC", parq_answers: parq, plan_id: planId, payment_method: "cash", consent_data: true,
    }, { temp_member_id: tempId });
    const member: SnapshotMember = {
      id: tempId, name: f.full_name.trim(), id_number: f.id_number.trim(), type: "member", status: "ok",
      plan: plan?.name ?? null, end_date: null, entries_left: plan?.entries_total ?? null,
    };
    await saveSnapshot({ ...snapshot, members: [member, ...snapshot.members] });
    toast.success("Alta guardada: se sube sola cuando vuelva la red");
    onDone(member);
  };

  return (
    <form onSubmit={submit} className="space-y-4 border-t border-line pt-4">
      <h3 className="text-sm font-semibold text-ink">Socio nuevo (sin conexión)</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["full_name", "Nombre completo", "text"], ["id_number", "Cédula", "text"], ["phone", "Celular", "tel"],
          ["email", "Correo", "email"], ["birth_date", "Fecha de nacimiento", "date"], ["city", "Ciudad", "text"],
          ["address", "Dirección", "text"], ["emergency_contact_name", "Contacto de emergencia", "text"],
          ["emergency_contact_phone", "Celular de emergencia", "tel"],
        ] as const).map(([k, label, type]) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={`off-${k}`}>{label}</Label>
            <Input id={`off-${k}`} type={type} required value={f[k]} onChange={set(k)} />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="off-plan">Plan (pago en efectivo)</Label>
          <select
            id="off-plan"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink"
          >
            {snapshot.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatCOP(p.price)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <PARQForm value={parq} onChange={setParq} />
      <label className="flex items-start gap-2.5 text-[13px] text-ink-muted">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        El socio acepta la política de tratamiento de datos (Ley 1581 de 2012).
      </label>
      <Button type="submit">Guardar alta</Button>
    </form>
  );
}

/**
 * Recepción cuando no hay internet: busca en la copia local, decide con el
 * estado que tenía el socio en la última sincronización y anota todo para
 * subirlo al volver la red.
 */
export function OfflineReception() {
  const { online, snapshotAt } = useOffline();
  const { can } = useCan();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<SnapshotMember | null>(null);
  const [reason, setReason] = useState("");
  const [renewPlan, setRenewPlan] = useState("");
  const [creating, setCreating] = useState(false);
  const [recent, setRecent] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!online) void loadSnapshot().then(setSnapshot);
  }, [online, snapshotAt]);

  const results = useMemo(() => {
    if (!snapshot || q.trim().length < 2) return [];
    const n = norm(q);
    const digits = q.replace(/\D/g, "");
    return snapshot.members
      .filter((m) => (digits.length >= 4 && m.id_number?.startsWith(digits)) || norm(m.name).includes(n))
      .slice(0, 8);
  }, [snapshot, q]);

  if (online) return <QueueTray />;

  const persist = async (member: SnapshotMember) => {
    if (!snapshot) return;
    const next = { ...snapshot, members: snapshot.members.map((m) => (m.id === member.id ? member : m)) };
    setSnapshot(next);
    await saveSnapshot(next);
  };

  const enter = async (decision: "allowed" | "override") => {
    const member = picked;
    if (!member) return;
    const last = recent[member.id];
    if (last && Date.now() - last < DUP_MS) {
      toast.info(`${member.name} ya entró hace menos de 5 minutos`);
      return;
    }
    // Se limpia ANTES de guardar: recepción ya puede estar escribiendo al siguiente.
    const why = reason.trim();
    setPicked(null);
    setQ("");
    setReason("");
    setRecent((r) => ({ ...r, [member.id]: Date.now() }));
    await queueCheckin(member, decision, decision === "override" ? why : undefined);
    if (member.entries_left != null && member.entries_left > 0) {
      await persist({ ...member, entries_left: member.entries_left - 1, status: member.entries_left - 1 === 0 ? "no_entries" : member.status });
    }
    toast.success(`Entrada de ${member.name} anotada`);
  };

  const renew = async () => {
    if (!picked || !snapshot) return;
    const plan = snapshot.plans.find((p) => p.id === renewPlan);
    if (!plan) return;
    if (picked.id.startsWith("tmp-")) {
      toast.error("Es un alta sin sincronizar: ya quedó con su plan");
      return;
    }
    await queueRequest(`Cobro en efectivo: ${plan.name} a ${picked.name}`, "/api/v1/member-plans/charge", {
      member_id: picked.id, plan_id: plan.id, method: "cash",
    });
    await persist({ ...picked, status: "ok", plan: plan.name, entries_left: plan.entries_total });
    setPicked({ ...picked, status: "ok", plan: plan.name, entries_left: plan.entries_total });
    toast.success(`Cobro de ${formatCOP(plan.price)} anotado. Recuerda guardar el efectivo en la caja.`);
  };

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-5" aria-label="Recepción sin conexión">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--signal-warn-bg)] text-[var(--signal-warn)]">
            <CloudOff className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">Sin conexión: recepción con la copia local</h2>
            <p className="text-sm text-ink-muted">
              {snapshot
                ? `Estados de la última sincronización (${formatDateTime(snapshot.generated_at)}). Lo que hagas se sube solo al volver la red. El torniquete sigue funcionando por su cuenta.`
                : "Este equipo aún no tiene copia: conéctalo un momento a internet con la sesión abierta."}
            </p>
          </div>
        </div>

        {snapshot && (
          <>
            <Input
              autoFocus
              placeholder="Cédula o nombre"
              aria-label="Buscar socio"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPicked(null);
              }}
              className="h-12 text-base"
            />
            {!picked && results.length > 0 && (
              <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(m);
                        setRenewPlan(snapshot.plans[0]?.id ?? "");
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted"
                    >
                      <span>
                        <span className="font-medium text-ink">{m.name}</span>
                        {m.id_number && <span className="num text-ink-muted"> · {m.id_number}</span>}
                      </span>
                      <Pill tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Pill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!picked && q.trim().length >= 2 && results.length === 0 && (
              <p className="text-sm text-ink-muted">No está en la copia local.</p>
            )}

            {picked && (
              <div className="space-y-4 rounded-[var(--radius-md)] border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-ink">{picked.name}</p>
                  <Pill tone={STATUS[picked.status].tone}>{STATUS[picked.status].label}</Pill>
                </div>
                <p className="text-sm text-ink-muted">
                  {[picked.plan, picked.end_date ? `hasta el ${formatDate(picked.end_date)}` : null,
                    picked.entries_left != null ? `${picked.entries_left} entradas` : null].filter(Boolean).join(" · ") || "Sin plan"}
                </p>
                {CAN_ENTER.has(picked.status) ? (
                  <Button size="lg" onClick={() => void enter("allowed")}>
                    Registrar entrada
                  </Button>
                ) : (
                  <div className="space-y-4">
                    {snapshot.plans.length > 0 && can(P.PAYMENTS_WRITE) && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="renew-plan">Renovar en efectivo</Label>
                          <select
                            id="renew-plan"
                            value={renewPlan}
                            onChange={(e) => setRenewPlan(e.target.value)}
                            className="h-10 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink"
                          >
                            {snapshot.plans.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} · {formatCOP(p.price)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button onClick={() => void renew()}>Cobrar en efectivo</Button>
                      </div>
                    )}
                    {can(P.ACCESS_OVERRIDE) && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[220px] flex-1 space-y-1.5">
                          <Label htmlFor="override-reason">Dejar entrar igual (motivo)</Label>
                          <Input id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
                        </div>
                        <Button variant="outline" disabled={reason.trim().length < 3} onClick={() => void enter("override")}>
                          Autorizar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {can(P.MEMBERS_WRITE) && !creating && (
              <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
                <UserPlus /> Socio nuevo sin conexión
              </Button>
            )}
            {creating && (
              <NewMemberForm
                snapshot={snapshot}
                onDone={(m) => {
                  setCreating(false);
                  void loadSnapshot().then(setSnapshot);
                  setPicked(m);
                }}
              />
            )}
          </>
        )}
      </section>
      <QueueTray />
    </div>
  );
}
