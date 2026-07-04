"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { GlassCard } from "@/components/common/GlassCard";
import { apiClient } from "@/lib/api";
import { formatCOP, formatTimeAgo } from "@/lib/format";
import { useReceptionEvents } from "@/hooks/useReceptionEvents";
import { cn } from "@/lib/utils";
import { Activity, Cake, CalendarClock, CreditCard, UserPlus, Tv } from "lucide-react";

interface TodayEntry {
  id: string;
  member_name: string | null;
  decision: string | null;
  created_at: string;
}

interface Birthday {
  full_name: string;
  phone: string | null;
  days_until: number;
}

/** Franja "Ahora": lo que está pasando HOY en el gym, en vivo (SSE). */
export function LiveNowStrip({ expiring7d }: { expiring7d: number }) {
  const { data: session } = useSession();
  const [entries, setEntries] = useState<TodayEntry[]>([]);
  const [todayRevenue, setTodayRevenue] = useState<number | null>(null);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    const today = format(new Date(), "yyyy-MM-dd");
    client.get("/api/v1/checkins/today").then((res) => setEntries(res.data)).catch(() => {});
    client
      .get("/api/v1/dashboard/kpis", { params: { from: today, to: today } })
      .then((res) => setTodayRevenue(Number(res.data?.kpis?.total_payments_month ?? 0)))
      .catch(() => {});
    client
      .get("/api/v1/reports/birthdays")
      .then((res) => setBirthdays((res.data as Birthday[]).filter((b) => b.days_until === 0)))
      .catch(() => {});
  }, [session?.accessToken]);

  useReceptionEvents((event) => {
    if (event.type !== "checkin") return;
    setEntries((prev) => [
      {
        id: `${event.member_id}-${event.at}`,
        member_name: event.member_name,
        decision: event.decision,
        created_at: event.at,
      },
      ...prev,
    ]);
  });

  const allowedToday = entries.filter((e) => e.decision !== "denied").length;
  const lastEntries = entries.slice(0, 3);

  return (
    <GlassCard className="p-0 overflow-hidden mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-base)]">
        {/* En el gym ahora */}
        <div className="p-5 bg-[var(--color-primary)]/5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-[var(--text-muted)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-primary)]" />
              </span>
              Hoy en el gym — en vivo
            </p>
            <Link
              href="/checkins"
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Tv className="h-3.5 w-3.5" /> Ver todo
            </Link>
          </div>
          <div className="flex items-end gap-6 mt-3">
            <div>
              <p className="text-5xl font-extrabold text-[var(--text-base)] font-display leading-none">
                {allowedToday}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1.5">ingresos hoy</p>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <AnimatePresence initial={false}>
                {lastEntries.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Aún nadie ha entrado hoy.</p>
                ) : (
                  lastEntries.map((e) => (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 text-sm min-w-0"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          e.decision === "denied" ? "bg-red-500" : "bg-emerald-500"
                        )}
                      />
                      <span className="font-medium text-[var(--text-base)] truncate">
                        {e.member_name ?? "Miembro"}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] shrink-0">
                        {formatTimeAgo(e.created_at)}
                      </span>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Ingresos de hoy + vencimientos */}
        <div className="p-5 flex flex-col justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider font-bold text-[var(--text-muted)]">Ingresos de hoy</p>
            <p className="text-2xl font-extrabold text-[var(--text-base)] font-display mt-1">
              {todayRevenue === null ? "—" : formatCOP(todayRevenue)}
            </p>
          </div>
          <Link href="/payments" className="flex items-center gap-2.5 group">
            <span className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <CalendarClock className="h-4 w-4" />
            </span>
            <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-base)] transition-colors">
              <strong className="text-[var(--text-base)]">{expiring7d}</strong> vencen esta semana
            </span>
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-600 dark:text-fuchsia-400 flex items-center justify-center shrink-0">
              <Cake className="h-4 w-4" />
            </span>
            <span className="text-sm text-[var(--text-muted)] min-w-0 truncate">
              {birthdays.length === 0
                ? "Sin cumpleaños hoy"
                : `🎉 ${birthdays.map((b) => b.full_name.split(" ")[0]).join(", ")} cumple${birthdays.length > 1 ? "n" : ""} hoy`}
            </span>
          </div>
        </div>

        {/* Acciones rápidas */}
        <div className="p-5 flex flex-col gap-2 justify-center">
          <p className="text-xs uppercase tracking-wider font-bold text-[var(--text-muted)] mb-1">Acciones rápidas</p>
          <Link
            href="/members"
            className="flex items-center gap-2.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-contrast)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            <UserPlus className="h-4 w-4" /> Registrar socio
          </Link>
          <Link
            href="/payments"
            className="flex items-center gap-2.5 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-4 py-2.5 text-sm font-medium text-[var(--text-base)] hover:border-[var(--color-primary)] transition-colors"
          >
            <CreditCard className="h-4 w-4" /> Cobrar / renovar
          </Link>
          <Link
            href="/checkins"
            className="flex items-center gap-2.5 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-4 py-2.5 text-sm font-medium text-[var(--text-base)] hover:border-[var(--color-primary)] transition-colors"
          >
            <Activity className="h-4 w-4" /> Check-ins en vivo
          </Link>
        </div>
      </div>
    </GlassCard>
  );
}
