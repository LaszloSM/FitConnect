"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { useApiResource } from "@/hooks/useApiResource";
import { MessageSquare, Loader2, Check } from "lucide-react";

interface Message {
  occasion: string;
  label: string;
  variables: string[];
  body: string;
  header_image_url: string | null;
  is_active: boolean;
  meta_status: string;
}

const SAMPLES: Record<string, string> = {
  nombre: "María", plan: "Mensual", fecha: "30/06/2026",
  link: "https://pago.fitconnect.co/abc", gym: "Tu Gimnasio",
};

function renderPreview(body: string): string {
  let out = body;
  for (const [k, v] of Object.entries(SAMPLES)) out = out.replaceAll(`{${k}}`, v);
  return out;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "Borrador", cls: "bg-[var(--bg-muted)] text-[var(--text-muted)]" },
  pending: { text: "En aprobación", cls: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400" },
  approved: { text: "Aprobado", cls: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" },
  rejected: { text: "Rechazado", cls: "bg-red-50 dark:bg-red-950/30 text-red-600" },
};

function MessageCard({ msg, onSaved }: { msg: Message; onSaved: () => void }) {
  const { data: session } = useSession();
  const [body, setBody] = useState(msg.body);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const dirty = body !== msg.body;

  const insertVar = (v: string) => {
    const el = ref.current;
    const token = `{${v}}`;
    if (!el) { setBody((b) => b + token); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  const save = async () => {
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.put(`/api/v1/messages/${msg.occasion}`, {
        body,
        is_active: msg.is_active,
        header_image_url: msg.header_image_url,
      });
      toast.success(`Mensaje de "${msg.label}" guardado`);
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const status = STATUS_LABEL[msg.meta_status] ?? STATUS_LABEL.draft;

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-base)]">{msg.label}</h3>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.cls}`}>{status.text}</span>
      </div>

      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-base)] resize-y focus:outline-none focus:border-[var(--color-primary)]/60"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-[var(--text-muted)]">Insertar:</span>
        {msg.variables.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insertVar(v)}
            className="text-[11px] font-mono px-2 py-0.5 rounded-md border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--color-primary-ink)] hover:border-[var(--color-primary)]/50 transition-colors"
          >
            {`{${v}}`}
          </button>
        ))}
      </div>

      <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Vista previa</p>
        <p className="text-sm text-[var(--text-base)] whitespace-pre-wrap">{renderPreview(body)}</p>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={save}
          disabled={!dirty || saving}
          className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
          Guardar
        </Button>
      </div>
    </GlassCard>
  );
}

export default function MessagesSection() {
  const messages = useApiResource<Message[]>("/api/v1/messages", []);

  useEffect(() => { void messages.refetch(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5">
        <span className="h-9 w-9 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-contrast)] flex items-center justify-center shrink-0">
          <MessageSquare className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-[var(--text-base)]">Mensajes automáticos</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Personaliza el mensaje de cada ocasión. Usa variables como {"{nombre}"} y se reemplazan al enviar.
            Para WhatsApp, los cambios requieren aprobación de Meta antes de enviarse.
          </p>
        </div>
      </div>

      {messages.loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {messages.data.map((m) => (
            <MessageCard key={m.occasion} msg={m} onSaved={() => void messages.refetch()} />
          ))}
        </div>
      )}
    </div>
  );
}
