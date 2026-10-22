"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import type { ClassCategory, ClassDifficulty, GymClass } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/form-dialog";
import { WeekdayPicker } from "@/components/ui/weekday-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusIcon as Plus, WarningCircleIcon as AlertCircle, UsersIcon as Users, CaretDownIcon as ChevronDown, CaretUpIcon as ChevronUp, CalendarDotsIcon as CalendarClock, PencilSimpleIcon as Pencil, TrashIcon as Trash2, XIcon as X } from "@phosphor-icons/react";
import Link from "next/link";
import MemberSelect from "@/components/common/MemberSelect";

interface Enrollment {
  id: string;
  member_id: string;
  member_name: string;
  member_email: string;
}

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";
const selectCls =
  "w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-1 text-sm text-[var(--text-base)]";

const CATEGORIES = [
  { value: "yoga", label: "Yoga" },
  { value: "crossfit", label: "Crossfit" },
  { value: "spinning", label: "Spinning" },
  { value: "pilates", label: "Pilates" },
  { value: "funcional", label: "Funcional" },
  { value: "zumba", label: "Zumba" },
  { value: "boxeo", label: "Boxeo" },
  { value: "natacion", label: "Natación" },
  { value: "otro", label: "Otro" },
] as const satisfies readonly { value: ClassCategory; label: string }[];

const CATEGORY_LABEL = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label])
) as Record<ClassCategory, string>;

const DIFFICULTIES = [
  { value: "beginner", label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzado" },
] as const satisfies readonly { value: ClassDifficulty; label: string }[];

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const COLOR_OPTIONS = [
  { value: "#F97316", label: "Naranja" },
  { value: "#3B82F6", label: "Azul" },
  { value: "#22C55E", label: "Verde" },
  { value: "#EF4444", label: "Rojo" },
  { value: "#A855F7", label: "Morado" },
  { value: "#EC4899", label: "Rosa" },
  { value: "#06B6D4", label: "Cian" },
  { value: "#FACC15", label: "Amarillo" },
];

function buildSchedulePreview(weekdays: number[], startTime: string, durationMinutes: string): string {
  if (weekdays.length === 0 && !startTime) return "";
  const days = weekdays.map((d) => DAY_LABELS[d]).join(", ");
  const time = startTime
    ? (() => {
        const [h, m] = startTime.split(":").map(Number);
        const period = h >= 12 ? "pm" : "am";
        const hour12 = h % 12 || 12;
        return `${hour12}:${String(m).padStart(2, "0")}${period}`;
      })()
    : "";
  const dur = durationMinutes ? `${durationMinutes} min` : "";
  return [days, time, dur].filter(Boolean).join(" · ");
}

export default function ClassesClient() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [instructors, setInstructors] = useState<{ id: string; full_name: string; specialty: string | null }[]>([]);
  const [trainersFailed, setTrainersFailed] = useState(false);
  const [form, setForm] = useState({
    name: "",
    instructor: "",
    instructor_id: "",
    schedule: "",
    max_capacity: "20",
    duration_minutes: "60",
    description: "",
    category: "",
    difficulty: "",
    weekdays: [] as number[],
    start_time: "",
    color: "",
  });
  const [editing, setEditing] = useState<GymClass | null>(null);
  const [toDelete, setToDelete] = useState<GymClass | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<Record<string, Enrollment[]>>({});
  const [enrollMemberId, setEnrollMemberId] = useState<Record<string, string>>({});

  const fetchClasses = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/classes");
      setClasses(res.data);
      setError("");
    } catch (err: any) {
      setError(parseApiError(err, "Error cargando clases"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    setLoading(true);
    const client = apiClient(session.accessToken as string);
    client
      .get("/api/v1/classes")
      .then((res) => {
        if (!cancelled) { setClasses(res.data); setError(""); }
      })
      .catch((err: any) => {
        if (!cancelled)
          setError(parseApiError(err, "Error cargando clases"));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    client.get("/api/v1/instructors")
      .then((res) => { if (!cancelled) { setInstructors(res.data); setTrainersFailed(false); } })
      .catch(() => { if (!cancelled) setTrainersFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", instructor: "", instructor_id: "", schedule: "", max_capacity: "20", duration_minutes: "60", description: "", category: "", difficulty: "", weekdays: [], start_time: "", color: "" });
    setDialogOpen(true);
  };

  const openEdit = (cls: GymClass) => {
    setEditing(cls);
    setForm({
      name: cls.name,
      // Una clase creada antes de que el entrenador fuera obligatorio guarda el
      // nombre como texto suelto: el select arranca vacío y obliga a asignarlo.
      instructor: cls.instructor ?? "",
      instructor_id: cls.instructor_id ?? "",
      schedule: cls.schedule ?? "",
      max_capacity: String(cls.max_capacity),
      duration_minutes: String(cls.duration_minutes),
      description: cls.description ?? "",
      category: cls.category ?? "",
      difficulty: cls.difficulty ?? "",
      weekdays: cls.weekdays ?? [],
      start_time: cls.start_time ? cls.start_time.slice(0, 5) : "",
      color: cls.color ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);

    const schedulePreview = buildSchedulePreview(form.weekdays, form.start_time, form.duration_minutes);
    const payload = {
      name: form.name,
      instructor: form.instructor,
      instructor_id: form.instructor_id || undefined,
      schedule: schedulePreview || form.schedule || "",
      max_capacity: parseInt(form.max_capacity),
      duration_minutes: parseInt(form.duration_minutes),
      description: form.description || undefined,
      category: form.category || undefined,
      difficulty: form.difficulty || undefined,
      weekdays: form.weekdays.length > 0 ? form.weekdays : undefined,
      start_time: form.start_time || undefined,
      color: form.color || undefined,
    };

    try {
      if (editing) {
        await client.put(`/api/v1/classes/${editing.id}`, payload);
        toast.success("Clase actualizada");
      } else {
        await client.post("/api/v1/classes", payload);
        toast.success("Clase creada correctamente");
      }
      setDialogOpen(false);
      setEditing(null);
      setForm({ name: "", instructor: "", instructor_id: "", schedule: "", max_capacity: "20", duration_minutes: "60", description: "", category: "", difficulty: "", weekdays: [], start_time: "", color: "" });
      fetchClasses();
    } catch (err: unknown) {
      toast.error(parseApiError(err, "Error guardando clase"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!session?.accessToken || !toDelete) return;
    setSubmitting(true);
    try {
      const client = apiClient(session.accessToken as string);
      const { data } = await client.delete(`/api/v1/classes/${toDelete.id}`);
      // Con socios inscritos la clase no se destruye: se deja de dictar.
      toast.success(
        data?.archived
          ? `"${toDelete.name}" ya no se dicta. Se conserva porque tiene socios inscritos.`
          : `"${toDelete.name}" eliminada`
      );
      setToDelete(null);
      fetchClasses();
    } catch (err: unknown) {
      toast.error(parseApiError(err, "No se pudo eliminar la clase"));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpand = async (classId: string) => {
    if (expandedClass === classId) { setExpandedClass(null); return; }
    setExpandedClass(classId);
    if (!enrollments[classId] && session?.accessToken) {
      try {
        const client = apiClient(session.accessToken as string);
        const res = await client.get(`/api/v1/classes/${classId}/enrollments`);
        setEnrollments((prev) => ({ ...prev, [classId]: res.data }));
      } catch {
        setEnrollments((prev) => ({ ...prev, [classId]: [] }));
      }
    }
  };

  const handleEnroll = async (classId: string) => {
    const mId = enrollMemberId[classId];
    if (!mId || !session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.post(`/api/v1/classes/${classId}/enroll`, { member_id: mId });
      toast.success("Miembro inscrito");
      setEnrollMemberId((prev) => ({ ...prev, [classId]: "" }));
      const res = await client.get(`/api/v1/classes/${classId}/enrollments`);
      setEnrollments((prev) => ({ ...prev, [classId]: res.data }));
    } catch (err: any) {
      toast.error(parseApiError(err, "Error al inscribir"));
    }
  };

  const handleUnenroll = async (classId: string, enrollmentId: string) => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.delete(`/api/v1/classes/${classId}/enrollments/${enrollmentId}`);
      toast.success("Inscripción cancelada");
      const res = await client.get(`/api/v1/classes/${classId}/enrollments`);
      setEnrollments((prev) => ({ ...prev, [classId]: res.data }));
    } catch (err: any) {
      toast.error(parseApiError(err, "Error al cancelar la inscripción"));
    }
  };

  const schedulePreview = buildSchedulePreview(form.weekdays, form.start_time, form.duration_minutes);

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <PageHeader
          module="classes"
          title="Clases"
          subtitle="Gestiona clases grupales del gym"
          action={
            <div className="flex items-center gap-2">
              <Link
                href="/classes/agenda"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-base)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-base)] transition-colors"
              >
                <CalendarClock className="h-4 w-4" />
                Agenda
              </Link>
              <DialogTrigger
                render={
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nueva clase
                  </Button>
                }
              />
            </div>
          }
        />

        <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-base)] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-base)] font-display">
              {editing ? "Editar clase" : "Nueva clase"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Nombre</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Entrenador</Label>
                {instructors.length > 0 ? (
                  <select
                    value={form.instructor_id}
                    onChange={(e) => {
                      const selected = instructors.find((i) => i.id === e.target.value);
                      setForm({
                        ...form,
                        instructor_id: e.target.value,
                        instructor: selected?.full_name ?? "",
                      });
                    }}
                    required
                    className={selectCls}
                  >
                    <option value="">Selecciona un entrenador...</option>
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.full_name}{i.specialty ? `, ${i.specialty}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  /* Sin lista no se cae a texto libre: una clase con un nombre
                     suelto no tiene entrenador real y el detector de choques de
                     horario no puede validarla. */
                  <p className="text-xs text-[var(--text-muted)] rounded-[var(--radius-md)] px-3 py-2 bg-muted/60">
                    {trainersFailed ? (
                      <>No se pudo cargar el equipo. Recarga la página e inténtalo de nuevo.</>
                    ) : (
                      <>
                        Aún no hay entrenadores.{" "}
                        <Link href="/settings?tab=team" className="text-primary-ink font-medium underline">
                          Agrégalos en Equipo
                        </Link>{" "}
                        para poder asignarlos.
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Categoría</Label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Sin categoría</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Dificultad</Label>
                <div className="flex gap-2">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setForm({ ...form, difficulty: form.difficulty === d.value ? "" : d.value })}
                      className={cn(
                        "flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors",
                        form.difficulty === d.value
                          ? "bg-action text-action-ink border-transparent"
                          : "border-[var(--border-base)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Capacidad</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.max_capacity}
                  onChange={(e) => setForm({ ...form, max_capacity: e.target.value })}
                  required
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Duración</Label>
                <select
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                  className={selectCls}
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d} min</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Días de la semana</Label>
              <WeekdayPicker
                value={form.weekdays}
                onChange={(days) => setForm({ ...form, weekdays: days })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Hora de inicio</Label>
              <TimePicker
                value={form.start_time}
                onChange={(t) => setForm({ ...form, start_time: t })}
              />
            </div>

            {/* Schedule preview */}
            {schedulePreview && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-ink bg-muted/60">
                <span className="text-xs font-medium">{schedulePreview}</span>
              </div>
            )}

            {/* Color picker */}
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Color de la clase</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, color: form.color === c.value ? "" : c.value })}
                    title={c.label}
                    style={{ background: c.value }}
                    className={cn(
                      "h-7 w-7 rounded-full transition-[opacity,transform,box-shadow]",
                      form.color === c.value ? "ring-2 ring-offset-2 ring-[var(--text-base)] ring-offset-[var(--bg-card)]" : "opacity-70 hover:opacity-100 hover:scale-105"
                    )}
                    aria-label={c.label}
                    aria-pressed={form.color === c.value}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                className="text-[var(--text-muted)]"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting || instructors.length === 0}
              >
                {submitting ? "Guardando..." : editing ? "Guardar cambios" : "Crear clase"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <FormDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminar clase"
        description={
          toDelete
            ? `Se eliminan "${toDelete.name}" y sus sesiones programadas. Si tiene socios inscritos, la clase deja de dictarse pero se conserva.`
            : ""
        }
        onSubmit={handleDelete}
        submitLabel="Eliminar clase"
        submitting={submitting}
        destructive
      >
        <p className="text-sm text-[var(--text-muted)]">Esta acción no se puede deshacer.</p>
      </FormDialog>

      <GlassCard className="p-4">
        {error && (
          <div className="flex items-center gap-2 text-[var(--signal-danger)] mb-4">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                <TableHead className="text-[var(--text-muted)]">Nombre</TableHead>
                <TableHead className="text-[var(--text-muted)]">Entrenador</TableHead>
                <TableHead className="text-[var(--text-muted)]">Horario</TableHead>
                <TableHead className="text-[var(--text-muted)]">Capacidad</TableHead>
                <TableHead className="text-[var(--text-muted)]">Duración</TableHead>
                <TableHead className="text-[var(--text-muted)]">Estado</TableHead>
                <TableHead className="text-[var(--text-muted)]">Inscritos</TableHead>
                <TableHead className="text-[var(--text-muted)] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="border-[var(--border-base)]">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="skeleton h-4 rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : classes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      title="Sin clases registradas"
                      description="Crea la primera clase grupal del gym"
                      action={
                        <Button
                          onClick={openCreate}
                         
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Nueva clase
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                classes.map((cls) => (
                  <Fragment key={cls.id}>
                    <TableRow className="border-[var(--border-base)] hover:bg-[var(--bg-base)]">
                      <TableCell className="text-[var(--text-base)] font-medium">
                        <div className="flex items-center gap-2">
                          {cls.color && (
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ background: cls.color }}
                              aria-hidden
                            />
                          )}
                          <div>
                            {cls.name}
                            {cls.category && (
                              <span className="ml-1.5 text-xs text-[var(--text-muted)] font-normal">· {CATEGORY_LABEL[cls.category] ?? cls.category}</span>
                            )}
                            {cls.description && (
                              <p className="text-xs text-[var(--text-muted)] font-normal mt-0.5 line-clamp-1">
                                {cls.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[var(--text-muted)]">
                        {cls.instructor_id ? (
                          cls.instructor
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[var(--signal-warn)]">
                            <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                            {cls.instructor || "Sin asignar"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-[var(--text-muted)] text-xs">
                        {cls.schedule ||
                          buildSchedulePreview(cls.weekdays ?? [], cls.start_time?.slice(0, 5) ?? "", String(cls.duration_minutes)) ||
                          "-"}
                      </TableCell>
                      <TableCell className="text-[var(--text-base)]">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3 text-[var(--text-muted)]" aria-hidden="true" />
                          {cls.max_capacity}
                        </span>
                      </TableCell>
                      <TableCell className="text-[var(--text-muted)]">
                        {cls.duration_minutes} min
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            cls.is_active
                              ? "bg-[var(--signal-ok-bg)] text-[var(--signal-ok)]"
                              : "bg-[var(--signal-danger-bg)] text-[var(--signal-danger)]"
                          )}
                        >
                          {cls.is_active ? "Activa" : "Inactiva"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpand(cls.id)}
                          className="text-[var(--text-muted)] hover:text-[var(--text-base)] text-xs flex items-center gap-1 px-2 py-1"
                        >
                          {expandedClass === cls.id ? (
                            <><ChevronUp className="h-3 w-3" /> Ocultar</>
                          ) : (
                            <><ChevronDown className="h-3 w-3" /> Ver</>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(cls)}
                            title="Editar clase"
                            aria-label={`Editar ${cls.name}`}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(cls)}
                            title="Eliminar clase"
                            aria-label={`Eliminar ${cls.name}`}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-danger)] hover:bg-[var(--signal-danger-bg)] transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {expandedClass === cls.id && (
                      <TableRow className="border-[var(--border-base)]">
                        <TableCell
                          colSpan={8}
                          className="bg-[var(--bg-base)] p-4"
                        >
                          <div className="space-y-3">
                            <p className="text-sm font-medium text-[var(--text-base)]">
                              Inscritos (
                              <span className="text-primary-ink font-semibold">
                                {(enrollments[cls.id] || []).length}
                              </span>
                              /{cls.max_capacity})
                            </p>
                            <div className="space-y-1">
                              {(enrollments[cls.id] || []).map((enr) => (
                                <div
                                  key={enr.id}
                                  className="flex items-center justify-between gap-2 text-sm py-1.5 px-3 surface-1 rounded-lg group"
                                >
                                  <span className="text-[var(--text-base)] min-w-0 truncate">{enr.member_name}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[var(--text-muted)] text-xs hidden sm:inline">{enr.member_email}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleUnenroll(cls.id, enr.id)}
                                      title="Dar de baja"
                                      className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-danger)] hover:bg-[var(--signal-danger-bg)] transition-colors"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {(enrollments[cls.id] || []).length === 0 && (
                                <p className="text-[var(--text-muted)] text-xs py-2">
                                  Sin inscritos aún
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2 items-end pt-2 border-t border-[var(--border-base)]">
                              <div className="flex-1">
                                <MemberSelect
                                  value={enrollMemberId[cls.id] || ""}
                                  onChange={(id) =>
                                    setEnrollMemberId((prev) => ({ ...prev, [cls.id]: id }))
                                  }
                                />
                              </div>
                              <Button
                                type="button"
                                onClick={() => handleEnroll(cls.id)}
                                disabled={!enrollMemberId[cls.id]}
                               
                              >
                                Inscribir
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>

    </motion.div>
  );
}
