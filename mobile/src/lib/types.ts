/** Contrato con /api/v1/me (backend/app/api/v1/me.py). */

export interface GymRef {
  link_id: string;
  gym_name: string;
  slug: string;
  logo_url: string | null;
  city: string | null;
  app_enabled: boolean;
}

export interface Profile {
  birth_date: string | null;
  sex: "female" | "male" | "other" | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: "lose_fat" | "gain_muscle" | "maintain" | "performance" | "health" | null;
  activity_level: string | null;
}

export interface Me {
  user: { id: string; email: string; full_name: string | null; created_at: string };
  profile: Profile;
  consents: Record<"health" | "notifications", boolean>;
  consent_labels: Record<string, string>;
  gyms: GymRef[];
}

export type MembershipStatus = "ok" | "in_grace" | "scheduled" | "expired" | "frozen" | "no_entries" | "no_membership";

export interface QrInfo {
  secret: string;
  prefix: string;
  ref: string;
  period: number;
  digits: number;
}

export interface GymSummary {
  gym: GymRef & { address: string | null; phone: string | null };
  member: { first_name: string; full_name: string };
  membership: {
    status: MembershipStatus;
    status_label: string;
    can_enter: boolean;
    plan_name: string | null;
    end_date: string | null;
    days_left: number | null;
    entries_left: number | null;
  };
  occupancy: { recent_entries: number; window_minutes: number };
  profile: { complete: boolean; percent: number; missing: string[] };
  next_bookings: { booking_id: string; session_id: string; class_name: string; status: string; session_date: string; start_time: string }[];
  qr: QrInfo;
}

export interface ClassItem {
  session_id: string;
  class_name: string;
  instructor: string | null;
  color: string | null;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  booked: number;
  spots_left: number;
  my_booking: { booking_id: string; status: "booked" | "waitlisted"; waitlist_position: number | null } | null;
}

export interface RoutineExercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes: string | null;
}

export interface Routine {
  id: string;
  name: string;
  goal_label: string | null;
  level_es: string;
  days: { id: string; day_index: number; title: string; notes: string | null; exercises: RoutineExercise[] }[];
}

export interface WorkoutSet {
  reps: number | null;
  weight_kg: number | null;
  done: boolean;
}

export interface WorkoutEntry {
  exercise_id: string | null;
  exercise_name: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  source: "free" | "gym_routine";
  routine_ref: Record<string, unknown> | null;
  entries: WorkoutEntry[];
  notes: string | null;
}

export interface ProgressItem {
  exercise_id: string | null;
  exercise_name: string;
  sessions: number;
  best_kg: number | null;
  last_kg: number | null;
  series: { date: string; kg: number }[];
}

export interface Payment {
  id: string;
  date: string;
  concept: string;
  amount: number;
  refunded: number;
  method: string;
  status: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  description: string | null;
  entries_total: number | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  sent_at: string;
}
