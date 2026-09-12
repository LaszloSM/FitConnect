/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { BrandMark } from "@/components/common/BrandMark";
import { ExerciseFigure, youtubeSearchUrl } from "@/components/routines/ExerciseFigure";
import { cn } from "@/lib/utils";
import { ArrowLeft, ChevronRight, Dumbbell, Timer, AlertTriangle, PlayCircle } from "lucide-react";

const TOKEN_KEY = "fitconnect_kiosk_token";
const IDLE_MS = 90_000;

interface RoutineCard { id: string; name: string; description: string | null; goal_label: string | null; level_es: string; days_per_week: number }
interface Exercise { name_es: string; name_en: string; primary_muscles_es: string[]; equipment_es: string; instructions: string[]; instructions_lang: string; images: string[]; video_url?: string | null; video_source?: string | null; video_author?: string | null; video_license?: string | null }
interface DayEx { id: string; exercise_name: string; sets: number; reps: string; rest_seconds: number; notes: string | null; exercise: Exercise | null }
interface Day { id: string; title: string; notes: string | null; exercises: DayEx[] }
interface RoutineDetail extends RoutineCard { days: Day[] }

export default function ScreenClient() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [routines, setRoutines] = useState<RoutineCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RoutineDetail | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [focus, setFocus] = useState<DayEx | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("device");
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl);
      setToken(fromUrl);
      window.history.replaceState({}, "", "/screen");
      return;
    }
    setToken(localStorage.getItem(TOKEN_KEY));
    if (!localStorage.getItem(TOKEN_KEY)) setLoading(false);
  }, [searchParams]);

  const client = useMemo(() => token ? axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL, headers: { Authorization: `Bearer ${token}` } }) : null, [token]);

  const load = () => {
    if (!client) return;
    client.get("/api/v1/kiosk/routines")
      .then((res) => { setRoutines(res.data); setInvalid(false); })
      .catch((err) => { if (err.response?.status === 401) setInvalid(true); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 5 * 60_000); return () => clearInterval(t); }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vuelve a la portada si nadie toca la pantalla
  useEffect(() => {
    if (!selected && !focus) return;
    const t = setTimeout(() => { setFocus(null); setSelected(null); }, IDLE_MS);
    return () => clearTimeout(t);
  }, [selected, focus, dayIdx]);

  const open = async (r: RoutineCard) => {
    if (!client) return;
    try {
      const { data } = await client.get(`/api/v1/kiosk/routines/${r.id}`);
      setSelected(data);
      setDayIdx(0);
    } catch { /* la lista se refresca sola */ }
  };

  if (!token || invalid) {
    return (
      <div className="min-h-screen bg-[#0a0f0a] text-white flex flex-col items-center justify-center gap-4 p-8 text-center">
        <BrandMark />
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-lg font-semibold">Esta pantalla no está vinculada al gym</p>
        <p className="text-sm text-white/60 max-w-md">Abre en este equipo el enlace que se genera en Ajustes › Dispositivos, creando uno de tipo Pantalla.</p>
      </div>
    );
  }

  const day = selected?.days[Math.min(dayIdx, (selected?.days.length ?? 1) - 1)];

  return (
    <div className="min-h-screen bg-[#0a0f0a] text-white select-none">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {selected ? (
            <button type="button" onClick={() => (focus ? setFocus(null) : setSelected(null))} className="flex items-center gap-2 text-white/80 hover:text-white text-lg"><ArrowLeft className="h-6 w-6" /> {focus ? selected.name : "Rutinas"}</button>
          ) : (
            <BrandMark />
          )}
        </div>
        <p className="text-sm text-white/50 flex items-center gap-2"><Dumbbell className="h-4 w-4 text-[var(--color-primary)]" /> Toca una rutina para ver los ejercicios</p>
      </header>

      <main className="p-6">
        <AnimatePresence mode="wait">
          {!selected ? (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-2xl bg-white/5 animate-pulse" />) : routines.length === 0 ? (
                <p className="col-span-full text-center text-white/50 py-20 text-lg">Aún no hay rutinas publicadas en pantalla.</p>
              ) : routines.map((r) => (
                <button key={r.id} type="button" onClick={() => open(r)} className="text-left rounded-2xl border border-white/10 bg-white/5 p-6 hover:border-[var(--color-primary)]/60 hover:bg-white/10 transition-colors active:scale-[0.99]">
                  <p className="text-xs uppercase tracking-wider text-[var(--color-primary)] font-bold">{r.goal_label ?? "Rutina"} · {r.level_es}</p>
                  <h2 className="text-2xl font-extrabold mt-1">{r.name}</h2>
                  {r.description && <p className="text-sm text-white/60 mt-2 line-clamp-2">{r.description}</p>}
                  <p className="text-sm text-white/50 mt-4 flex items-center gap-1.5">{r.days_per_week} día{r.days_per_week === 1 ? "" : "s"} por semana <ChevronRight className="h-4 w-4" /></p>
                </button>
              ))}
            </motion.div>
          ) : focus ? (
            <motion.div key="focus" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 items-start">
              <div className="flex justify-center">
                <ExerciseFigure images={focus.exercise?.images ?? []} videoUrl={focus.exercise?.video_url} alt={focus.exercise_name} size="lg" className="!h-[28rem] !w-[28rem] max-w-full" playable />
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-sm uppercase tracking-wider text-[var(--color-primary)] font-bold">{focus.exercise?.primary_muscles_es.join(" · ")} · {focus.exercise?.equipment_es}</p>
                  <h2 className="text-4xl font-extrabold mt-1">{focus.exercise_name}</h2>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[["Series", String(focus.sets)], ["Reps", focus.reps], ["Descanso", `${focus.rest_seconds}s`]].map(([l, v]) => (
                    <div key={l} className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center"><p className="text-xs text-white/50 uppercase">{l}</p><p className="text-3xl font-extrabold font-mono">{v}</p></div>
                  ))}
                </div>
                {focus.notes && <p className="text-lg text-[var(--color-primary)]">{focus.notes}</p>}
                {focus.exercise && (
                  <ol className="list-decimal pl-6 space-y-2 text-lg text-white/85 max-h-64 overflow-y-auto">
                    {focus.exercise.instructions.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                )}
                <div className="flex items-center gap-4 flex-wrap text-sm">
                  <a
                    href={youtubeSearchUrl(focus.exercise_name)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:text-white hover:border-[var(--color-primary)]/60"
                  >
                    <PlayCircle className="h-4 w-4" /> Ver en video
                  </a>
                  {focus.exercise?.video_author && (
                    <span className="text-white/40 text-xs">
                      Video: {focus.exercise.video_author}
                      {focus.exercise.video_license ? ` · ${focus.exercise.video_license}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="routine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
              <div>
                <h2 className="text-3xl font-extrabold">{selected.name}</h2>
                {selected.description && <p className="text-white/60 mt-1">{selected.description}</p>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {selected.days.map((d, i) => (
                  <button key={d.id} type="button" onClick={() => setDayIdx(i)} className={cn("rounded-xl px-5 py-2.5 text-lg font-semibold border transition-colors", i === dayIdx ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] border-transparent" : "border-white/15 text-white/70 hover:text-white")}>{d.title}</button>
                ))}
              </div>
              {day?.notes && <p className="text-white/60">{day.notes}</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {day?.exercises.map((ex, i) => (
                  <button key={ex.id} type="button" onClick={() => setFocus(ex)} className="text-left flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 hover:border-[var(--color-primary)]/60 transition-colors active:scale-[0.99]">
                    <span className="text-white/40 font-bold text-xl w-6">{i + 1}</span>
                    <ExerciseFigure images={ex.exercise?.images ?? []} videoUrl={ex.exercise?.video_url} alt={ex.exercise_name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold leading-tight line-clamp-2">{ex.exercise_name}</p>
                      <p className="text-sm text-white/60">{ex.sets} × {ex.reps} <span className="inline-flex items-center gap-1 ml-2"><Timer className="h-3.5 w-3.5" />{ex.rest_seconds}s</span></p>
                      {ex.notes && <p className="text-xs text-[var(--color-primary)] line-clamp-1">{ex.notes}</p>}
                    </div>
                    <ChevronRight className="h-5 w-5 text-white/40 shrink-0" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
