"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { gymWeekday, parseDateOnly, toISODate, todayISO } from "@/lib/format";

/** Las tres listas operativas del día (`GET /dashboard/operations`). */
export interface OperationsData {
  expiring_this_week: {
    membership_id: string; member_id: string; member_name: string;
    phone: string | null; plan_name: string; end_date: string; days_left: number;
  }[];
  in_grace: {
    membership_id: string; member_id: string; member_name: string;
    phone: string | null; plan_name: string; end_date: string; days_overdue: number;
  }[];
  denied_today: {
    checkin_id: string; member_id: string; member_name: string;
    reason: string | null; at: string;
  }[];
  grace_days: number;
}

export interface ShiftInfo {
  open: boolean;
  cash_shifts_enabled?: boolean;
  shift?: { id: string; opening_amount: number; opened_at: string } | null;
}

export interface ForecastData {
  month_to_date: number;
  elapsed_days: number;
  days_in_month: number;
  projection: number;
  projection_low: number;
  projection_high: number;
  avg_previous_months: number | null;
  vs_previous_pct: number | null;
  method: "modelo" | "reglas";
}

export interface ChurnRiskRow {
  member_id: string;
  full_name: string;
  score: number;
  level: "alto" | "medio" | "bajo";
  reasons: string[];
  plan_name: string | null;
  method?: "modelo" | "reglas";
}

export interface CashTotals {
  total: number; count: number;
  by_method: Record<string, number>;
  by_kind: Record<string, number>;
  pending_transfers: { count: number; amount: number };
}

export interface RecentPayment {
  id: string;
  created_at: string;
  concept: string | null;
  kind: string;
  method: string;
  status: string;
  amount: number | string;
  refunded_amount?: number | string;
  member_name: string | null;
}

export interface DashboardData {
  kpis: {
    total_members: number;
    active_members: number;
    expiring_memberships_7d: number;
    machines_total: number;
    machines_maintenance: number;
    machines_active: number;
  } | null;
  /** Lo cobrado por mes (últimos seis, el actual al final). */
  revenueHistory: { month: string; amount: number }[];
  cash: CashTotals | null;
  /** Lo cobrado en lo que va del mes, con el mismo desglose que `cash`. */
  cashMonth: CashTotals | null;
  /** Los últimos movimientos de hoy, el más reciente primero. */
  recentPayments: RecentPayment[];
  pendingTransfers: {
    id: string; transfer_reference: string | null;
    member_name: string | null; amount: number; elapsed_minutes: number;
  }[];
  receivables: { member_id: string; amount_due: number | null; days_overdue: number }[];
  todayClasses: Record<string, unknown>[];
  operations: OperationsData | null;
  shift: ShiftInfo | null;
  lowStock: { id: string; name: string; stock: number; low_stock_threshold: number }[];
  checkinsToday: {
    id: string; member_name: string | null; decision: string | null; created_at: string;
  }[];
  birthdaysToday: { full_name: string; phone: string | null; days_until: number }[];
  insights: { tone: "positive" | "negative" | "warning"; text: string; href?: string }[];
  /** Aforo esperado por día de la semana y hora, entrenado con el historial del gym. */
  occupancy: { status: string; result: { cells: { weekday: number; hour: number; count: number }[] } | null } | null;
  forecast: ForecastData | null;
  /** Ingresos de los últimos 7 días más hoy, en orden. */
  revenueDaily: { date: string; amount: number }[];
  churnRisk: ChurnRiskRow[];
  plans: { id: string; name: string; price: number; duration_days: number }[];
  /** Qué bloques no se pudieron cargar. Una tarjeta que falló NO puede decir
   *  "nadie debe nada": eso es afirmar algo que no se comprobó. */
  failed: Set<keyof DashboardData>;
}

const EMPTY: DashboardData = {
  kpis: null, revenueHistory: [], cash: null, cashMonth: null, recentPayments: [], pendingTransfers: [], receivables: [], todayClasses: [],
  operations: null, shift: null, lowStock: [], checkinsToday: [], birthdaysToday: [],
  insights: [], occupancy: null, forecast: null, revenueDaily: [], churnRisk: [], plans: [],
  failed: new Set(),
};

/**
 * Todo el panel en UNA espera.
 *
 * Antes cada tarjeta pedía lo suyo por su cuenta, así que la página se
 * REORDENABA sola mientras cargaba. Con una sola espera, o está el esqueleto o
 * está el panel.
 *
 * Ninguna petición puede tumbar el panel entero: recepción no tiene permiso
 * para ver caja ni reportes, y con un `Promise.all` estricto su panel quedaba
 * en "Error cargando datos".
 */
export function useDashboardData() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = session?.accessToken as string | undefined;

  useEffect(() => {
    if (status !== "authenticated" || !token) {
      if (status === "unauthenticated") setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const client = apiClient(token);
    const failed = new Set<keyof DashboardData>();

    // Lo que el rol no puede ver ni se pide: un 403 esperado no es un fallo.
    const granted: string[] = session?.permissions ?? [];
    const NEEDS: Partial<Record<keyof DashboardData, string>> = {
      cash: "payments.read",
      recentPayments: "payments.read",
      receivables: "payments.read",
      kpis: "reports.read",
      birthdaysToday: "reports.read",
      occupancy: "reports.read",
      forecast: "reports.read",
      revenueDaily: "reports.read",
      churnRisk: "reports.read",
      plans: "plans.read",
    };

    const pull = <K extends keyof DashboardData, T>(
      key: K, url: string, fallback: T, params?: object
    ): Promise<T> =>
      NEEDS[key] && !granted.includes(NEEDS[key]!) ? Promise.resolve(fallback) : client
        .get(url, { signal: controller.signal, ...(params ? { params } : {}) })
        .then((r) => r.data as T)
        .catch((err) => {
          if (err?.code !== "ERR_CANCELED") {
            failed.add(key);
            console.warn(`[panel] ${url} falló`, err?.response?.status ?? err?.code ?? err);
          }
          return fallback;
        });

    const weekAgo = parseDateOnly(todayISO());
    weekAgo.setDate(weekAgo.getDate() - 7);

    Promise.all([
      pull("kpis", "/api/v1/dashboard/kpis", null as { kpis: DashboardData["kpis"]; revenue_history?: { month: string; amount: number | string }[] } | null),
      pull("cash", "/api/v1/payments/cash", null as { today: CashTotals; month?: CashTotals } | null),
      pull("pendingTransfers", "/api/v1/payments/pending-transfers", [] as DashboardData["pendingTransfers"]),
      pull("receivables", "/api/v1/payments/receivables", [] as DashboardData["receivables"]),
      pull("todayClasses", "/api/v1/classes", [] as Record<string, unknown>[], { is_active: true, limit: 50 }),
      pull("operations", "/api/v1/dashboard/operations", null as OperationsData | null),
      pull("shift", "/api/v1/cash/shifts/current", null as ShiftInfo | null),
      pull("lowStock", "/api/v1/products", [] as DashboardData["lowStock"], { low_stock: true }),
      pull("checkinsToday", "/api/v1/checkins/today", [] as DashboardData["checkinsToday"]),
      pull("birthdaysToday", "/api/v1/reports/birthdays", [] as DashboardData["birthdaysToday"]),
      pull("insights", "/api/v1/dashboard/insights", { insights: [] } as { insights: DashboardData["insights"] }),
      pull("occupancy", "/api/v1/insights/occupancy", null as DashboardData["occupancy"]),
      pull("forecast", "/api/v1/insights/forecast", null as ForecastData | null),
      pull("revenueDaily", "/api/v1/reports/revenue-daily", [] as DashboardData["revenueDaily"], { from: toISODate(weekAgo), to: todayISO() }),
      pull("churnRisk", "/api/v1/insights/churn-risk", [] as ChurnRiskRow[], { limit: 200 }),
      pull("plans", "/api/v1/member-plans/", [] as DashboardData["plans"]),
      pull("recentPayments", "/api/v1/payments", [] as RecentPayment[], { from: todayISO(), to: todayISO(), limit: 8 }),
    ])
      .then(([kpis, cash, pending, receivables, classes, operations, shift, lowStock, checkins, birthdays, insights, occupancy, forecast, revenueDaily, churnRisk, plans, recentPayments]) => {
        if (cancelled) return;
        const hoy = gymWeekday();
        setData({
          kpis: kpis?.kpis ?? null,
          revenueHistory: (kpis?.revenue_history ?? []).map((r) => ({ month: r.month, amount: Number(r.amount) })),
          cash: cash?.today ?? null,
          cashMonth: cash?.month ?? null,
          recentPayments,
          pendingTransfers: pending,
          receivables,
          todayClasses: classes.filter(
            (cl) => Array.isArray(cl.weekdays) && (cl.weekdays as number[]).includes(hoy)
          ),
          operations,
          shift,
          lowStock,
          checkinsToday: checkins,
          birthdaysToday: birthdays.filter((b) => b.days_until === 0),
          insights: insights.insights ?? [],
          occupancy,
          forecast,
          revenueDaily: revenueDaily.map((d) => ({ date: d.date, amount: Number(d.amount) })),
          churnRisk,
          plans: plans.map((p) => ({ ...p, price: Number(p.price) })),
          failed,
        });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(parseApiError(err, "Error cargando el panel"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, status]);

  return { data, loading, error };
}
