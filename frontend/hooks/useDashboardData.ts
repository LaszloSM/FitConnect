"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { gymWeekday } from "@/lib/format";

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

export interface DashboardData {
  kpis: {
    expiring_memberships_7d: number;
    machines_total: number;
    machines_maintenance: number;
    machines_active: number;
  } | null;
  cash: {
    total: number; count: number;
    by_method: Record<string, number>;
    by_kind: Record<string, number>;
    pending_transfers: { count: number; amount: number };
  } | null;
  pendingTransfers: {
    id: string; transfer_reference: string | null;
    member_name: string | null; amount: number; elapsed_minutes: number;
  }[];
  receivables: { member_id: string; amount_due: number }[];
  todayClasses: Record<string, unknown>[];
  operations: OperationsData | null;
  shift: ShiftInfo | null;
  lowStock: { id: string; name: string; stock: number; low_stock_threshold: number }[];
  checkinsToday: {
    id: string; member_name: string | null; decision: string | null; created_at: string;
  }[];
  birthdaysToday: { full_name: string; phone: string | null; days_until: number }[];
  insights: { tone: "positive" | "negative" | "warning"; text: string; href?: string }[];
  /** Qué bloques no se pudieron cargar. Una tarjeta que falló NO puede decir
   *  "nadie debe nada": eso es afirmar algo que no se comprobó. */
  failed: Set<keyof DashboardData>;
}

const EMPTY: DashboardData = {
  kpis: null, cash: null, pendingTransfers: [], receivables: [], todayClasses: [],
  operations: null, shift: null, lowStock: [], checkinsToday: [], birthdaysToday: [],
  insights: [], failed: new Set(),
};

/**
 * Todo el panel en UNA espera.
 *
 * Antes cada tarjeta pedía lo suyo por su cuenta —once peticiones repartidas en
 * cuatro componentes, cada una con su propio `setState`— así que la página se
 * REORDENABA sola mientras cargaba: el usuario veía saltar los bloques durante
 * un segundo largo. Con una sola espera, o está el esqueleto o está el panel.
 *
 * Ninguna petición puede tumbar el panel entero: recepción no tiene permiso
 * para ver caja ni reportes, y con un `Promise.all` estricto su panel quedaba
 * en "Error cargando datos" — sin check-ins, sin listas, sin nada.
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

    // Cada fuente cae a su propio vacío y deja constancia de que falló.
    const pull = <K extends keyof DashboardData, T>(
      key: K, url: string, fallback: T, params?: object
    ): Promise<T> =>
      client
        .get(url, { signal: controller.signal, ...(params ? { params } : {}) })
        .then((r) => r.data as T)
        .catch((err) => {
          if (err?.code !== "ERR_CANCELED") {
            failed.add(key);
            console.warn(`[panel] ${url} falló`, err?.response?.status ?? err?.code ?? err);
          }
          return fallback;
        });

    Promise.all([
      pull("kpis", "/api/v1/dashboard/kpis", null as { kpis: DashboardData["kpis"] } | null),
      pull("cash", "/api/v1/payments/cash", null as { today: DashboardData["cash"] } | null),
      pull("pendingTransfers", "/api/v1/payments/pending-transfers", [] as DashboardData["pendingTransfers"]),
      pull("receivables", "/api/v1/payments/receivables", [] as DashboardData["receivables"]),
      pull("todayClasses", "/api/v1/classes", [] as Record<string, unknown>[], { is_active: true, limit: 50 }),
      pull("operations", "/api/v1/dashboard/operations", null as OperationsData | null),
      pull("shift", "/api/v1/cash/shifts/current", null as ShiftInfo | null),
      pull("lowStock", "/api/v1/products", [] as DashboardData["lowStock"], { low_stock: true }),
      pull("checkinsToday", "/api/v1/checkins/today", [] as DashboardData["checkinsToday"]),
      pull("birthdaysToday", "/api/v1/reports/birthdays", [] as DashboardData["birthdaysToday"]),
      pull("insights", "/api/v1/dashboard/insights", { insights: [] } as { insights: DashboardData["insights"] }),
    ])
      .then(([kpis, cash, pending, receivables, classes, operations, shift, lowStock, checkins, birthdays, insights]) => {
        if (cancelled) return;
        const hoy = gymWeekday();
        setData({
          kpis: kpis?.kpis ?? null,
          cash: cash?.today ?? null,
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
