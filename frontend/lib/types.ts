// Tipos centralizados para todas las respuestas de la API.
// Los Client Components importan desde aquí — no definen interfaces locales.

export type MemberStatus = "active" | "inactive";
export type IdType = "CC" | "NIT" | "CE" | "PP" | "TI";
export type Gender = "M" | "F" | "other";
export type TrainingGoal =
  | "weight_loss"
  | "muscle_gain"
  | "endurance"
  | "flexibility"
  | "general_fitness";
export type BloodType = "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-";

export interface Member {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  id_type: IdType | null;
  id_number: string | null;
  gender: Gender | null;
  birth_date: string | null;
  address: string | null;
  city: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_type: BloodType | null;
  photo_url: string | null;
  parq_answers: Record<string, boolean> | null;
  parq_completed_at: string | null;
  training_goal: TrainingGoal | null;
  qr_code: string | null;
  status: MemberStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = "cash" | "transfer" | "card" | "wompi";
export type PaymentStatus = "paid" | "pending" | "failed" | "refunded";

export interface Payment {
  id: string;
  member_id: string;
  membership_id: string | null;
  amount: string; // Decimal serializado como string por FastAPI
  method: PaymentMethod | null;
  status: PaymentStatus;
  concept: string;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
}

export type MembershipStatus = "active" | "expired" | "cancelled";

export interface Membership {
  id: string;
  member_id: string;
  plan_name: string;
  price: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  status: MembershipStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CheckInType = "entry" | "exit";
export type CheckInMembershipStatus = "ok" | "expired" | "no_membership";

export interface CheckIn {
  id: string;
  member_id: string;
  location_id: string | null;
  type: CheckInType;
  notes: string | null;
  membership_status: CheckInMembershipStatus | null;
  created_at: string;
  updated_at: string;
}

export type ClassCategory =
  | "yoga" | "crossfit" | "spinning" | "pilates"
  | "funcional" | "zumba" | "boxeo" | "natacion" | "otro";
export type ClassDifficulty = "beginner" | "intermediate" | "advanced";

export interface GymClass {
  id: string;
  name: string;
  instructor: string;
  schedule: string | null;
  weekdays: number[] | null;
  start_time: string | null;
  category: ClassCategory | null;
  difficulty: ClassDifficulty | null;
  color: string | null;
  max_capacity: number;
  duration_minutes: number;
  location_id: string | null;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type MachineStatus = "active" | "maintenance" | "damaged" | "retired";

export interface Machine {
  id: string;
  name: string;
  brand: string | null;
  serial_number: string | null;
  location_id: string | null;
  status: MachineStatus;
  notes: string | null;
  area: string | null;
  purchase_date: string | null;
  purchase_cost: string | null;
  warranty_expiry: string | null;
  next_maintenance_date: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberPlan {
  id: string;
  name: string;
  price: string;
  duration_days: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardKPIs {
  total_members: number;
  active_members: number;
  inactive_members: number;
  new_members_this_month: number;
  total_payments_month: string;
  pending_payments_month: string;
  checkins_today: number;
  expiring_memberships_7d: number;
}

export interface DashboardOverview {
  kpis: DashboardKPIs;
  member_growth: { month: string; count: number }[];
  revenue_history: { month: string; amount: string }[];
}

export type UserRole = "owner" | "admin" | "receptionist";

export interface UserStaff {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export type SubscriptionPlan = "basic" | "advanced" | "premium_ai";

export interface GymSettings {
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  logo_url: string | null;
  plan: SubscriptionPlan | null;
  operating_hours?: Record<string, { active: boolean; open: string; close: string }>;
}

// API error response shape (FastAPI)
export interface ApiError {
  detail: string | { loc: string[]; msg: string; type: string }[];
}
