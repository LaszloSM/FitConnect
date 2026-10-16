export interface Subscription {
  status: string;
  can_write: boolean;
  days_left: number | null;
  trial_ends_at: string | null;
  comp_until: string | null;
  paid_until: string | null;
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
  address: string | null;
  monthly_price: number;
  list_price: number;
  price_cop: number | null;
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
  "tenant.payment": "Registró un pago",
  "tenant.payment_void": "Anuló un pago",
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

export interface SubscriptionPayment {
  id: string;
  amount_cop: number;
  months: number;
  period_start: string;
  period_end: string;
  paid_on: string;
  method: string;
  method_label: string;
  reference: string | null;
  note: string | null;
  plan: string;
  recorded_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface PaymentsResponse {
  items: SubscriptionPayment[];
  paid_until: string | null;
  next_period_start: string;
  monthly_price: number;
  methods: Record<string, string>;
}

export interface Billing {
  collected_month: number;
  collected_12m: number;
  expected_monthly: number;
  series: { month: string; amount_cop: number }[];
  due: { id: string; name: string; status: string; paid_until: string | null; days: number | null; monthly_price: number }[];
  recent: (SubscriptionPayment & { tenant_id: string; tenant: string | null })[];
}
