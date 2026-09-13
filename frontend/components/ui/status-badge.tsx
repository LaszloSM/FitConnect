import { cn } from "@/lib/utils";

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  // Se conservan por compatibilidad: en Tiza los estados sin carga semántica
  // ("programada") son neutros o informativos, no colores sueltos.
  | "violet"
  | "fuchsia";

const TONE_VAR: Record<StatusTone, { tinta: string; fondo: string; linea: string }> = {
  success: { tinta: "--signal-ok", fondo: "--signal-ok-bg", linea: "--signal-ok-line" },
  warning: { tinta: "--signal-warn", fondo: "--signal-warn-bg", linea: "--signal-warn-line" },
  danger: { tinta: "--signal-danger", fondo: "--signal-danger-bg", linea: "--signal-danger-line" },
  info: { tinta: "--signal-info", fondo: "--signal-info-bg", linea: "--signal-info-line" },
  neutral: { tinta: "--text-muted", fondo: "--bg-muted", linea: "--border-base" },
  violet: { tinta: "--signal-info", fondo: "--signal-info-bg", linea: "--signal-info-line" },
  fuchsia: { tinta: "--text-muted", fondo: "--bg-muted", linea: "--border-base" },
};

const STATUS_PRESETS: Record<string, { label: string; tone: StatusTone }> = {
  // Membresías / miembros
  active: { label: "Activa", tone: "success" },
  scheduled: { label: "Programada", tone: "info" },
  in_grace: { label: "En gracia", tone: "warning" },
  frozen: { label: "Congelada", tone: "info" },
  expired: { label: "Vencida", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  none: { label: "Sin membresía", tone: "neutral" },
  inactive: { label: "Inactivo", tone: "neutral" },
  // Pagos
  paid: { label: "Pagado", tone: "success" },
  pending: { label: "Pendiente", tone: "warning" },
  failed: { label: "Rechazado", tone: "danger" },
  voided: { label: "Anulado", tone: "neutral" },
  refunded: { label: "Reembolsado", tone: "neutral" },
  // Check-ins
  allowed: { label: "Permitido", tone: "success" },
  denied: { label: "Denegado", tone: "danger" },
  override: { label: "Autorizado", tone: "warning" },
  // Máquinas
  operational: { label: "Operativa", tone: "success" },
  maintenance: { label: "Mantenimiento", tone: "warning" },
  out_of_service: { label: "Fuera de servicio", tone: "danger" },
  // Caja
  open: { label: "Abierto", tone: "success" },
  closed: { label: "Cerrado", tone: "neutral" },
};

interface StatusBadgeProps {
  status: string;
  /** Sobrescribe el texto del preset (p.ej. "Vencida hace 3 días"). */
  label?: string;
  /** Sobrescribe el tono del preset para estados no mapeados. */
  tone?: StatusTone;
  className?: string;
}

export function StatusBadge({ status, label, tone, className }: StatusBadgeProps) {
  const preset = STATUS_PRESETS[status];
  const resolvedTone = tone ?? preset?.tone ?? "neutral";
  const resolvedLabel = label ?? preset?.label ?? status;
  const v = TONE_VAR[resolvedTone];
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border px-2 text-xs font-medium",
        className
      )}
      style={{ color: `var(${v.tinta})`, background: `var(${v.fondo})`, borderColor: `var(${v.linea})` }}
    >
      {/* El punto repite el estado en forma, no solo en color. */}
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {resolvedLabel}
    </span>
  );
}
