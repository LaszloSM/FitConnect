"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { FormDialog, FormField } from "@/components/ui/form-dialog";
import { apiClient, newIdempotencyKey, postOnce } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, Bot, CheckCircle2, Clock, Megaphone, MessageSquare,
  RotateCcw, Send, SlidersHorizontal, XCircle,
} from "lucide-react";

type TabKey = "auto" | "announcements" | "outbox";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "auto", label: "Automáticos", icon: Bot },
  { key: "announcements", label: "Anuncios", icon: Megaphone },
  { key: "outbox", label: "Envíos", icon: Send },
];

interface AutoMessage {
  occasion: string;
  label: string;
  description: string;
  variables: string[];
  body: string;
  is_active: boolean;
  whatsapp: boolean;
  meta_template_name: string | null;
}

interface Segment {
  key: string;
  label: string;
  description: string;
  param: string | null;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  segment: string;
  segment_label: string;
  recipients: number;
  meta_template_name: string | null;
  sent_at: string | null;
  sent_by_name: string;
}

interface OutboxRow {
  id: string;
  event_type: string;
  recipient_phone: string | null;
  member_name: string | null;
  template_name: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  attempts: number;
  last_error: string | null;
  scheduled_for: string;
  sent_at: string | null;
}

const OUTBOX_STATUS: Record<OutboxRow["status"], { label: string; tone: StatusTone; icon: React.ElementType }> = {
  pending: { label: "En cola", tone: "info", icon: Clock },
  sent: { label: "Enviado", tone: "success", icon: CheckCircle2 },
  failed: { label: "Falló", tone: "danger", icon: XCircle },
  skipped: { label: "Saltado", tone: "neutral", icon: AlertTriangle },
};

const SAMPLE: Record<string, string> = {
  nombre: "María", plan: "Mensual", fecha: "30/06/2026",
  link: "https://pago.fitconnect.co/abc", gym: "Tu Gimnasio",
  maquina: "Trotadora 3", dias: "12",
};

function preview(body: string): string {
  return Object.entries(SAMPLE).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(v),
    body
  );
}

export default function MessagesClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as TabKey) || "auto";
  const token = session?.accessToken as string | undefined;

  const [autos, setAutos] = useState<AutoMessage[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const client = apiClient(token);
    try {
      // Por fuente: con Promise.all, una sola petición caída borraba las
      // cuatro secciones de la pantalla.
      const [a, sg, ann, out] = await Promise.allSettled([
        client.get<AutoMessage[]>("/api/v1/messages"),
        client.get<Segment[]>("/api/v1/messages/segments"),
        client.get<AnnouncementRow[]>("/api/v1/messages/announcements"),
        client.get<OutboxRow[]>("/api/v1/messages/outbox"),
      ]);
      setAutos(a.status === "fulfilled" ? a.value.data : []);
      setSegments(sg.status === "fulfilled" ? sg.value.data : []);
      setAnnouncements(ann.status === "fulfilled" ? ann.value.data : []);
      setOutbox(out.status === "fulfilled" ? out.value.data : []);
      const todas = [a, sg, ann, out];
      setError(
        todas.every((r) => r.status === "rejected")
          ? "No se pudieron cargar los mensajes"
          : ""
      );
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "No se pudieron cargar los mensajes");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const setTab = (key: TabKey) => router.replace(`/messages?tab=${key}`, { scroll: false });

  const pendientes = outbox.filter((o) => o.status === "pending").length;
  const fallidos = outbox.filter((o) => o.status === "failed" || o.status === "skipped").length;

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        module="members"
        eyebrow="Comunicación"
        title="Mensajes"
        subtitle="Lo que el gym le dice a sus socios: lo automático, los anuncios y qué salió de verdad."
      />

      <div className="flex gap-2 flex-wrap" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === key
                ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                : "border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {key === "outbox" && fallidos > 0 && (
              <span className="ml-1 rounded-full bg-red-500 text-white text-[11px] px-1.5">{fallidos}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-500" />}
          title="Error cargando los mensajes"
          description={error}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-12 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton col-span-12 md:col-span-6 h-44 rounded-xl" />
          ))}
        </div>
      ) : tab === "auto" ? (
        <AutoTab messages={autos} onSaved={load} token={token} />
      ) : tab === "announcements" ? (
        <AnnouncementsTab
          segments={segments}
          rows={announcements}
          onSent={load}
          token={token}
        />
      ) : (
        <OutboxTab rows={outbox} pendientes={pendientes} onRetried={load} token={token} />
      )}
    </div>
  );
}

// ─────────────────────────── Automáticos ───────────────────────────

function AutoTab({
  messages, onSaved, token,
}: { messages: AutoMessage[]; onSaved: () => void; token?: string }) {
  const [draft, setDraft] = useState<Record<string, AutoMessage>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const value = (m: AutoMessage) => draft[m.occasion] ?? m;

  const patch = (m: AutoMessage, changes: Partial<AutoMessage>) =>
    setDraft((d) => ({ ...d, [m.occasion]: { ...value(m), ...changes } }));

  const save = async (m: AutoMessage) => {
    if (!token) return;
    const next = value(m);
    setSaving(m.occasion);
    try {
      await apiClient(token).put(`/api/v1/messages/${m.occasion}`, {
        body: next.body,
        is_active: next.is_active,
        meta_template_name: next.meta_template_name,
      });
      toast.success(`"${m.label}" guardado`);
      setDraft((d) => {
        const { [m.occasion]: _drop, ...rest } = d;
        return rest;
      });
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 text-sm text-[var(--text-muted)]">
        <p className="text-[var(--text-base)] font-medium mb-1">Cómo funciona</p>
        El texto que escribas aquí es el aviso que ves <strong className="text-[var(--text-base)]">dentro de la app</strong>.
        Para WhatsApp, Meta exige que las plantillas las apruebe ella: por eso abajo
        registras el <strong className="text-[var(--text-base)]">nombre de tu plantilla ya aprobada</strong> y
        las variables viajan como sus parámetros, en el orden que ves en los chips.
      </GlassCard>

      <div className="grid grid-cols-12 gap-4">
        {messages.map((m) => {
          const v = value(m);
          const dirty = Boolean(draft[m.occasion]);
          return (
            <GlassCard key={m.occasion} className="col-span-12 xl:col-span-6 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text-base)]">{m.label}</h3>
                  <p className="text-xs text-[var(--text-muted)]">{m.description}</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={v.is_active}
                    onChange={(e) => patch(m, { is_active: e.target.checked })}
                    className="accent-[var(--color-primary)]"
                  />
                  {v.is_active ? "Activo" : "Apagado"}
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {m.variables.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => patch(m, { body: `${v.body}{${variable}}` })}
                    className="rounded-full border border-[var(--border-base)] px-2 py-0.5 text-[11px] font-mono text-[var(--color-primary-ink)] hover:bg-[var(--bg-muted)] transition-colors"
                  >
                    {`{${variable}}`}
                  </button>
                ))}
              </div>

              <textarea
                value={v.body}
                onChange={(e) => patch(m, { body: e.target.value })}
                rows={3}
                maxLength={2000}
                disabled={!v.is_active}
                className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-base)] disabled:opacity-50"
              />

              <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
                <span className="font-semibold">Así se ve: </span>
                {preview(v.body) || "—"}
              </div>

              {m.whatsapp && (
                <FormField
                  label="Plantilla aprobada en tu WhatsApp Business"
                  hint="El nombre exacto que registraste en Meta. Si lo dejas vacío, esta ocasión solo notifica dentro de la app."
                >
                  <Input
                    value={v.meta_template_name ?? ""}
                    onChange={(e) => patch(m, { meta_template_name: e.target.value })}
                    placeholder="recordatorio_vencimiento"
                    className="font-mono text-xs"
                  />
                </FormField>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => save(m)}
                  disabled={!dirty}
                  isLoading={saving === m.occasion}
                >
                  Guardar
                </Button>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── Anuncios ───────────────────────────

function AnnouncementsTab({
  segments, rows, onSent, token,
}: { segments: Segment[]; rows: AnnouncementRow[]; onSent: () => void; token?: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState("");
  const [metaTemplate, setMetaTemplate] = useState("");
  const [audience, setAudience] = useState<{ total: number; with_phone: number; without_phone: number } | null>(null);
  const [sending, setSending] = useState(false);
  // La clave nace al abrir el diálogo: un doble clic en "Enviar" mandaría el
  // anuncio dos veces a todo el gym, y eso no se puede deshacer.
  const sendKey = useRef(newIdempotencyKey());

  const chosen = useMemo(() => segments.find((s) => s.key === segment), [segments, segment]);

  useEffect(() => {
    if (!token || !segment) { setAudience(null); return; }
    let cancelled = false;
    apiClient(token)
      .post("/api/v1/messages/announcements/audience", { segment })
      .then((r) => { if (!cancelled) setAudience(r.data); })
      .catch(() => { if (!cancelled) setAudience(null); });
    return () => { cancelled = true; };
  }, [token, segment]);

  const send = async () => {
    if (!token) return;
    setSending(true);
    try {
      const client = apiClient(token);
      await postOnce(client, "/api/v1/messages/announcements", {
        title: title.trim(),
        body: body.trim(),
        segment,
        meta_template_name: metaTemplate.trim() || null,
      }, sendKey);
      toast.success(`Anuncio encolado para ${audience?.total ?? 0} socios`);
      setOpen(false);
      setTitle(""); setBody(""); setSegment(""); setMetaTemplate(""); setAudience(null);
      onSent();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "No se pudo enviar el anuncio");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <p className="text-sm text-[var(--text-muted)]">
          Un mensaje tuyo a un grupo de socios: cierre por festivo, clase nueva, promoción.
        </p>
        <Button type="button" onClick={() => setOpen(true)}>
          <Megaphone className="h-4 w-4 mr-1.5" />
          Nuevo anuncio
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10 text-[var(--color-primary-ink)]" />}
          title="Aún no has enviado anuncios"
          description="Escribe uno y elige a quién le llega. Antes de enviarlo te decimos a cuántos socios."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((a) => (
            <GlassCard key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-base)]">{a.title}</p>
                  <p className="text-sm text-[var(--text-muted)] mt-0.5">{a.body}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[var(--text-base)] font-mono">{a.recipients}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">socios</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3 text-[11px] text-[var(--text-muted)] flex-wrap">
                <StatusBadge status={a.segment} label={a.segment_label} tone="info" />
                {a.meta_template_name && (
                  <span className="font-mono">WhatsApp · {a.meta_template_name}</span>
                )}
                <span>{a.sent_at ? formatDateTime(a.sent_at) : "—"}</span>
                <span>por {a.sent_by_name}</span>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Nuevo anuncio"
        description="Se guarda como aviso dentro de la app para cada socio del grupo. Si registras una plantilla aprobada, además sale por WhatsApp."
        onSubmit={send}
        submitLabel={audience ? `Enviar a ${audience.total}` : "Enviar"}
        submitting={sending}
        submitDisabled={!title.trim() || !body.trim() || !segment || !audience?.total}
      >
        <FormField label="Título" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cerramos el lunes festivo" />
        </FormField>
        <FormField label="Mensaje" required hint="Puedes usar {nombre} y {gym}.">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Hola {nombre}, este lunes festivo el gym abre de 8am a 2pm."
            className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-base)]"
          />
        </FormField>
        <FormField label="A quién" required>
          <div className="space-y-1.5">
            {segments.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSegment(s.key)}
                disabled={Boolean(s.param)}
                aria-pressed={segment === s.key}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-40",
                  segment === s.key
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)]"
                    : "border-[var(--border-base)] hover:bg-[var(--bg-muted)]"
                )}
              >
                <p className="text-sm font-medium text-[var(--text-base)]">{s.label}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{s.description}</p>
              </button>
            ))}
          </div>
        </FormField>
        {audience && (
          <div className="rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
            Le llega a <strong className="text-[var(--text-base)]">{audience.total}</strong> socios
            {audience.without_phone > 0 && (
              <> · {audience.without_phone} sin teléfono (solo aviso en la app)</>
            )}
          </div>
        )}
        <FormField
          label="Plantilla de WhatsApp (opcional)"
          hint="Déjalo vacío para que el anuncio solo aparezca dentro de la app."
        >
          <Input
            value={metaTemplate}
            onChange={(e) => setMetaTemplate(e.target.value)}
            placeholder="anuncio"
            className="font-mono text-xs"
          />
        </FormField>
      </FormDialog>
    </div>
  );
}

// ─────────────────────────── Envíos ───────────────────────────

function OutboxTab({
  rows, pendientes, onRetried, token,
}: { rows: OutboxRow[]; pendientes: number; onRetried: () => void; token?: string }) {
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (row: OutboxRow) => {
    if (!token) return;
    setRetrying(row.id);
    try {
      await apiClient(token).post(`/api/v1/messages/outbox/${row.id}/retry`);
      toast.success("Vuelve a la cola");
      onRetried();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "No se pudo reintentar");
    } finally {
      setRetrying(null);
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-10 w-10 text-[var(--color-primary-ink)]" />}
        title="Todavía no hay envíos por WhatsApp"
        description="Cuando configures WhatsApp en Configuración › Integraciones, aquí verás qué salió, qué falló y por qué."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm text-[var(--text-muted)] flex-wrap">
        <SlidersHorizontal className="h-4 w-4" />
        {pendientes > 0 ? `${pendientes} en cola` : "Nada en cola"} · el envío corre cada minuto
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const meta = OUTBOX_STATUS[r.status];
          const Icon = meta.icon;
          return (
            <GlassCard key={r.id} className="p-3 flex items-center gap-3 flex-wrap">
              <Icon className={cn("h-4 w-4 shrink-0", r.status === "sent" ? "text-emerald-500" : r.status === "failed" ? "text-red-500" : "text-[var(--text-muted)]")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text-base)] truncate">
                  {r.member_name ?? "Sin socio"}
                  {r.recipient_phone && (
                    <span className="text-[var(--text-muted)] font-mono text-xs ml-2">{r.recipient_phone}</span>
                  )}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {r.template_name ?? r.event_type}
                  {r.last_error && <span className="text-amber-600 dark:text-amber-400"> · {r.last_error}</span>}
                </p>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] shrink-0 text-right">
                <StatusBadge status={r.status} label={meta.label} tone={meta.tone} />
                <p className="mt-0.5">{formatDateTime(r.sent_at ?? r.scheduled_for)}</p>
              </div>
              {(r.status === "failed" || r.status === "skipped") && r.recipient_phone && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => retry(r)}
                  isLoading={retrying === r.id}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reintentar
                </Button>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
