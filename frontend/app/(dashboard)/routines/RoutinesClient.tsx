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
import { ExerciseFigure, youtubeSearchUrl } from "@/components/routines/ExerciseFigure";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useApiResource } from "@/hooks/useApiResource";
import { cn } from "@/lib/utils";
import { ArrowDownIcon as ArrowDown, ArrowLeftIcon as ArrowLeft, ArrowUpIcon as ArrowUp, ArchiveIcon as Archive, BarbellIcon as Dumbbell, SpinnerGapIcon as Loader2, MonitorPlayIcon as MonitorPlay, PlusIcon as Plus, MagnifyingGlassIcon as Search, TrashIcon as Trash2, UsersIcon as Users, XIcon as X } from "@phosphor-icons/react";

interface Exercise {
  id: string; slug: string; name_es: string; name_en: string; category_es: string; level_es: string;
  equipment: string | null; equipment_es: string; primary_muscles: string[]; primary_muscles_es: string[];
  instructions: string[]; instructions_lang: string; images: string[];
  video_url?: string | null; video_source?: string | null; video_author?: string | null; video_license?: string | null;
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
      toast.error(parseApiError(err, "No se pudo abrir la rutina"));
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
      toast.error(parseApiError(err, "Error guardando la rutina"));
    } finally {
      setSaving(false);
    }
  };

  const [toArchive, setToArchive] = useState<string | null>(null);
  const archive = async (r: RoutineRow) => {
    setToArchive(null);
    try {
      await client().delete(`/api/v1/routines/${r.id}`);
      toast.success("Rutina archivada");
      await routines.refetch();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error archivando"));
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
    <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }} className="space-y-6">
      <PageHeader
        module="classes"
        title="Rutinas"
        subtitle={facets.data ? `Biblioteca de ${facets.data.total} ejercicios con animación. Arma rutinas, asígnalas a socios y muéstralas en la pantalla del gym.` : "Arma rutinas con la biblioteca de ejercicios"}
        action={isOwnerOrAdmin ? (
          <Button onClick={openNew}>
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
          action={isOwnerOrAdmin ? <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Crear la primera</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {routines.data.map((r, i) => (
            <motion.div key={r.id} initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}>
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
                  {isOwnerOrAdmin && (toArchive === r.id ? (
                    <span className="flex items-center gap-1" title="Los socios que la tienen asignada la conservan en su historial">
                      <Button variant="destructive" onClick={() => archive(r)} className="h-8 text-xs">Archivar</Button>
                      <Button variant="ghost" onClick={() => setToArchive(null)} className="h-8 text-xs">No</Button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setToArchive(r.id)} title="Archivar" aria-label="Archivar rutina" className="h-8 w-8 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-danger)] transition-colors">
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}

      <GlassCard className="p-4 flex items-start gap-3">
        <MonitorPlay className="h-5 w-5 text-primary-ink shrink-0 mt-0.5" />
        <div className="text-sm text-[var(--text-muted)]">
          <p className="text-[var(--text-base)] font-medium">Pantalla del gym</p>
          Las rutinas marcadas &ldquo;En pantalla&rdquo; se ven en <code className="text-xs">/screen</code> con el mismo enlace de dispositivo del kiosko (Ajustes › Kiosko). Ideal para una TV o tablet en el salón: cada socio toca una rutina y ve el movimiento de cada ejercicio.
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
    <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-base)]"><ArrowLeft className="h-4 w-4" /> Rutinas</button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{form.days.length} día{form.days.length === 1 ? "" : "s"} · {totalExercises} ejercicio{totalExercises === 1 ? "" : "s"}</span>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving}>
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
              <button key={d.key} type="button" onClick={() => setActiveDay(i)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors", i === activeDay ? "bg-primary text-primary-contrast border-transparent" : "border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]")}>
                {d.title || `Día ${i + 1}`} <span className="opacity-70">· {d.exercises.length}</span>
              </button>
            ))}
            {form.days.length < 7 && <button type="button" onClick={addDay} className="rounded-lg px-2.5 py-1.5 text-xs border border-dashed border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"><Plus className="h-3.5 w-3.5 inline" /> Día</button>}
          </div>
          <div className="flex items-center gap-2">
            <Input value={day.title} onChange={(e) => setDay(activeDay, { title: e.target.value })} placeholder="Título del día (Empuje, Pierna, Full body...)" className="h-8 text-sm" />
            <Input value={day.notes} onChange={(e) => setDay(activeDay, { notes: e.target.value })} placeholder="Nota del día (opcional)" className="h-8 text-sm" />
            {form.days.length > 1 && <button type="button" onClick={() => removeDay(activeDay)} title="Quitar día" className="h-8 w-8 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-danger)] shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>

          {day.exercises.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8 rounded-[var(--radius-md)] border-dashed bg-muted/60">Busca un ejercicio a la derecha y agrégalo a este día.</p>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {day.exercises.map((x, idx) => (
                  <motion.div key={x.key} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-3 rounded-[var(--radius-md)] p-2.5 bg-muted/60">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] w-4 pt-1">{idx + 1}</span>
                    <ExerciseFigure images={x.exercise.images} videoUrl={x.exercise.video_url} alt={x.exercise.name_es} size="sm" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <button type="button" onClick={() => setPreview(x.exercise)} className="text-sm font-semibold text-[var(--text-base)] truncate hover:text-primary-ink text-left">{x.exercise.name_es}</button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button type="button" onClick={() => move(x.key, -1)} className="h-6 w-6 rounded-md text-[var(--text-muted)] hover:text-[var(--text-base)] flex items-center justify-center"><ArrowUp className="h-3 w-3" /></button>
                          <button type="button" onClick={() => move(x.key, 1)} className="h-6 w-6 rounded-md text-[var(--text-muted)] hover:text-[var(--text-base)] flex items-center justify-center"><ArrowDown className="h-3 w-3" /></button>
                          <button type="button" onClick={() => setDay(activeDay, { exercises: day.exercises.filter((y) => y.key !== x.key) })} className="h-6 w-6 rounded-md text-[var(--text-muted)] hover:text-[var(--signal-danger)] flex items-center justify-center"><X className="h-3 w-3" /></button>
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
              <div key={e.id} className="flex items-center gap-2.5 rounded-[var(--radius-md)] p-2 group bg-muted/60">
                <ExerciseFigure images={e.images} videoUrl={e.video_url} alt={e.name_es} size="sm" />
                <button type="button" onClick={() => setPreview(e)} className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-semibold text-[var(--text-base)] truncate group-hover:text-primary-ink">{e.name_es}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">{e.primary_muscles_es.join(", ")} · {e.equipment_es} · {e.level_es}</p>
                </button>
                <button type="button" onClick={() => addExercise(e)} className="h-7 w-7 rounded-lg bg-primary text-primary-contrast flex items-center justify-center shrink-0 hover:opacity-90" title="Agregar al día"><Plus className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
            <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-[var(--radius-lg)] bg-[var(--bg-card)] p-5 space-y-3 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-base)]">{preview.name_es}</h3>
                  <p className="text-xs text-[var(--text-muted)]">{preview.name_en} · {preview.primary_muscles_es.join(", ")} · {preview.equipment_es}</p>
                </div>
                <button type="button" onClick={() => setPreview(null)} className="text-[var(--text-muted)] hover:text-[var(--text-base)]"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex justify-center"><ExerciseFigure images={preview.images} videoUrl={preview.video_url} alt={preview.name_es} size="lg" playable /></div>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-[var(--text-base)] max-h-48 overflow-y-auto">
                {preview.instructions.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              {preview.instructions_lang === "en" && <p className="text-[10px] text-[var(--text-muted)]">Instrucciones en inglés (fuente abierta); la traducción llega con la app.</p>}
              <ExerciseVideoBox exercise={preview} onChanged={(url, source) => setPreview({ ...preview, video_url: url, video_source: source })} />
              <Button onClick={() => { addExercise(preview); setPreview(null); }} className="w-full"><Plus className="h-4 w-4 mr-1.5" /> Agregar a {day.title || "este día"}</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


function ExerciseVideoBox({ exercise, onChanged }: { exercise: Exercise; onChanged: (url: string | null, source: string | null) => void }) {
  const { data: session } = useSession();
  const isOwnerOrAdmin = session?.role === "owner" || session?.role === "admin";
  const [busy, setBusy] = useState(false);
  const client = () => apiClient(session?.accessToken as string);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // Content-Type en undefined: axios pone el boundary del multipart
      const { data } = await client().post(`/api/v1/exercises/${exercise.id}/video`, form, {
        headers: { "Content-Type": undefined },
      });
      toast.success("Video del gym guardado");
      onChanged(data.video_url, "gym");
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo subir el video"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await client().delete(`/api/v1/exercises/${exercise.id}/video`);
      toast.success("Video del gym eliminado");
      onChanged(null, null);
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo eliminar"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-md)] p-3 space-y-2 bg-muted/60">
      <p className="text-xs text-[var(--text-muted)]">
        {exercise.video_source === "gym"
          ? "Se está mostrando el video de tu gym."
          : exercise.video_source === "catalogo"
          ? `Video del catálogo abierto${exercise.video_author ? ` · ${exercise.video_author}` : ""}.`
          : "Este ejercicio solo tiene las dos fotos. Graba un clip corto con tus máquinas y el socio verá el movimiento real."}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {isOwnerOrAdmin && (
          <label className="text-xs rounded-lg border border-[var(--border-base)] px-3 py-1.5 cursor-pointer hover:bg-[var(--bg-muted)]">
            {busy ? "Subiendo..." : exercise.video_source === "gym" ? "Reemplazar video" : "Subir video del gym"}
            <input
              type="file"
              accept="video/mp4,video/webm"
              className="hidden"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
            />
          </label>
        )}
        {isOwnerOrAdmin && exercise.video_source === "gym" && (
          <button type="button" onClick={remove} disabled={busy} className="text-xs text-[var(--text-muted)] hover:text-[var(--signal-danger)]">Quitar</button>
        )}
        <a
          href={youtubeSearchUrl(exercise.name_es)}
          target="_blank"
          rel="noreferrer"
          className="text-xs rounded-lg border border-[var(--border-base)] px-3 py-1.5 hover:bg-[var(--bg-muted)]"
        >
          Ver en video
        </a>
      </div>
      <p className="text-[10px] text-[var(--text-muted)]">MP4 o WebM, hasta 25 MB. Con 5-8 segundos en bucle basta.</p>
    </div>
  );
}
