"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatDateTime, gymHour, gymWeekday, parseUTC, todayInGym } from "@/lib/format";
import type { TodayEntry } from "@/components/dashboard/LiveNowStrip";
import type { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";
import { Avatar, CardHead, Pill } from "./parts";

/** Tiempo típico dentro del gimnasio para estimar cuántos siguen adentro. */
const STAY_MINUTES = 75;
const DEFAULT_RANGE: [number, number] = [5, 21];

const DECISION: Record<string, { text: string; color: string }> = {
  allowed: { text: "Entró", color: "var(--text-muted)" },
  override: { text: "Autorizado", color: "var(--signal-warn)" },
  denied: { text: "No pudo entrar", color: "var(--signal-danger)" },
};

function hourOf(iso: string): number {
  return Number(formatDateTime(iso, "H"));
}

/** Lo que el Hoy dice de la puerta: entradas válidas, cuántas lleva un día
 *  normal a esta hora y cuántos siguen adentro. Lo usan la tarjeta del día y el
 *  cuadro de indicadores, así las dos cifras siempre coinciden. */
export function dayStats(entries: TodayEntry[], occupancy: DashboardData["occupancy"]) {
  const allowed = entries.filter((e) => e.decision !== "denied");
  const cells = occupancy?.result?.cells ?? [];
  const weekday = gymWeekday();
  const typical: number[] | null = cells.length
    ? Array.from({ length: 24 }, (_, h) => cells.find((c) => c.weekday === weekday && c.hour === h)?.count ?? 0)
    : null;
  const nowHour = gymHour();
  const nowMinute = Number(formatDateTime(new Date(), "m"));
  const typicalSoFar = typical
    ? typical.slice(0, nowHour).reduce((a, b) => a + b, 0) + typical[nowHour] * (nowMinute / 60)
    : null;
  const inside = allowed.filter((e) => Date.now() - parseUTC(e.created_at).getTime() < STAY_MINUTES * 60_000).length;
  return { allowed, typical, typicalSoFar, inside, nowHour, nowMinute };
}

export function DayCard({ entries, occupancy }: { entries: TodayEntry[]; occupancy: DashboardData["occupancy"] }) {
  // Solo se anima lo que cambia de verdad: la entrada que acaba de llegar (DESIGN.md §6).
  const reduce = useReducedMotion();
  const { allowed, typical, typicalSoFar, inside, nowHour, nowMinute } = dayStats(entries, occupancy);
  const byHour = Array<number>(24).fill(0);
  for (const e of allowed) byHour[hourOf(e.created_at)] += 1;

  const active = Array.from({ length: 24 }, (_, h) => h).filter((h) => byHour[h] > 0 || (typical?.[h] ?? 0) >= 0.3);
  const start = Math.min(active.length ? Math.min(...active) : DEFAULT_RANGE[0], DEFAULT_RANGE[0] + 1);
  const end = Math.max(active.length ? Math.max(...active) : DEFAULT_RANGE[1], Math.min(nowHour, 23));
  const hours = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const delta = typicalSoFar !== null && typicalSoFar >= 8 ? Math.round(((allowed.length - typicalSoFar) / typicalSoFar) * 100) : null;

  const maxValue = Math.max(1, ...hours.map((h) => Math.max(byHour[h], typical?.[h] ?? 0))) * 1.12;
  const dayName = format(todayInGym(), "EEEE", { locale: es });
  const nowInRange = nowHour >= start && nowHour <= end;
  const nowLeft = ((nowHour - start + nowMinute / 60) / hours.length) * 100;

  const curve = typical
    ? hours.map((h, i) => `${(i + 0.5) * 10},${100 - (typical[h] / maxValue) * 100}`).join(" ")
    : null;

  return (
    <section data-tour="live-now" className="card grid gap-8 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num text-[52px] leading-[0.95] text-ink">{allowed.length}</span>
          <span className="font-display text-lg font-semibold text-ink">{allowed.length === 1 ? "entrada" : "entradas"}</span>
          {delta !== null && delta !== 0 && <Pill value={delta} />}
          <p className="basis-full text-sm text-ink-muted lg:basis-auto">
            {typicalSoFar !== null
              ? `Un ${dayName} normal lleva ${Math.round(typicalSoFar)} a esta hora.`
              : "Todavía no hay historia para compararlo con un día normal."}{" "}
            Adentro ahora, estimado: <span className="num text-ink">{inside}</span>.
          </p>
        </div>

        <div className="relative mt-9 h-44 border-b border-line">
          {curve && (
            <svg
              className="absolute inset-0 size-full"
              viewBox={`0 0 ${hours.length * 10} 100`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polygon points={`5,100 ${curve} ${hours.length * 10 - 5},100`} fill="var(--bg-muted)" />
              <polyline
                points={curve}
                fill="none"
                stroke="var(--text-subtle)"
                strokeWidth={1.4}
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
            {hours.map((h) => (
              <div key={h} className="flex items-end justify-center">
                {byHour[h] > 0 && (
                  <div
                    className={cn("w-[46%] max-w-[22px] rounded-t-[6px] rounded-b-[2px] bg-primary", h === nowHour && "opacity-55")}
                    style={{ height: `${(byHour[h] / maxValue) * 100}%` }}
                    title={`${h}:00, ${byHour[h]} ${byHour[h] === 1 ? "entrada" : "entradas"}`}
                  />
                )}
              </div>
            ))}
          </div>
          {nowInRange && (
            <div className="absolute inset-y-0 w-[1.5px] bg-ink" style={{ left: `${nowLeft}%` }} aria-hidden="true">
              <span
                className={cn(
                  "num absolute -top-7 whitespace-nowrap rounded-[7px] bg-ink px-2 py-0.5 text-xs text-surface",
                  // Cerca de los bordes la etiqueta crece hacia adentro: centrada se saldría de la tarjeta.
                  nowLeft > 80 ? "right-0" : nowLeft < 20 ? "left-0" : "left-1/2 -translate-x-1/2",
                )}>
                Ahora {formatDateTime(new Date(), "HH:mm")}
              </span>
            </div>
          )}
        </div>
        <div className="grid pt-1.5" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
          {hours.map((h) => (
            <span key={h} className="text-center text-xs text-ink-muted">
              {h % 3 === 0 ? `${h}:00` : ""}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-[11px] rounded-[3px] bg-primary" /> Entradas por hora
          </span>
          {typical && (
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 border-t-[1.5px] border-dashed border-ink-subtle" /> Un {dayName} normal
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 lg:border-l lg:border-line lg:pl-6">
        <CardHead
          title={
            <>
              <span className="size-2 rounded-full bg-[var(--signal-ok)] shadow-[0_0_0_4px_var(--signal-ok-bg)]" aria-hidden="true" />
              En vivo
            </>
          }
          href="/checkins"
          link="Mostrador"
        />
        {entries.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">Nadie ha entrado todavía hoy. Cada entrada del kiosko aparece aquí al instante.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/60" aria-live="polite">
            <AnimatePresence initial={false}>
            {entries.slice(0, 5).map((e) => {
              const d = DECISION[e.decision ?? "allowed"] ?? DECISION.allowed;
              return (
                <motion.li
                  key={e.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-2.5 py-2.5"
                >
                  <span className="num w-10 shrink-0 text-[12.5px] text-ink-muted">{formatDateTime(e.created_at, "HH:mm")}</span>
                  <Avatar name={e.member_name} size={30} />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{e.member_name ?? "Socio sin nombre"}</p>
                    <p className="text-xs" style={{ color: d.color }}>
                      {d.text}
                    </p>
                  </div>
                </motion.li>
              );
            })}
            </AnimatePresence>
          </ul>
        )}
        {entries.length > 5 && (
          <Link href="/checkins" className="mt-1 inline-block text-[13px] font-semibold text-primary-ink hover:underline">
            Ver las {entries.length}
          </Link>
        )}
      </div>
    </section>
  );
}
