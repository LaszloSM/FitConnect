export interface Subscription {
  status: string;
  can_write: boolean;
  days_left: number | null;
  trial_ends_at: string | null;
  comp_until: string | null;
  plan: string;
  plan_label: string;
  modules: string[];
}

export interface Metrics {
  members?: number;
  active_members?: number;
  last_checkin?: string | null;
  checkins_30d?: number;
  last_payment?: string | null;
  turnstiles?: number;
  turnstiles_online?: number;
  staff?: number;
  error?: string;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  phone: string | null;
  created_at: string | null;
  owner_email: string | null;
  owner_name: string | null;
  stored_status: string;
  subscription: Subscription;
  comp_reason: string | null;
  internal_notes: string | null;
  modules: Record<string, boolean>;
  monthly_price: number;
  metrics: Metrics | null;
}

export interface TenantDetail extends TenantRow {
  history: { action: string; admin_email: string | null; details: Record<string, unknown>; created_at: string }[];
}

export interface Overview {
  total: number;
  by_status: Record<string, number>;
  mrr_cop: number;
  new_30d: number;
  ending_soon: { id: string; name: string; status: string; days_left: number }[];
}

export const ACTION_LABEL: Record<string, string> = {
  "tenant.trial": "Prueba gratis",
  "tenant.comp": "Cortesía",
  "tenant.update": "Cambio de plan o módulos",
  "tenant.suspend": "Suspendió",
  "tenant.reactivate": "Reactivó",
  "tenant.reset_owner_mfa": "Reinició la verificación del dueño",
  "auth.login": "Entró al panel",
  "auth.logout": "Salió del panel",
  "auth.login_failed": "Contraseña incorrecta",
  "auth.otp_failed": "Código incorrecto",
  "auth.mfa_enabled": "Configuró la app autenticadora",
  "auth.backup_code_used": "Usó un código de respaldo",
  "auth.mfa_reset_console": "App autenticadora reiniciada por consola",
  "admin.create_console": "Cuenta creada por consola",
  "admin.password_console": "Contraseña cambiada por consola",
};

export interface SystemHealth {
  status: "ok" | "degraded";
  dependencies: Record<string, "ok" | "error">;
  scheduler_running: boolean;
  email_configured: boolean;
  mail_backend: string;
  jobs: { name: string; status: string; started_at: string; finished_at: string | null; duration_s: number | null }[];
}
