import { cn } from "@/lib/utils";

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "violet"
  | "fuchsia";

const TONE_CLS: Record<StatusTone, string> = {
  success:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50",
  warning:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50",
  danger:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50",
  info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900/50",
  neutral:
    "bg-[var(--bg-muted)] text-[var(--text-muted)] border-[var(--border-base)]",
  violet:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/50",
  fuchsia:
    "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-400 dark:border-fuchsia-900/50",
};

const STATUS_PRESETS: Record<string, { label: string; tone: StatusTone }> = {
  // Membresías / miembros
  active: { label: "Activa", tone: "success" },
  scheduled: { label: "Programada", tone: "violet" },
  in_grace: { label: "En gracia", tone: "warning" },
  frozen: { label: "Congelada", tone: "info" },
  expired: { label: "Vencida", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  none: { label: "Sin membresía", tone: "neutral" },
  inactive: { label: "Inactivo", tone: "neutral" },
  // Pagos
  paid: { label: "Pagado", tone: "success" },
  pending: { label: "Pendiente", tone: "warning" },
  failed: { label: "Fallido", tone: "danger" },
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
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE_CLS[resolvedTone],
        className
      )}
    >
      {resolvedLabel}
    </span>
  );
}
