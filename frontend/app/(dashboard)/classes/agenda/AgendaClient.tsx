/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import MemberSelect from "@/components/common/MemberSelect";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon as ArrowLeft, CalendarBlankIcon as Calendar, CheckIcon as Check, CaretLeftIcon as ChevronLeft, CaretRightIcon as ChevronRight, SpinnerGapIcon as Loader2, UsersIcon as Users, XIcon as X, XCircleIcon as XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";

interface SessionItem {
  id: string;
  gym_class_id: string;
  class_name: string;
  instructor: string;
  category: string | null;
  color: string | null;
  session_date: string;
  start_time: string | null;
  duration_minutes: number;
  status: string;
  capacity: number;
  booked: number;
}

interface RosterEntry {
  booking_id: string;
  member_id: string;
  member_name: string;
  status: string;
  waitlist_position: number | null;
}

const HOUR_PX = 56;

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function occupancyColor(booked: number, capacity: number): string {
  const ratio = capacity > 0 ? booked / capacity : 0;
  if (ratio >= 1) return "bg-[var(--signal-danger)]";
  if (ratio >= 0.75) return "bg-[var(--signal-warn)]";
  return "bg-[var(--signal-ok)]";
}

/**
 * Carril de cada sesión dentro de su día: las que se cruzan en horario van lado
 * a lado (cada grupo que se solapa reparte el ancho), en vez de taparse.
 */
function layoutLanes(sessions: { id: string; start_time: string | null; duration_minutes: number }[]) {
  const out = new Map<string, { lane: number; count: number }>();
  const sorted = [...sessions].sort((a, b) => minutesOf(a.start_time!) - minutesOf(b.start_time!));
  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const g of group) out.set(g.id, { lane: g.lane, count: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const s of sorted) {
    const start = minutesOf(s.start_time!);
    const end = start + s.duration_minutes;
    if (start >= groupEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.push(end) - 1;
    else laneEnds[lane] = end;
    group.push({ id: s.id, lane });
    groupEnd = Math.max(groupEnd, end);
  }
  flush();
  return out;
}

export default function AgendaClient() {
  const { data: session } = useSession();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SessionItem | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [bookingMember, setBookingMember] = useState("");
  const [busy, setBusy] = useState(false);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const loadSessions = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/class-sessions", {
        params: {
          from: format(weekStart, "yyyy-MM-dd"),
          to: format(addDays(weekStart, 6), "yyyy-MM-dd"),
        },
      });
      setSessions(res.data);
    } catch (err: any) {
      toast.error(parseApiError(err, "Error cargando la agenda"));
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken, weekStart]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const timed = sessions.filter((s) => s.start_time);
  const minHour = timed.length
    ? Math.min(...timed.map((s) => Math.floor(minutesOf(s.start_time!) / 60)), 6)
    : 6;
  const maxHour = timed.length
    ? Math.max(...timed.map((s) => Math.ceil((minutesOf(s.start_time!) + s.duration_minutes) / 60)), 21)
    : 21;
  const hours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i);

  const openSession = async (s: SessionItem) => {
    setSelected(s);
    setRoster([]);
    if (!session?.accessToken) return;
    setRosterLoading(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get(`/api/v1/class-sessions/${s.id}`);
      setRoster(res.data.roster);
    } finally {
      setRosterLoading(false);
    }
  };

  const refreshSelected = async () => {
    if (!selected || !session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    const res = await client.get(`/api/v1/class-sessions/${selected.id}`);
    setRoster(res.data.roster);
    await loadSessions();
  };

  const book = async () => {
    if (!session?.accessToken || !selected || !bookingMember) return;
    setBusy(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.post(`/api/v1/class-sessions/${selected.id}/bookings`, {
        member_id: bookingMember,
      });
      const remaining = res.data.credits_remaining;
      const creditsMsg =
        remaining === null || remaining === undefined
          ? ""
          : `: le quedan ${remaining} clase${remaining !== 1 ? "s" : ""}`;
      toast.success(
        res.data.status === "waitlisted"
          ? "Agregado a lista de espera"
          : `Reserva confirmada${creditsMsg}`
      );
      setBookingMember("");
      await refreshSelected();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error al reservar"));
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    if (!session?.accessToken || !selected) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.delete(`/api/v1/class-sessions/${selected.id}/bookings/${bookingId}`);
      toast.success(
        res.data.promoted_member_id
          ? "Reserva cancelada: se promovió un miembro de la lista"
          : "Reserva cancelada"
      );
      await refreshSelected();
    } catch {
      toast.error("Error al cancelar");
    }
  };

  const markAttendance = async (bookingId: string, status: string) => {
    if (!session?.accessToken || !selected) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.patch(`/api/v1/class-sessions/${selected.id}/bookings/${bookingId}`, { status });
      await refreshSelected();
    } catch {
      toast.error("Error al marcar asistencia");
    }
  };

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} al ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}`;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <PageHeader
        module="classes"
        title="Agenda semanal"
        subtitle="Sesiones, ocupación y asistencia"
        action={
          <Link
            href="/classes"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-base)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-base)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Clases
          </Link>
        }
      />

      <GlassCard className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Semana anterior"
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="h-8 w-8 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="h-8 px-3 rounded-lg border border-[var(--border-base)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
            >
              Hoy
            </button>
            <button
              type="button"
              aria-label="Semana siguiente"
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              className="h-8 w-8 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm font-semibold text-[var(--text-base)]">{weekLabel}</p>
        </div>

        {loading ? (
          <div className="skeleton h-96 rounded-xl" />
        ) : timed.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-10 w-10 text-[var(--text-muted)] opacity-50" />}
            title="Sin sesiones esta semana"
            description="Crea clases con horario semanal y las sesiones se generan solas."
            action={
              <Link href="/classes">
                <Button>
                  Ir a clases
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Cabecera de días */}
              <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
                <div />
                {days.map((day) => {
                  const today = isSameDay(day, new Date());
                  return (
                    <div key={day.toISOString()} className="px-2 pb-2 text-center">
                      <p className={cn("text-xs", today ? "text-primary-ink font-semibold" : "text-[var(--text-muted)]")}>
                        {format(day, "EEE", { locale: es })}
                      </p>
                      <p className={cn(
                        "text-lg font-bold leading-tight mx-auto w-9 h-9 flex items-center justify-center rounded-full",
                        today ? "bg-primary text-primary-contrast" : "text-[var(--text-base)]"
                      )}>
                        {format(day, "d")}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Grilla horas × días */}
              <div
                className="grid border-t border-[var(--border-base)]"
                style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}
              >
                {/* Columna de horas */}
                <div className="relative" style={{ height: hours.length * HOUR_PX }}>
                  {hours.map((h, i) => (
                    <span
                      key={h}
                      className="absolute right-2 -translate-y-1/2 text-[11px] text-[var(--text-muted)] tabular-nums"
                      style={{ top: i * HOUR_PX }}
                    >
                      {i > 0 && `${String(h).padStart(2, "0")}:00`}
                    </span>
                  ))}
                </div>

                {days.map((day) => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const daySessions = timed.filter((s) => s.session_date === dayStr);
                  const lanes = layoutLanes(daySessions);
                  return (
                    <div
                      key={dayStr}
                      className="relative border-l border-[var(--border-base)]"
                      style={{ height: hours.length * HOUR_PX }}
                    >
                      {hours.map((_, i) => (
                        <div
                          key={i}
                          className="absolute left-0 right-0 border-t border-[var(--border-base)]/50"
                          style={{ top: i * HOUR_PX }}
                        />
                      ))}
                      {daySessions.map((s) => {
                        const top = ((minutesOf(s.start_time!) - minHour * 60) / 60) * HOUR_PX;
                        const height = Math.max((s.duration_minutes / 60) * HOUR_PX, 36);
                        const cancelled = s.status === "cancelled";
                        const accent = s.color || "var(--accent-classes)";
                        const { lane, count } = lanes.get(s.id) ?? { lane: 0, count: 1 };
                        return (
                          // Bloque en un tinte pálido del color de la clase, con el texto en tinta:
                          // a pleno color la semana era un arcoíris y el blanco encima no se leía.
                          <button
                            key={s.id}
                            onClick={() => void openSession(s)}
                            className={cn(
                              "absolute flex flex-col overflow-hidden rounded-[10px] px-2 py-1.5 text-left text-ink",
                              "transition-[filter,transform] duration-150 hover:z-10 hover:brightness-[0.97] active:scale-[0.98] dark:hover:brightness-110",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40",
                              cancelled && "opacity-50 line-through",
                            )}
                            style={{
                              top,
                              height,
                              left: `calc(${(lane / count) * 100}% + 4px)`,
                              width: `calc(${100 / count}% - ${count > 1 ? 6 : 8}px)`,
                              background: cancelled ? "var(--bg-muted)" : `color-mix(in oklch, ${accent} 18%, var(--bg-card))`,
                            }}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="size-2 shrink-0 rounded-full" style={{ background: accent }} aria-hidden="true" />
                              <span className="truncate text-xs font-semibold leading-tight">{s.class_name}</span>
                            </span>
                            <span className="num mt-0.5 truncate text-[11px] font-medium text-ink-muted">
                              {s.start_time!.slice(0, 5)}
                              {!cancelled && ` · ${s.booked}/${s.capacity}`}
                              {height >= 64 && s.instructor ? ` · ${s.instructor}` : ""}
                            </span>
                            {!cancelled && height >= 64 && (
                              <span className="mt-auto block h-1 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--text-base)_10%,transparent)]">
                                <span
                                  className={cn("block h-full rounded-full", occupancyColor(s.booked, s.capacity))}
                                  style={{ width: `${Math.min((s.booked / s.capacity) * 100, 100)}%` }}
                                />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Drawer de sesión */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              className="fixed inset-0 bg-black/40 z-40"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[var(--bg-card)] border-l border-[var(--border-base)] shadow-[var(--shadow-dialog)] flex flex-col"
            >
              <div className="p-5 border-b border-[var(--border-base)] flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-base)]">{selected.class_name}</h2>
                  <p className="text-sm text-[var(--text-muted)] capitalize">
                    {format(new Date(selected.session_date + "T12:00:00"), "EEEE d MMM", { locale: es })}
                    {selected.start_time ? ` · ${selected.start_time.slice(0, 5)}` : ""} · {selected.instructor}
                  </p>
                  <p className="text-sm text-[var(--text-muted)] mt-1 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {selected.booked}/{selected.capacity} reservados
                    {selected.status === "cancelled" && <StatusBadge status="cancelled" label="Cancelada" />}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 flex-1 overflow-y-auto">
                {selected.status !== "cancelled" && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-[var(--text-base)]">
                      Reservar miembro
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <MemberSelect value={bookingMember} onChange={setBookingMember} />
                      </div>
                      <Button
                        onClick={book}
                        disabled={busy || !bookingMember}
                        className="shrink-0"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reservar"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--text-base)]">
                    Roster
                  </p>
                  {rosterLoading ? (
                    <div className="skeleton h-24 rounded-xl" />
                  ) : roster.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">Nadie reservado aún.</p>
                  ) : (
                    roster.map((b) => (
                      <div
                        key={b.booking_id}
                        className="flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 bg-muted/60"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-base)] truncate">{b.member_name}</p>
                          <StatusBadge
                            status={b.status}
                            label={
                              b.status === "waitlisted"
                                ? `Lista de espera #${b.waitlist_position}`
                                : b.status === "attended"
                                ? "Asistió"
                                : b.status === "no_show"
                                ? "No vino"
                                : b.status === "cancelled"
                                ? "Cancelada"
                                : "Reservado"
                            }
                            tone={
                              b.status === "attended"
                                ? "success"
                                : b.status === "no_show"
                                ? "danger"
                                : b.status === "waitlisted"
                                ? "info"
                                : b.status === "cancelled"
                                ? "neutral"
                                : "violet"
                            }
                          />
                        </div>
                        {(b.status === "booked" || b.status === "attended" || b.status === "no_show") && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => markAttendance(b.booking_id, "attended")}
                              title="Asistió"
                              className={cn(
                                "h-7 w-7 rounded-lg flex items-center justify-center transition-colors",
                                b.status === "attended"
                                  ? "bg-[var(--signal-ok-bg)] text-[var(--signal-ok)]"
                                  : "text-[var(--text-muted)] hover:text-[var(--signal-ok)]"
                              )}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => markAttendance(b.booking_id, "no_show")}
                              title="No vino"
                              className={cn(
                                "h-7 w-7 rounded-lg flex items-center justify-center transition-colors",
                                b.status === "no_show"
                                  ? "bg-[var(--signal-danger-bg)] text-[var(--signal-danger)]"
                                  : "text-[var(--text-muted)] hover:text-[var(--signal-danger)]"
                              )}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                            {b.status === "booked" && (
                              <button
                                onClick={() => cancelBooking(b.booking_id)}
                                title="Cancelar reserva"
                                className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-danger)]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
