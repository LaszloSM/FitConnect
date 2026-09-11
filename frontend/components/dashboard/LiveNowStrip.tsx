"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { formatTimeAgo } from "@/lib/format";
import { useReceptionEvents } from "@/hooks/useReceptionEvents";
import { cn } from "@/lib/utils";
import { Cake, CalendarClock, Tv } from "lucide-react";

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

/** Franja "Ahora": lo que está pasando HOY en el gym, en vivo (SSE).
 *
 * Los datos iniciales llegan por props desde la única espera del panel; aquí
 * solo se mantiene el flujo en vivo, que es lo que justifica el bloque. */
export function LiveNowStrip({
  expiring7d,
  initialEntries,
  birthdays,
  className = "col-span-12",
}: {
  expiring7d: number;
  initialEntries: TodayEntry[];
  birthdays: Birthday[];
  className?: string;
}) {
  const [entries, setEntries] = useState<TodayEntry[]>(initialEntries);

  // El valor de `useState` solo cuenta en el primer render: sin esto, un
  // refetch del panel refrescaba los cumpleaños pero no los ingresos de hoy.
  useEffect(() => { setEntries(initialEntries); }, [initialEntries]);

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
    <GlassCard className={`${className} p-0 overflow-hidden`}>
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-base)]">
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
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--color-primary-ink)] transition-colors"
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
        <div className="p-5 flex flex-col justify-center gap-4">
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

      </div>
    </GlassCard>
  );
}
