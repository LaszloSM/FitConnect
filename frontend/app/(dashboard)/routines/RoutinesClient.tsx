/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExerciseFigure } from "@/components/routines/ExerciseFigure";
import { apiClient } from "@/lib/api";
import { useApiResource } from "@/hooks/useApiResource";
import { cn } from "@/lib/utils";
import {
  ArrowDown, ArrowLeft, ArrowUp, Archive, Dumbbell, Loader2, MonitorPlay, Plus, Search, Trash2, Users, X,
} from "lucide-react";

interface Exercise {
  id: string; slug: string; name_es: string; name_en: string; category_es: string; level_es: string;
  equipment: string | null; equipment_es: string; primary_muscles: string[]; primary_muscles_es: string[];
  instructions: string[]; instructions_lang: string; images: string[];
}
interface RoutineExercise { key: string; exercise: Exercise; sets: number; reps: string; rest_seconds: number; notes: string }
interface RoutineDay { key: string; title: string; notes: string; exercises: RoutineExercise[] }
interface RoutineForm { name: string; description: string; goal: string; level: string; is_public_on_screen: boolean; days: RoutineDay[] }
interface RoutineRow { id: string; name: string; goal_label: string | null; level_es: string; days_per_week: number; is_public_on_screen: boolean; is_active: boolean; assigned_count: number }
interface Facets { total: number; muscles: { key: string; label: string }[]; equipment: { key: string; label: string }[]; goals: { key: string; label: string }[]; levels: { key: string; label: string }[] }

const LEVELS = [["beginner", "Principiante"], ["intermediate", "Intermedio"], ["expert", "Avanzado"]] as const;
const key = () => Math.random().toString(36).slice(2, 9);
const emptyForm = (): RoutineForm => ({ name: "", description: "", goal: "general", level: "beginner", is_public_on_screen: false, days: [{ key: key(), title: "Día 1", notes: "", exercises: [] }] });

export default function RoutinesClient() {
  const { data: session } = useSession();
  const isOwnerOrAdmin = session?.role === "owner" || session?.role === "admin";
  const routines = useApiResource<RoutineRow[]>("/api/v1/routines", []);
  const facets = useApiResource<Facets | null>("/api/v1/exercises/facets", null);
  const [editing, setEditing] = useState<{ id: string | null; form: RoutineForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const client = () => apiClient(session?.accessToken as string);

  const openNew = () => setEditing({ id: null, form: emptyForm() });
  const openEdit = async (r: RoutineRow) => {
    try {
      const { data } = await client().get(`/api/v1/routines/${r.id}`);
      setEditing({
        id: r.id,
        form: {
          name: data.name, description: data.description ?? "", goal: data.goal ?? "general", level: data.level, is_public_on_screen: data.is_public_on_screen,
          days: data.days.map((d: any) => ({
            key: key(), title: d.title, notes: d.notes ?? "",
            exercises: d.exercises.map((e: any) => ({ key: key(), exercise: e.exercise, sets: e.sets, reps: e.reps, rest_seconds: e.rest_seconds, notes: e.notes ?? "" })),
          })),
        },
      });
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "No se pudo abrir la rutina");
    }
  };

  const save = async () => {
    if (!editing || !session?.accessToken) return;
    const f = editing.form;
    if (!f.name.trim()) { toast.error("Ponle nombre a la rutina"); return; }
    if (f.days.some((d) => d.exercises.length === 0)) { toast.error("Cada día necesita al menos un ejercicio"); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(), description: f.description.trim() || null, goal: f.goal, level: f.level, is_public_on_screen: f.is_public_on_screen, is_active: true,
        days: f.days.map((d) => ({
          title: d.title.trim() || "Día", notes: d.notes.trim() || null,
          exercises: d.exercises.map((e) => ({ exercise_id: e.exercise.id, sets: e.sets, reps: e.reps.trim() || "10-12", rest_seconds: e.rest_seconds, notes: e.notes.trim() || null })),
        })),
      };
      if (editing.id) await client().put(`/api/v1/routines/${editing.id}`, payload);
      else await client().post("/api/v1/routines", payload);
      toast.success(editing.id ? "Rutina actualizada" : "Rutina creada");
      setEditing(null);
      await routines.refetch();
    } catch (err: any) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Error guardando la rutina");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (r: RoutineRow) => {
    if (!window.confirm(`¿Archivar "${r.name}"? Los socios que la tienen asignada la conservan en su historial.`)) return;
    try {
      await client().delete(`/api/v1/routines/${r.id}`);
      toast.success("Rutina archivada");
      await routines.refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error archivando");
    }
  };

  if (editing) {
    return (
      <RoutineEditor
        form={editing.form}
        facets={facets.data}
        onChange={(form) => setEditing({ ...editing, form })}
        onCancel={() => setEditing(null)}
        onSave={save}
        saving={saving}
        isNew={!editing.id}
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }} className="space-y-6">
      <PageHeader
        module="classes"
        title="Rutinas"
        subtitle={facets.data ? `Biblioteca de ${facets.data.total} ejercicios con animación. Arma rutinas, asígnalas a socios y muéstralas en la pantalla del gym.` : "Arma rutinas con la biblioteca de ejercicios"}
        action={isOwnerOrAdmin ? (
          <Button onClick={openNew} className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)]">
            <Plus className="h-4 w-4 mr-2" /> Nueva rutina
          </Button>
        ) : undefined}
      />

      {routines.loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-36 rounded-xl" />)}</div>
      ) : routines.data.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="h-10 w-10 text-[var(--text-muted)] opacity-50" />}
          title="Aún no hay rutinas"
          description="Crea una rutina básica (por ejemplo, full body 3 días) y publícala en la pantalla del gym."
          action={isOwnerOrAdmin ? <Button onClick={openNew} className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold"><Plus className="h-4 w-4 mr-2" /> Crear la primera</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {routines.data.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}>
              <GlassCard className="p-4 h-full flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-base)] truncate">{r.name}</h3>
                    <p className="text-xs text-[var(--text-muted)]">{r.goal_label ?? "Sin objetivo"} · {r.level_es} · {r.days_per_week} día{r.days_per_week === 1 ? "" : "s"}/semana</p>
                  </div>
                  {r.is_public_on_screen && <StatusBadge status="screen" label="En pantalla" tone="violet" />}
                </div>
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {r.assigned_count} socio{r.assigned_count === 1 ? "" : "s"} con esta rutina</p>
                <div className="mt-auto flex items-center gap-2">
                  <Button variant="outline" onClick={() => openEdit(r)} className="h-8 text-xs flex-1">{isOwnerOrAdmin ? "Editar" : "Ver"}</Button>
                  {isOwnerOrAdmin && (
                    <button type="button" onClick={() => archive(r)} title="Archivar" className="h-8 w-8 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 transition-colors">
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}

      <GlassCard className="p-4 flex items-start gap-3">
        <MonitorPlay className="h-5 w-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
        <div className="text-sm text-[var(--text-muted)]">
          <p className="text-[var(--text-base)] font-medium">Pantalla del gym</p>
          Las rutinas marcadas "En pantalla" se ven en <code className="text-xs">/screen</code> con el mismo enlace de dispositivo del kiosko (Ajustes › Kiosko). Ideal para una TV o tablet en el salón: cada socio toca una rutina y ve el movimiento de cada ejercicio.
        </div>
      </GlassCard>
    </motion.div>
  );
}

function RoutineEditor({ form, facets, onChange, onCancel, onSave, saving, isNew }: {
  form: RoutineForm; facets: Facets | null; onChange: (f: RoutineForm) => void; onCancel: () => void; onSave: () => void; saving: boolean; isNew: boolean;
}) {
  const { data: session } = useSession();
  const [activeDay, setActiveDay] = useState(0);
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [results, setResults] = useState<Exercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<Exercise | null>(null);
  const day = form.days[Math.min(activeDay, form.days.length - 1)];

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      apiClient(session.accessToken as string)
        .get("/api/v1/exercises", { params: { q, muscle: muscle || undefined, limit: 30 } })
        .then((res) => { if (!cancelled) setResults(res.data); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, muscle, session?.accessToken]);

  const setDay = (idx: number, patch: Partial<RoutineDay>) => onChange({ ...form, days: form.days.map((d, i) => (i === idx ? { ...d, ...patch } : d)) });
  const addDay = () => { onChange({ ...form, days: [...form.days, { key: key(), title: `Día ${form.days.length + 1}`, notes: "", exercises: [] }] }); setActiveDay(form.days.length); };
  const removeDay = (idx: number) => { if (form.days.length === 1) return; onChange({ ...form, days: form.days.filter((_, i) => i !== idx) }); setActiveDay(Math.max(0, idx - 1)); };
  const addExercise = (e: Exercise) => {
    if (day.exercises.some((x) => x.exercise.id === e.id)) { toast.info("Ese ejercicio ya está en este día"); return; }
    setDay(activeDay, { exercises: [...day.exercises, { key: key(), exercise: e, sets: 3, reps: "10-12", rest_seconds: 60, notes: "" }] });
  };
  const setEx = (k: string, patch: Partial<RoutineExercise>) => setDay(activeDay, { exercises: day.exercises.map((x) => (x.key === k ? { ...x, ...patch } : x)) });
  const move = (k: string, dir: -1 | 1) => {
    const idx = day.exercises.findIndex((x) => x.key === k);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= day.exercises.length) return;
    const next = [...day.exercises];
    [next[idx], next[j]] = [next[j], next[idx]];
    setDay(activeDay, { exercises: next });
  };
  const totalExercises = useMemo(() => form.days.reduce((a, d) => a + d.exercises.length, 0), [form.days]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-base)]"><ArrowLeft className="h-4 w-4" /> Rutinas</button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{form.days.length} día{form.days.length === 1 ? "" : "s"} · {totalExercises} ejercicio{totalExercises === 1 ? "" : "s"}</span>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving} className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isNew ? "Crear rutina" : "Guardar cambios"}
          </Button>
        </div>
      </div>

      <GlassCard className="p-4 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-muted)]">Nombre</label>
          <Input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Full body 3 días, Pierna y glúteo, Tren superior..." />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-muted)]">Objetivo</label>
          <select value={form.goal} onChange={(e) => onChange({ ...form, goal: e.target.value })} className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)]">
            {(facets?.goals ?? [{ key: "general", label: "General" }]).map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-muted)]">Nivel</label>
          <select value={form.level} onChange={(e) => onChange({ ...form, level: e.target.value })} className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)]">
            {LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <Switch checked={form.is_public_on_screen} onCheckedChange={(v) => onChange({ ...form, is_public_on_screen: v })} label="En pantalla del gym" />
        <div className="md:col-span-4 space-y-1">
          <label className="text-xs text-[var(--text-muted)]">Descripción (opcional)</label>
          <Input value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} placeholder="Para quién es, cómo progresar, qué cuidar..." />
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {form.days.map((d, i) => (
              <button key={d.key} type="button" onClick={() => setActiveDay(i)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors", i === activeDay ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] border-transparent" : "border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]")}>
                {d.title || `Día ${i + 1}`} <span className="opacity-70">· {d.exercises.length}</span>
              </button>
            ))}
            {form.days.length < 7 && <button type="button" onClick={addDay} className="rounded-lg px-2.5 py-1.5 text-xs border border-dashed border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"><Plus className="h-3.5 w-3.5 inline" /> Día</button>}
          </div>
          <div className="flex items-center gap-2">
            <Input value={day.title} onChange={(e) => setDay(activeDay, { title: e.target.value })} placeholder="Título del día (Empuje, Pierna, Full body...)" className="h-8 text-sm" />
            <Input value={day.notes} onChange={(e) => setDay(activeDay, { notes: e.target.value })} placeholder="Nota del día (opcional)" className="h-8 text-sm" />
            {form.days.length > 1 && <button type="button" onClick={() => removeDay(activeDay)} title="Quitar día" className="h-8 w-8 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>

          {day.exercises.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8 rounded-xl border border-dashed border-[var(--border-base)]">Busca un ejercicio a la derecha y agrégalo a este día.</p>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {day.exercises.map((x, idx) => (
                  <motion.div key={x.key} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-2.5">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] w-4 pt-1">{idx + 1}</span>
                    <ExerciseFigure images={x.exercise.images} alt={x.exercise.name_es} size="sm" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <button type="button" onClick={() => setPreview(x.exercise)} className="text-sm font-semibold text-[var(--text-base)] truncate hover:text-[var(--color-primary)] text-left">{x.exercise.name_es}</button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button type="button" onClick={() => move(x.key, -1)} className="h-6 w-6 rounded-md text-[var(--text-muted)] hover:text-[var(--text-base)] flex items-center justify-center"><ArrowUp className="h-3 w-3" /></button>
                          <button type="button" onClick={() => move(x.key, 1)} className="h-6 w-6 rounded-md text-[var(--text-muted)] hover:text-[var(--text-base)] flex items-center justify-center"><ArrowDown className="h-3 w-3" /></button>
                          <button type="button" onClick={() => setDay(activeDay, { exercises: day.exercises.filter((y) => y.key !== x.key) })} className="h-6 w-6 rounded-md text-[var(--text-muted)] hover:text-red-500 flex items-center justify-center"><X className="h-3 w-3" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-[64px_96px_84px_minmax(0,1fr)] gap-1.5 items-center">
                        <label className="text-[10px] text-[var(--text-muted)] flex flex-col">Series<Input type="number" min={1} max={20} value={x.sets} onChange={(e) => setEx(x.key, { sets: Math.max(1, Number(e.target.value)) })} className="h-7 text-xs px-2" /></label>
                        <label className="text-[10px] text-[var(--text-muted)] flex flex-col">Reps<Input value={x.reps} onChange={(e) => setEx(x.key, { reps: e.target.value })} placeholder="10-12" className="h-7 text-xs px-2" /></label>
                        <label className="text-[10px] text-[var(--text-muted)] flex flex-col">Descanso (s)<Input type="number" min={0} max={900} step={15} value={x.rest_seconds} onChange={(e) => setEx(x.key, { rest_seconds: Math.max(0, Number(e.target.value)) })} className="h-7 text-xs px-2" /></label>
                        <label className="text-[10px] text-[var(--text-muted)] flex flex-col">Nota<Input value={x.notes} onChange={(e) => setEx(x.key, { notes: e.target.value })} placeholder="tempo, técnica..." className="h-7 text-xs px-2" /></label>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4 space-y-3 lg:sticky lg:top-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[var(--text-muted)]" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ejercicio (español o inglés)" className="h-8 text-sm" autoFocus />
          </div>
          <div className="flex gap-1 flex-wrap">
            <button type="button" onClick={() => setMuscle("")} className={cn("rounded-full px-2 py-0.5 text-[11px] border", !muscle ? "bg-[var(--text-base)] text-[var(--bg-base)] border-transparent" : "border-[var(--border-base)] text-[var(--text-muted)]")}>Todos</button>
            {(facets?.muscles ?? []).map((m) => (
              <button key={m.key} type="button" onClick={() => setMuscle(m.key === muscle ? "" : m.key)} className={cn("rounded-full px-2 py-0.5 text-[11px] border", muscle === m.key ? "bg-[var(--text-base)] text-[var(--bg-base)] border-transparent" : "border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]")}>{m.label}</button>
            ))}
          </div>
          <div className="max-h-[520px] overflow-y-auto pr-1 space-y-1.5">
            {searching && results.length === 0 ? <div className="skeleton h-16 rounded-xl" /> : results.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-6">{facets && facets.total === 0 ? "La biblioteca está vacía: ejecuta scripts/import_exercises.py en el backend." : "Sin resultados"}</p>
            ) : results.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-2 group">
                <ExerciseFigure images={e.images} alt={e.name_es} size="sm" />
                <button type="button" onClick={() => setPreview(e)} className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-semibold text-[var(--text-base)] truncate group-hover:text-[var(--color-primary)]">{e.name_es}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">{e.primary_muscles_es.join(", ")} · {e.equipment_es} · {e.level_es}</p>
                </button>
                <button type="button" onClick={() => addExercise(e)} className="h-7 w-7 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-contrast)] flex items-center justify-center shrink-0 hover:bg-[var(--color-primary-hover)]" title="Agregar al día"><Plus className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
            <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-[var(--bg-card)] border border-[var(--border-base)] p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-base)]">{preview.name_es}</h3>
                  <p className="text-xs text-[var(--text-muted)]">{preview.name_en} · {preview.primary_muscles_es.join(", ")} · {preview.equipment_es}</p>
                </div>
                <button type="button" onClick={() => setPreview(null)} className="text-[var(--text-muted)] hover:text-[var(--text-base)]"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex justify-center"><ExerciseFigure images={preview.images} alt={preview.name_es} size="lg" /></div>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-[var(--text-base)] max-h-48 overflow-y-auto">
                {preview.instructions.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              {preview.instructions_lang === "en" && <p className="text-[10px] text-[var(--text-muted)]">Instrucciones en inglés (fuente abierta); la traducción llega con la app.</p>}
              <Button onClick={() => { addExercise(preview); setPreview(null); }} className="w-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold"><Plus className="h-4 w-4 mr-1.5" /> Agregar a {day.title || "este día"}</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
