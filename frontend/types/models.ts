// Tipos de dominio compartidos — única fuente de verdad para el frontend.
// Reemplazan las interfaces inline duplicadas en cada *Client.tsx.

export type MembershipStatus = "ok" | "expired" | "no_membership";
export type MembershipEffectiveStatus = "active" | "expired" | "cancelled";
export type MemberStatus = "active" | "inactive";
export type PaymentMethod = "cash" | "transfer" | "card" | "wompi";
export type PaymentStatus = "paid" | "pending" | "failed" | "refunded";

export interface Member {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: MemberStatus;
  qr_code: string;
  membership_status?: "active" | "expired" | "none" | null;
  membership_end_date?: string | null;
  membership_plan_name?: string | null;
}

export interface Membership {
  id: string;
  member_id: string;
  plan_name: string;
  price: number;
  start_date: string;
  end_date: string;
  duration_days: number;
  status: string;
  effective_status?: MembershipEffectiveStatus | null;
  notes?: string | null;
}

export interface Payment {
  id: string;
  member_id: string;
  membership_id: string | null;
  amount: number;
  method: PaymentMethod | null;
  status: PaymentStatus;
  concept: string;
  external_ref: string | null;
  created_at: string;
}

export interface CheckIn {
  id: string;
  member_id: string;
  member_name?: string | null;
  notes: string | null;
  created_at: string;
}

export interface CheckinResult {
  member_name: string | null;
  membership_status: MembershipStatus;
  created_at: string;
}
