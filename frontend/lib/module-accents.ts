export type ModuleKey =
  | "dashboard"
  | "members"
  | "checkins"
  | "classes"
  | "machines"
  | "payments"
  | "plans"
  | "reports"
  | "settings";

export type KpiTone =
  | "volt"
  | "teal"
  | "sky"
  | "violet"
  | "amber"
  | "emerald"
  | "fuchsia"
  | "indigo"
  | "slate"
  | "default";

export interface ModuleAccent {
  label: string;
  tone: KpiTone;
  /** CSS variable carrying the solid accent color (see globals.css). */
  cssVar: string;
}

export const MODULE_ACCENTS: Record<ModuleKey, ModuleAccent> = {
  dashboard: { label: "Dashboard", tone: "volt", cssVar: "--accent-dashboard" },
  members: { label: "Miembros", tone: "teal", cssVar: "--accent-members" },
  checkins: { label: "Check-ins", tone: "sky", cssVar: "--accent-checkins" },
  classes: { label: "Clases", tone: "violet", cssVar: "--accent-classes" },
  machines: { label: "Máquinas", tone: "amber", cssVar: "--accent-machines" },
  payments: { label: "Pagos", tone: "emerald", cssVar: "--accent-payments" },
  plans: { label: "Planes", tone: "fuchsia", cssVar: "--accent-plans" },
  reports: { label: "Reportes", tone: "indigo", cssVar: "--accent-reports" },
  settings: { label: "Configuración", tone: "slate", cssVar: "--accent-settings" },
};
