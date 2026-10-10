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
  pace: Pace | null;
}

export interface Me {
  user: { id: string; email: string; full_name: string | null; created_at: string };
  profile: Profile;
  consents: Record<"health" | "notifications" | "ai_plans", boolean>;
  consent_labels: Record<string, string>;
  gyms: GymRef[];
}

export type MembershipStatus = "ok" | "in_grace" | "scheduled" | "expired" | "frozen" | "no_entries" | "no_membership";

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

export type NutrientKey =
  | "sugars_g" | "sat_fat_g" | "sodium_mg" | "potassium_mg" | "calcium_mg" | "iron_mg"
  | "vit_c_mg" | "vit_a_ug" | "vit_d_ug" | "vit_b12_ug" | "cholesterol_mg";

export type Nutrients = Partial<Record<NutrientKey, number>>;

export interface Targets {
  bmr: number;
  tdee: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  water_ml: number;
  clamped: boolean;
  weekly_change_kg: number;
  too_fast: boolean;
  pace: Pace | null;
  pace_label: string | null;
  micro: Partial<Record<NutrientKey, { value: number; kind: "min" | "max" }>>;
}

export type Pace = "gentle" | "moderate" | "aggressive" | "lean" | "standard";

export interface TargetsResponse {
  available: boolean;
  reason?: "consent" | "missing" | "age";
  message?: string;
  missing?: string[];
  targets?: Targets;
  notice?: string;
  references?: string[];
  clamped_message?: string | null;
  pace_note?: string | null;
  activity_labels: Record<string, string>;
  pace_options: Record<"lose_fat" | "gain_muscle", Pace[]>;
  pace_labels: Record<Pace, string>;
  nutrient_labels: Record<NutrientKey, [string, string]>;
}

export interface Portion {
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  brand: string | null;
  source: "reference" | "openfoodfacts" | "custom" | "recipe";
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  portions: Portion[];
  nutrients: Nutrients;
  category: string | null;
  category_label: string | null;
  origin: string | null;
  mine: boolean;
  favorite?: boolean;
  components: { food_id: string; name: string; grams: number }[] | null;
  warning?: string | null;
}

export type MealKey = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealEntry {
  id: string;
  day: string;
  meal: MealKey;
  food_id: string | null;
  food_name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  nutrients: Nutrients;
  pending?: boolean;
}

export interface DayTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  nutrients: Partial<Record<NutrientKey, { value: number; complete: boolean }>>;
}

export interface DayMeals {
  day: string;
  meals: Record<MealKey, string>;
  entries: MealEntry[];
  totals: DayTotals;
}

export interface WeekSummary {
  start: string;
  end: string;
  days: { day: string; logged: boolean; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }[];
  average: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
  target: Targets | null;
}

export interface TrainingPlanData {
  notes: string | null;
  engine?: "ai" | "auto";
  days: { weekday: number; title: string; exercises: { name: string; sets: number; reps: string; rest_seconds: number; notes: string | null }[] }[];
}

export interface PlanItem {
  food_id: string;
  food: string;
  grams: number;
  portion: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface MacroTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface MealPlanData {
  notes: string | null;
  engine?: "ai" | "auto";
  meals: ({ time: string; name: string; items: PlanItem[] } & MacroTotals)[];
  totals: MacroTotals;
  targets: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
}

export type SavedPlan =
  | { id: string; kind: "training"; title: string; data: TrainingPlanData; active: boolean; created_at: string }
  | { id: string; kind: "meals"; title: string; data: MealPlanData; active: boolean; created_at: string };

export interface Credits {
  balance: number;
  weekly_free: number;
  next_refill: string;
  history: { kind: string; label: string; amount: number; at: string }[];
}

export interface PlanOptions {
  ai_available: boolean;
  ai_consent: boolean;
  credits: Credits;
  meals_blocked: string | null;
  training_blocked: string | null;
  restriction_labels: Record<Restriction, string>;
  parq_flag: boolean;
  targets: Targets | null;
}

export type Restriction = "vegetarian" | "no_dairy" | "no_pork" | "no_fish";

export interface PlanJob {
  id: string;
  kind: "meals" | "training";
  status: "queued" | "running" | "done" | "failed";
  engine: "ai" | "auto" | null;
  position: number | null;
  message: string | null;
  plan: SavedPlan | null;
}

export interface WeightPoint {
  day: string;
  weight_kg: number;
}
