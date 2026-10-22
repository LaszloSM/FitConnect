/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExerciseFigure } from "@/components/routines/ExerciseFigure";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatTimeAgo } from "@/lib/format";
import { BarbellIcon as Dumbbell, SpinnerGapIcon as Loader2, TimerIcon as Timer, XIcon as X } from "@phosphor-icons/react";

interface RoutineRow { id: string; name: string; goal_label: string | null; level_es: string; days_per_week: number; is_active: boolean }

export function MemberRoutineTab({ memberId }: { memberId: string }) {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const client = () => apiClient(session?.accessToken as string);

  const load = () => {
    if (!session?.accessToken) return;
    client().get(`/api/v1/members/${memberId}/routines`).then((r) => setData(r.data)).catch(() => setData({ current: null, history: [] }));
    client().get("/api/v1/routines").then((r) => setRoutines(r.data)).catch(() => {});
  };
  useEffect(load, [session?.accessToken, memberId]); // eslint-disable-line react-hooks/exhaustive-deps

  const assign = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      await client().post(`/api/v1/members/${memberId}/routines`, { routine_id: choice });
      toast.success("Rutina asignada");
      setChoice("");
      load();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error asignando"));
    } finally {
      setBusy(false);
    }
  };
  const end = async () => {
    setConfirmEnd(false);
    try {
      await client().delete(`/api/v1/members/${memberId}/routines/current`);
      load();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error"));
    }
  };

  if (!data) return <div className="skeleton h-32 rounded-xl" />;
  const current = data.current;
  const day = current?.routine?.days?.[Math.min(dayIdx, (current?.routine?.days?.length ?? 1) - 1)];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[var(--text-base)]">Rutina actual</p>
          {current && (confirmEnd ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">Queda en el historial.</span>
              <button type="button" onClick={end} className="font-medium text-[var(--signal-danger)] hover:underline">Terminar rutina</button>
              <button type="button" onClick={() => setConfirmEnd(false)} className="text-[var(--text-muted)] hover:text-[var(--text-base)]">No</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmEnd(true)} className="text-xs text-[var(--text-muted)] hover:text-[var(--signal-danger)] flex items-center gap-1"><X className="h-3 w-3" /> Terminar</button>
          ))}
        </div>
        {current ? (
          <>
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-primary-ink" />
              <span className="font-semibold text-[var(--text-base)]">{current.routine_name}</span>
              <span className="text-xs text-[var(--text-muted)]">· {current.goal_label ?? ""} · asignada {formatTimeAgo(current.assigned_at)}</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {current.routine.days.map((d: any, i: number) => (
                <button key={d.id} type="button" onClick={() => setDayIdx(i)} className={`rounded-full px-2.5 py-1 text-xs font-medium border ${i === dayIdx ? "bg-action text-action-ink border-transparent" : "border-[var(--border-base)] text-[var(--text-muted)]"}`}>{d.title}</button>
              ))}
            </div>
            <div className="space-y-1.5">
              {day?.exercises.map((ex: any, i: number) => (
                <div key={ex.id} className="flex items-center gap-3 text-sm">
                  <span className="text-[10px] text-[var(--text-muted)] w-4">{i + 1}</span>
                  <ExerciseFigure images={ex.exercise?.images ?? []} videoUrl={ex.exercise?.video_url} alt={ex.exercise_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[var(--text-base)] font-medium truncate">{ex.exercise_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{ex.sets} × {ex.reps} <Timer className="h-3 w-3 inline ml-1" /> {ex.rest_seconds}s{ex.notes ? ` · ${ex.notes}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Sin rutina asignada. {routines.length === 0 && <>Crea una en <Link href="/routines" className="underline">Rutinas</Link>.</>}</p>
        )}
      </div>

      {routines.length > 0 && (
        <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-4 space-y-2">
          <p className="text-sm font-semibold text-[var(--text-base)]">{current ? "Cambiar rutina" : "Asignar rutina"}</p>
          <div className="flex gap-2">
            <select value={choice} onChange={(e) => setChoice(e.target.value)} className="flex-1 h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-base)]">
              <option value="">Selecciona una rutina...</option>
              {routines.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.level_es} · {r.days_per_week} días</option>)}
            </select>
            <Button onClick={assign} disabled={!choice || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Asignar"}</Button>
          </div>
        </div>
      )}

      {data.history.length > 0 && (
        <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-4 space-y-1.5">
          <p className="text-sm font-semibold text-[var(--text-base)]">Historial</p>
          {data.history.map((h: any) => (
            <p key={h.id} className="text-sm text-[var(--text-muted)]"><span className="text-[var(--text-base)]">{h.routine_name}</span> · {formatTimeAgo(h.assigned_at)}{h.ended_at ? ` → ${formatTimeAgo(h.ended_at)}` : ""}</p>
          ))}
        </div>
      )}
    </div>
  );
}
