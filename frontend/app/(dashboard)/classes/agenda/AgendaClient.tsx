/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import MemberSelect from "@/components/common/MemberSelect";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Users, Loader2, Check, X, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
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

export default function AgendaClient() {
  const { data: session } = useSession();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SessionItem | null>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [bookingMember, setBookingMember] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    const today = new Date();
    const to = new Date(today.getTime() + 7 * 86400000);
    const res = await client.get("/api/v1/class-sessions", {
      params: { from: format(today, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") },
    });
    setSessions(res.data);
    setLoading(false);
  }, [session?.accessToken]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const openSession = async (s: SessionItem) => {
    setSelected(s);
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    const res = await client.get(`/api/v1/class-sessions/${s.id}`);
    setRoster(res.data.roster);
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
      const res = await client.post(`/api/v1/class-sessions/${selected.id}/bookings`, { member_id: bookingMember });
      toast.success(res.data.status === "waitlisted" ? "Agregado a lista de espera" : "Reserva confirmada");
      setBookingMember("");
      await refreshSelected();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error al reservar");
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    if (!session?.accessToken || !selected) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.delete(`/api/v1/class-sessions/${selected.id}/bookings/${bookingId}`);
      if (res.data.promoted_member_id) toast.success("Reserva cancelada — se promovió un miembro de la lista");
      else toast.success("Reserva cancelada");
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

  // Agrupar por fecha
  const byDate: Record<string, SessionItem[]> = {};
  for (const s of sessions) {
    (byDate[s.session_date] ??= []).push(s);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-5"
    >
      <Link href="/classes" className="inline-flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-base)] text-sm transition-colors">
        <ArrowLeft className="h-4 w-4" /> Clases
      </Link>
      <PageHeader module="classes" title="Agenda de clases" subtitle="Reservas, lista de espera y asistencia por sesión" />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" /></div>
      ) : sessions.length === 0 ? (
        <GlassCard className="p-8 text-center space-y-2">
          <CalendarPlus className="h-8 w-8 text-[var(--text-muted)] mx-auto" />
          <p className="text-[var(--text-muted)] text-sm">No hay sesiones programadas esta semana.</p>
          <p className="text-[var(--text-muted)] text-xs">Crea una clase con días y hora para generar su agenda.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Lista de sesiones por día */}
          <div className="lg:col-span-2 space-y-4">
            {Object.entries(byDate).map(([day, items]) => (
              <div key={day}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  {format(new Date(day + "T00:00"), "EEEE d 'de' MMMM", { locale: es })}
                </h3>
                <div className="space-y-1.5">
                  {items.map((s) => {
                    const full = s.booked >= s.capacity;
                    return (
                      <button
                        key={s.id}
                        onClick={() => openSession(s)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                          selected?.id === s.id
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)]"
                            : "border-[var(--border-base)] bg-[var(--bg-muted)] hover:bg-[var(--bg-base)]"
                        } ${s.status === "cancelled" ? "opacity-50" : ""}`}
                      >
                        <span className="h-9 w-1.5 rounded-full shrink-0" style={{ background: s.color ?? "var(--color-primary)" }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--text-base)] truncate">{s.class_name}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            {s.start_time?.slice(0, 5)} · {s.instructor}
                            {s.status === "cancelled" && " · CANCELADA"}
                          </p>
                        </div>
                        <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold ${full ? "text-amber-600 dark:text-amber-400" : "text-[var(--text-muted)]"}`}>
                          <Users className="h-3.5 w-3.5" /> {s.booked}/{s.capacity}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Detalle / roster de la sesión seleccionada */}
          <div className="lg:col-span-1">
            {selected ? (
              <GlassCard className="p-4 space-y-4 lg:sticky lg:top-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-base)]">{selected.class_name}</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {format(new Date(selected.session_date + "T00:00"), "d MMM", { locale: es })} · {selected.start_time?.slice(0, 5)} · {selected.booked}/{selected.capacity}
                  </p>
                </div>

                {selected.status !== "cancelled" && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <MemberSelect value={bookingMember} onChange={setBookingMember} />
                    </div>
                    <Button onClick={book} disabled={busy || !bookingMember} className="shrink-0 bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)] h-9">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reservar"}
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5">
                  {roster.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] py-2 text-center">Sin reservas todavía.</p>
                  ) : roster.map((b) => (
                    <div key={b.booking_id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-muted)] text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--text-base)] truncate">{b.member_name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {b.status === "waitlisted" ? `Lista de espera #${b.waitlist_position}` :
                           b.status === "attended" ? "Asistió" :
                           b.status === "no_show" ? "No asistió" :
                           b.status === "cancelled" ? "Cancelada" : "Reservada"}
                        </p>
                      </div>
                      {b.status === "booked" && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => markAttendance(b.booking_id, "attended")} title="Asistió" className="h-6 w-6 rounded flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => markAttendance(b.booking_id, "no_show")} title="No asistió" className="h-6 w-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-base)]">
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => cancelBooking(b.booking_id)} title="Cancelar reserva" className="h-6 w-6 rounded flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 text-[10px] font-bold">
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            ) : (
              <GlassCard className="p-6 text-center">
                <p className="text-xs text-[var(--text-muted)]">Selecciona una sesión para ver y gestionar sus reservas.</p>
              </GlassCard>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
