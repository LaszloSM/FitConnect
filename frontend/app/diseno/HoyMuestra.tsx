"use client";

import { DayCard } from "@/components/dashboard/hoy/DayCard";
import { MoneyStrip } from "@/components/dashboard/hoy/MoneyStrip";
import { ExpiringWeek } from "@/components/dashboard/hoy/ExpiringWeek";
import { RiskBlock } from "@/components/dashboard/hoy/RiskBlock";
import type { TodayEntry } from "@/components/dashboard/LiveNowStrip";
import type { DashboardData } from "@/hooks/useDashboardData";
import { formatDateTime, gymHour, gymWeekday, todayISO } from "@/lib/format";

const TYPICAL: Record<number, number> = { 5: 1.5, 6: 6.5, 7: 6, 8: 3, 9: 1.5, 10: 1, 11: 1, 12: 1.5, 13: 1.5, 14: 1, 15: 1, 16: 2, 17: 4, 18: 6.5, 19: 4.5, 20: 2.5, 21: 1 };
const TODAY: Record<number, number> = { 5: 2, 6: 8, 7: 6, 8: 4, 9: 1, 10: 1, 11: 2, 12: 1, 13: 2, 15: 1, 16: 3, 17: 5, 18: 5, 19: 3, 20: 2 };
const NAMES = ["Sofía Correa", "Mateo Salazar", "Daniela Pineda", "Tomás Gómez", "Laura Mendoza", "Julián Salazar", "Camila Castro", "Nicolás Rojas"];

/** Hora de Bogotá → instante UTC sin zona, como lo devuelve el backend. */
function utcNaive(hour: number, minute: number): string {
  const [y, m, d] = todayISO().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour + 5, minute)).toISOString().slice(0, 19);
}

function sampleEntries(): TodayEntry[] {
  const now = gymHour();
  const nowMinute = Number(formatDateTime(new Date(), "m"));
  const out: TodayEntry[] = [];
  let k = 0;
  for (let h = 5; h <= now; h++) {
    for (let i = 0; i < (TODAY[h] ?? 0); i++) {
      k += 1;
      out.push({
        id: `m-${k}`,
        member_name: NAMES[k % NAMES.length],
        decision: k % 11 === 0 ? "denied" : "allowed",
        created_at: utcNaive(h, h === now ? Math.min(nowMinute, (i * 7) % 55) : (i * 13) % 55),
      });
    }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function sampleData(): DashboardData {
  const weekday = gymWeekday();
  return {
    kpis: { expiring_memberships_7d: 31, machines_total: 12, machines_maintenance: 1, machines_active: 11 },
    cash: { total: 460000, count: 6, by_method: { cash: 180000, card: 190000, transfer: 90000 }, by_kind: {}, pending_transfers: { count: 6, amount: 114000 } },
    pendingTransfers: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, transfer_reference: null, member_name: NAMES[i], amount: 19000, elapsed_minutes: 30 })),
    receivables: [
      ...Array.from({ length: 14 }, (_, i) => ({ member_id: `a${i}`, amount_due: 90000, days_overdue: 3 })),
      ...Array.from({ length: 12 }, (_, i) => ({ member_id: `b${i}`, amount_due: 130000, days_overdue: 20 })),
      ...Array.from({ length: 10 }, (_, i) => ({ member_id: `c${i}`, amount_due: 90000, days_overdue: 45 })),
    ],
    todayClasses: [{ id: "c1" }, { id: "c2" }],
    operations: {
      expiring_this_week: [
        ["Sebastián Mendoza", "Mensual", 0], ["Nicolás Ramírez", "Mensual", 0], ["Ana Correa", "Mensual", 0],
        ["Ana Vargas", "Trimestral", 0], ["Camila Castro", "Mensual", 1], ["Mateo Salazar", "Mensual", 2],
        ["Lucía Mendoza", "Anual", 2], ["Julián Salazar", "Mensual", 4],
      ].map(([name, plan, days], i) => ({
        membership_id: `e${i}`, member_id: `e${i}`, member_name: String(name), phone: null,
        plan_name: String(plan), end_date: todayISO(), days_left: Number(days),
      })),
      in_grace: [{ membership_id: "g1", member_id: "g1", member_name: "Carlos Rojas", phone: null, plan_name: "Mensual", end_date: todayISO(), days_overdue: 2 }],
      denied_today: [],
      grace_days: 3,
    },
    shift: { open: true, cash_shifts_enabled: true, shift: { id: "s1", opening_amount: 100000, opened_at: utcNaive(5, 48) } },
    lowStock: [],
    checkinsToday: sampleEntries(),
    birthdaysToday: [],
    insights: [],
    occupancy: {
      status: "trained",
      result: { cells: Object.entries(TYPICAL).map(([h, count]) => ({ weekday, hour: Number(h), count })) },
    },
    forecast: {
      month_to_date: 3710000, elapsed_days: 10, days_in_month: 30, projection: 9450000,
      projection_low: 8100000, projection_high: 10900000, avg_previous_months: 11100000,
      vs_previous_pct: -15, method: "modelo",
    },
    revenueDaily: [350000, 180000, 60000, 520000, 340000, 390000, 430000, 460000].map((amount, i) => ({ date: String(i), amount })),
    churnRisk: [
      ["Carlos Rojas", "Mensual", "viene 1 vez por semana; antes venía 3"],
      ["Lucía Mendoza", "Anual", "no viene hace 12 días"],
      ["Santiago Salazar", "Trimestral", "renovó tarde las últimas dos veces"],
      ["Mateo Pineda", "Mensual", "congeló su plan dos veces este año"],
      ["Laura Castro", "Mensual", "no viene hace 9 días"],
    ].map(([name, plan, reason], i) => ({
      member_id: `r${i}`, full_name: name, score: 80 - i * 4, level: "alto" as const, reasons: [reason], plan_name: plan, method: "modelo" as const,
    })),
    plans: [
      { id: "p1", name: "Mensual", price: 90000, duration_days: 30 },
      { id: "p2", name: "Trimestral", price: 240000, duration_days: 90 },
      { id: "p3", name: "Anual", price: 800000, duration_days: 365 },
    ],
    failed: new Set(),
  };
}

export function HoyMuestra() {
  const data = sampleData();
  return (
    <div className="space-y-6">
      <DayCard entries={data.checkinsToday} occupancy={data.occupancy} />
      <MoneyStrip data={data} canMoney canReports />
      <div className="grid items-stretch gap-6 lg:grid-cols-12">
        <ExpiringWeek data={data} className="lg:col-span-7" />
        <RiskBlock data={data} className="lg:col-span-5" />
      </div>
    </div>
  );
}
