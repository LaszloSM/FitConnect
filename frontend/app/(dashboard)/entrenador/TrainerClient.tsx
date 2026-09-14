"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion, type Variants } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatDate, parseDateOnly, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CalendarDotsIcon as CalendarDays, ClipboardTextIcon as ClipboardList, PhoneIcon as Phone, SunIcon as Sun, UsersIcon as Users } from "@phosphor-icons/react";

export type TrainerView = "today" | "members" | "routines";

interface Profile {
  id: string;
  full_name: string;
  specialty: string | null;
  members_count: number;
  classes_count: number;
}

interface TrainerMember {
  id: string;
  full_name: string;
  phone: string | null;
  membership_status: string;
  plan_name: string | null;
  end_date: string | null;
  includes_trainer: boolean;
  trainer_sessions_per_month: number | null;
}

interface TrainerSession {
  id: string;
  class_name: string;
  color: string | null;
  session_date: string;
  start_time: string | null;
  duration_minutes: number;
  status: string;
  capacity: number;
  booked: number;
  is_substitute: boolean;
}

interface TrainerRoutine {
  id: string;
  member_id: string;
  member_name: string;
  routine_name: string;
  assigned_at: string | null;
  ended_at: string | null;
}

const lista: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};
const fila: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

const TITULOS: Record<TrainerView, { title: string; subtitle: string; icon: React.ReactNode }> = {
  today: {
    title: "Mi día",
    subtitle: "Tus clases de esta semana y lo que tienes a cargo.",
    icon: <Sun className="h-5 w-5" />,
  },
  members: {
    title: "Mis socios",
    subtitle: "Las personas que el gimnasio te asignó.",
    icon: <Users className="h-5 w-5" />,
  },
  routines: {
    title: "Mis rutinas",
    subtitle: "Lo que has diseñado y a quién se lo pusiste.",
    icon: <ClipboardList className="h-5 w-5" />,
  },
};

function hhmm(t: string | null) {
  return t ? t.slice(0, 5) : "--:--";
}

export default function TrainerClient({ view }: { view: TrainerView }) {
  const { data: session } = useSession();
  const token = session?.accessToken as string | undefined;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<TrainerMember[]>([]);
  const [sessions, setSessions] = useState<TrainerSession[]>([]);
  const [routines, setRoutines] = useState<TrainerRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const client = apiClient(token);
    try {
      const [p, m, s, r] = await Promise.all([
        client.get<Profile>("/api/v1/trainer/me"),
        client.get<TrainerMember[]>("/api/v1/trainer/members"),
        client.get<TrainerSession[]>("/api/v1/trainer/sessions"),
        client.get<TrainerRoutine[]>("/api/v1/trainer/routines"),
      ]);
      setProfile(p.data);
      setMembers(m.data);
      setSessions(s.data);
      setRoutines(r.data);
      setError("");
    } catch (err: any) {
      setError(parseApiError(err, "No se pudo cargar tu información. Pídele al gimnasio que revise tu cuenta."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const cabecera = TITULOS[view];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-56 rounded-lg" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={cabecera.title} subtitle={cabecera.subtitle} icon={cabecera.icon} />
        <GlassCard className="p-6">
          <p className="text-sm text-[var(--text-base)]">{error}</p>
        </GlassCard>
      </div>
    );
  }

  const hoy = todayISO();
  const deHoy = sessions.filter((s) => s.session_date === hoy);
  const proximas = sessions.filter((s) => s.session_date > hoy);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={profile?.specialty ?? "Entrenador"}
        title={cabecera.title}
        subtitle={cabecera.subtitle}
        icon={cabecera.icon}
        module="classes"
      />

      {view === "today" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Resumen etiqueta="Clases hoy" valor={deHoy.length} icono={<CalendarDays className="h-4 w-4" />} />
            <Resumen etiqueta="Socios a cargo" valor={profile?.members_count ?? 0} icono={<Users className="h-4 w-4" />} />
            <Resumen etiqueta="Rutinas puestas" valor={routines.length} icono={<ClipboardList className="h-4 w-4" />} />
          </div>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-[var(--text-base)] mb-3">Hoy</h2>
            {deHoy.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Hoy no tienes clases. Si esperabas alguna, avisa en recepción.
              </p>
            ) : (
              <Sesiones items={deHoy} conFecha={false} />
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-[var(--text-base)] mb-3">Los próximos días</h2>
            {proximas.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Nada programado esta semana.</p>
            ) : (
              <Sesiones items={proximas} conFecha />
            )}
          </GlassCard>
        </>
      )}

      {view === "members" && (
        <GlassCard className="p-5">
          {members.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="Todavía no tienes socios asignados"
              description="Cuando el gimnasio te asigne a alguien, aparecerá aquí con el estado de su membresía."
            />
          ) : (
            <motion.ul variants={lista} initial="hidden" animate="visible" className="list-none m-0 p-0 divide-y divide-[var(--border-base)]">
              {members.map((m) => (
                <motion.li key={m.id} variants={fila} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/members/${m.id}`}
                        className="text-sm font-medium text-[var(--text-base)] hover:underline"
                      >
                        {m.full_name}
                      </Link>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-2 flex-wrap">
                        {m.plan_name && <span>{m.plan_name}</span>}
                        {m.end_date && <span>· vence {formatDate(parseDateOnly(m.end_date))}</span>}
                        {m.includes_trainer && (
                          <span>
                            ·{" "}
                            {m.trainer_sessions_per_month === null
                              ? "sesiones ilimitadas"
                              : `${m.trainer_sessions_per_month} sesiones/mes`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.phone && (
                        <a
                          href={`tel:${m.phone}`}
                          className="p-1.5 rounded-lg border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
                          title={`Llamar a ${m.full_name}`}
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <StatusBadge status={m.membership_status} />
                    </div>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </GlassCard>
      )}

      {view === "routines" && (
        <GlassCard className="p-5">
          {routines.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title="Aún no has asignado rutinas"
              description="Arma una rutina en el módulo de Rutinas y asígnasela a uno de tus socios."
            />
          ) : (
            <motion.ul variants={lista} initial="hidden" animate="visible" className="list-none m-0 p-0 divide-y divide-[var(--border-base)]">
              {routines.map((r) => (
                <motion.li key={r.id} variants={fila} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-base)]">{r.routine_name}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        <Link href={`/members/${r.member_id}`} className="hover:underline">
                          {r.member_name}
                        </Link>
                        {r.assigned_at && <> · desde {formatDate(r.assigned_at)}</>}
                      </p>
                    </div>
                    <StatusBadge
                      status={r.ended_at ? "finalizada" : "vigente"}
                      tone={r.ended_at ? "neutral" : "success"}
                    />
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </GlassCard>
      )}
    </div>
  );
}

function Resumen({ etiqueta, valor, icono }: { etiqueta: string; valor: number; icono: React.ReactNode }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-medium">
        {icono}
        {etiqueta}
      </div>
      <p className="text-2xl font-semibold text-[var(--text-base)] mt-1 tabular-nums">{valor}</p>
    </GlassCard>
  );
}

function Sesiones({ items, conFecha }: { items: TrainerSession[]; conFecha: boolean }) {
  return (
    <motion.ul variants={lista} initial="hidden" animate="visible" className="list-none m-0 p-0 space-y-2">
      {items.map((s) => (
        <motion.li
          key={s.id}
          variants={fila}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-[var(--border-base)] px-3 py-2.5",
            s.status === "cancelled" && "opacity-60",
          )}
        >
          <span
            aria-hidden
            className="h-8 w-1 rounded-full shrink-0"
            style={{ background: s.color ?? "var(--brand)" }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--text-base)] truncate">
              {s.class_name}
              {s.is_substitute && (
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  reemplazo
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
              {conFecha && <>{formatDate(parseDateOnly(s.session_date))} · </>}
              {hhmm(s.start_time)} · {s.duration_minutes} min
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-[var(--text-base)] tabular-nums">
              {s.booked}/{s.capacity}
            </p>
            <p className="text-xs text-[var(--text-muted)]">inscritos</p>
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}
