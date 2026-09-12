"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { apiClient } from "@/lib/api";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import type { AuditLogEntry } from "@/lib/types";
import { parseUTC } from "@/lib/format";
import { ScrollText, ShieldAlert, Loader2 } from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";

const ACTION_LABELS: Record<string, string> = {
  // Sincronizado con las llamadas a audit() del backend
  // (tests/test_audit_actions.py falla si divergen).
  "membership.assign": "Asignó membresía",
  "membership.charge": "Cobró renovación",
  "membership.freeze": "Congeló membresía",
  "membership.unfreeze": "Reactivó membresía",
  "membership.cancel": "Canceló membresía",
  "membership.rechain": "Recalculó vigencias tras una reversa",
  "checkin.override": "Autorizó entrada denegada",
  "payment.create": "Registró pago",
  "payment.mark_paid": "Marcó pago como pagado",
  "payment.void": "Anuló pago pendiente",
  "payment.auto_void": "Anuló transferencia vencida (automático)",
  "payment.refund": "Devolvió pago",
  "payment.correction": "Corrigió el monto de un pago",
  "payment.proof": "Adjuntó comprobante",
  "expense.create": "Registró egreso",
  "cash.open": "Abrió caja",
  "cash.close": "Cerró caja",
  "cash.reopen": "Reabrió un turno cerrado",
  "cash.drop": "Retiró efectivo a bóveda",
  "day_pass.sell": "Vendió pase del día",
  "day_pass_type.create": "Creó tipo de pase",
  "plan.create": "Creó plan",
  "plan.update": "Editó plan",
  "plan.archive": "Archivó plan",
  "plan.delete": "Eliminó plan",
  "product.create": "Creó producto",
  "product.update": "Editó producto",
  "product.archive": "Archivó producto",
  "product.delete": "Eliminó producto",
  "stock.movement": "Movimiento de inventario",
  "machine.create": "Registró máquina",
  "machine.update": "Editó máquina",
  "machine.retire": "Retiró máquina (conserva su historial)",
  "machine.delete": "Eliminó máquina",
  "machine.fault_reported": "Reportó una avería",
  "machine.report_link": "Generó el QR de reporte de una máquina",
  "member.convert": "Convirtió visitante en socio",
  "member.consent": "Registró consentimiento",
  "biometric_consent.sign": "Firmó consentimiento biométrico",
  "biometric_consent.revoke": "Revocó consentimiento biométrico",
  "credential.enroll": "Registró credencial de acceso",
  "credential.revoke": "Revocó credencial de acceso",
  "routine.create": "Creó rutina",
  "routine.update": "Editó rutina",
  "routine.archive": "Archivó rutina",
  "routine.assign": "Asignó rutina",
  "exercise.video_upload": "Subió video de ejercicio",
  "exercise.video_delete": "Eliminó video de ejercicio",
  "kiosk.device_create": "Vinculó dispositivo kiosko",
  "kiosk.device_update": "Editó dispositivo kiosko",
  "kiosk.device_regenerate_link": "Regeneró enlace de kiosko",
  "kiosk.device_revoke": "Revocó dispositivo kiosko",
  "staff.invite": "Invitó al equipo",
  "staff.role_change": "Cambió rol del equipo",
  "staff.deactivate": "Quitó acceso al equipo",
  "staff.reactivate": "Devolvió acceso al equipo",
  "staff.teaching_on": "Habilitó a alguien para dictar clases",
  "staff.teaching_off": "Quitó las clases a alguien del equipo",
  "settings.gym": "Editó datos del gimnasio",
  "settings.operations": "Cambió reglas de operación",
  "settings.billing": "Cambió datos de recaudo",
  "settings.integrations": "Cambió integraciones",
  "message.update": "Editó un mensaje automático",
  "message.send": "Envió un mensaje a un socio",
  "message.retry": "Reintentó un envío",
  "announcement.send": "Envió un anuncio",
};

const ACTION_DOT: Record<string, string> = {
  membership: "bg-fuchsia-500",
  checkin: "bg-red-500",
  payment: "bg-emerald-500",
  expense: "bg-emerald-500",
  cash: "bg-amber-500",
  day_pass: "bg-amber-500",
  day_pass_type: "bg-amber-500",
  plan: "bg-fuchsia-500",
  product: "bg-sky-500",
  stock: "bg-sky-500",
  machine: "bg-amber-500",
  member: "bg-teal-500",
  biometric_consent: "bg-teal-500",
  credential: "bg-teal-500",
  routine: "bg-indigo-500",
  exercise: "bg-indigo-500",
  kiosk: "bg-violet-500",
  staff: "bg-violet-500",
  settings: "bg-slate-500",
  message: "bg-sky-500",
  announcement: "bg-sky-500",
};

function dayLabel(date: Date): string {
  if (isToday(date)) return "Hoy";
  if (isYesterday(date)) return "Ayer";
  return format(date, "EEEE d 'de' MMMM", { locale: es });
}

const ACTION_FILTERS = [
  { value: "", label: "Todas las acciones" },
  { value: "membership", label: "Membresías" },
  { value: "payment", label: "Pagos" },
  { value: "checkin", label: "Check-ins" },
  { value: "cash", label: "Caja" },
  { value: "plan", label: "Planes" },
  { value: "staff", label: "Equipo" },
  { value: "settings", label: "Configuración" },
  { value: "message", label: "Mensajes" },
  { value: "announcement", label: "Anuncios" },
];

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function detailsSummary(details: Record<string, unknown> | null): string {
  if (!details) return "";
  const parts: string[] = [];
  if (typeof details.plan_name === "string") parts.push(details.plan_name);
  if (typeof details.reason === "string" && details.reason) parts.push(`motivo: ${details.reason}`);
  if (typeof details.days_applied === "number") parts.push(`${details.days_applied} días aplicados`);
  if (typeof details.price === "string") parts.push(`$${Number(details.price).toLocaleString("es-CO")}`);
  if (typeof details.discount === "string" && details.discount) parts.push(`desc. $${Number(details.discount).toLocaleString("es-CO")}`);
  return parts.join(" · ");
}

export default function AuditClient() {
  const { data: session } = useSession();
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  useEffect(() => {
    if (!session?.accessToken) return;
    setLoading(true);
    const client = apiClient(session.accessToken as string);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (actionFilter) params.set("action", actionFilter);
    client
      .get(`/api/v1/audit?${params}`)
      .then((res) => {
        setItems(res.data.items);
        setTotal(res.data.total);
      })
      .catch((err) => {
        if (err.response?.status === 403) setForbidden(true);
      })
      .finally(() => setLoading(false));
  }, [session?.accessToken, actionFilter, offset]);

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <ShieldAlert className="h-10 w-10 text-[var(--text-muted)]" />
        <p className="text-[var(--text-muted)] text-sm">
          Solo el propietario puede ver el historial de auditoría.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-5"
    >
      <PageHeader
        module="settings"
        title="Auditoría"
        subtitle="Quién hizo qué — acciones sensibles del staff"
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
          className="h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
        >
          {ACTION_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <p className="text-xs text-[var(--text-muted)]">{total} registros</p>
      </div>

      <GlassCard className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <ScrollText className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-[var(--text-muted)] text-sm">Sin registros de auditoría todavía</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(
              items.reduce<Record<string, AuditLogEntry[]>>((acc, entry) => {
                const key = format(parseUTC(entry.created_at), "yyyy-MM-dd");
                (acc[key] ??= []).push(entry);
                return acc;
              }, {})
            ).map(([day, dayItems]) => (
              <div key={day}>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 capitalize">
                  {dayLabel(parseUTC(day + "T12:00:00Z"))}
                </p>
                <div className="relative pl-5 space-y-3">
                  <span className="absolute left-1.5 top-1 bottom-1 w-px bg-[var(--border-base)]" />
                  {dayItems.map((entry) => {
                    const dot = ACTION_DOT[entry.action.split(".")[0]] ?? "bg-slate-400";
                    return (
                      <div key={entry.id} className="relative">
                        <span className={`absolute -left-[0.95rem] top-1.5 h-2 w-2 rounded-full ring-2 ring-[var(--bg-card)] ${dot}`} />
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm text-[var(--text-base)] min-w-0">
                            <span className="font-semibold">{entry.actor_name}</span>{" "}
                            <span className="text-[var(--text-muted)]">{actionLabel(entry.action).toLowerCase()}</span>
                          </p>
                          <p
                            className="text-[11px] text-[var(--text-muted)] shrink-0 tabular-nums"
                            title={formatDistanceToNow(parseUTC(entry.created_at), { addSuffix: true, locale: es })}
                          >
                            {format(parseUTC(entry.created_at), "HH:mm")}
                          </p>
                        </div>
                        {detailsSummary(entry.details) && (
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {detailsSummary(entry.details)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {total > LIMIT && (
          <div className="flex justify-center gap-2 pt-4">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] disabled:opacity-40 transition-colors"
            >
              ← Anterior
            </button>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] disabled:opacity-40 transition-colors"
            >
              Siguiente →
            </button>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
