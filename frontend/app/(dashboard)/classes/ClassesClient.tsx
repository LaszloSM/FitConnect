"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, AlertCircle, Users, ChevronDown, ChevronUp, CalendarClock, X } from "lucide-react";
import Link from "next/link";
import { InstructorsCard } from "./InstructorsCard";
import MemberSelect from "@/components/common/MemberSelect";

interface GymClass {
  id: string;
  name: string;
  instructor: string;
  schedule: string | null;
  max_capacity: number;
  duration_minutes: number;
  is_active: boolean;
  description: string | null;
  category: string | null;
  difficulty: string | null;
  weekdays: number[] | null;
  start_time: string | null;
  color: string | null;
}

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
  "Yoga", "Crossfit", "Spinning", "Pilates", "Funcional", "Zumba", "Boxeo", "Natación", "Otro",
];

const DIFFICULTIES = [
  { value: "beginner", label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzado" },
];

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const COLOR_OPTIONS = [
  { value: "orange", bg: "bg-orange-500", label: "Naranja" },
  { value: "blue", bg: "bg-blue-500", label: "Azul" },
  { value: "green", bg: "bg-green-500", label: "Verde" },
  { value: "red", bg: "bg-red-500", label: "Rojo" },
  { value: "purple", bg: "bg-purple-500", label: "Morado" },
  { value: "pink", bg: "bg-pink-500", label: "Rosa" },
  { value: "cyan", bg: "bg-cyan-500", label: "Cian" },
  { value: "yellow", bg: "bg-yellow-400", label: "Amarillo" },
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
      setError(
        typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Error cargando clases"
      );
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
          setError(
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Error cargando clases"
          );
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    client.get("/api/v1/instructors")
      .then((res) => { if (!cancelled) setInstructors(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);

    // Build schedule string for compatibility
    const schedulePreview = buildSchedulePreview(form.weekdays, form.start_time, form.duration_minutes);

    try {
      await client.post("/api/v1/classes", {
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
      });
      toast.success("Clase creada correctamente");
      setDialogOpen(false);
      setForm({ name: "", instructor: "", instructor_id: "", schedule: "", max_capacity: "20", duration_minutes: "60", description: "", category: "", difficulty: "", weekdays: [], start_time: "", color: "" });
      fetchClasses();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail[0]?.msg
          : "Error guardando clase"
      );
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
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error al inscribir");
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
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error al cancelar la inscripción");
    }
  };

  const schedulePreview = buildSchedulePreview(form.weekdays, form.start_time, form.duration_minutes);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
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
                  <Button className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]">
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
              Nueva clase
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
                <Label className="text-[var(--text-muted)] text-sm">Instructor</Label>
                {instructors.length > 0 ? (
                  <select
                    value={form.instructor_id}
                    onChange={(e) => {
                      const selected = instructors.find((i) => i.id === e.target.value);
                      setForm({
                        ...form,
                        instructor_id: e.target.value,
                        instructor: selected?.full_name ?? form.instructor,
                      });
                    }}
                    required
                    className={selectCls}
                  >
                    <option value="">Selecciona un instructor...</option>
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.full_name}{i.specialty ? ` — ${i.specialty}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={form.instructor}
                    onChange={(e) => setForm({ ...form, instructor: e.target.value })}
                    required
                    placeholder="Nombre del instructor"
                    className={inputCls}
                  />
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
                    <option key={c} value={c}>{c}</option>
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
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] border-[var(--color-primary)]"
                          : "border-[var(--border-base)] text-[var(--text-muted)] hover:border-[var(--color-primary)]"
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
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary-hover)] dark:text-[var(--color-primary)]">
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
                    className={cn(
                      "h-7 w-7 rounded-full transition-all",
                      c.bg,
                      form.color === c.value ? "ring-2 ring-offset-2 ring-[var(--color-primary)] scale-110" : "opacity-70 hover:opacity-100 hover:scale-105"
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
                disabled={submitting}
                className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)]"
              >
                {submitting ? "Creando..." : "Crear clase"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <GlassCard className="p-4">
        {error && (
          <div className="flex items-center gap-2 text-red-600 mb-4">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                <TableHead className="text-[var(--text-muted)]">Nombre</TableHead>
                <TableHead className="text-[var(--text-muted)]">Instructor</TableHead>
                <TableHead className="text-[var(--text-muted)]">Horario</TableHead>
                <TableHead className="text-[var(--text-muted)]">Capacidad</TableHead>
                <TableHead className="text-[var(--text-muted)]">Duración</TableHead>
                <TableHead className="text-[var(--text-muted)]">Estado</TableHead>
                <TableHead className="text-[var(--text-muted)]">Inscritos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="border-[var(--border-base)]">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="skeleton h-4 rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : classes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      title="Sin clases registradas"
                      description="Crea la primera clase grupal del gym"
                      action={
                        <Button
                          onClick={() => setDialogOpen(true)}
                          className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]"
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
                  <>
                    <TableRow key={cls.id} className="border-[var(--border-base)] hover:bg-[var(--bg-base)]">
                      <TableCell className="text-[var(--text-base)] font-medium">
                        <div className="flex items-center gap-2">
                          {cls.color && (
                            <span className={cn(
                              "h-2.5 w-2.5 rounded-full shrink-0",
                              COLOR_OPTIONS.find((c) => c.value === cls.color)?.bg ?? "bg-gray-400"
                            )} />
                          )}
                          <div>
                            {cls.name}
                            {cls.category && (
                              <span className="ml-1.5 text-xs text-[var(--text-muted)] font-normal">· {cls.category}</span>
                            )}
                            {cls.description && (
                              <p className="text-xs text-[var(--text-muted)] font-normal mt-0.5 line-clamp-1">
                                {cls.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[var(--text-muted)]">{cls.instructor}</TableCell>
                      <TableCell className="text-[var(--text-muted)] text-xs">
                        {cls.schedule || "-"}
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
                              ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                              : "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400"
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
                    </TableRow>

                    {expandedClass === cls.id && (
                      <TableRow key={`${cls.id}-expanded`} className="border-[var(--border-base)]">
                        <TableCell
                          colSpan={7}
                          className="bg-[var(--bg-base)] p-4"
                        >
                          <div className="space-y-3">
                            <p className="text-sm font-medium text-[var(--text-base)]">
                              Inscritos (
                              <span className="text-[var(--color-primary)] font-bold">
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
                                      className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
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
                                className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold text-sm hover:bg-[var(--color-primary-hover)]"
                              >
                                Inscribir
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>

      <InstructorsCard
        onChanged={() => {
          if (!session?.accessToken) return;
          const client = apiClient(session.accessToken as string);
          client.get("/api/v1/instructors").then((res) => setInstructors(res.data)).catch(() => {});
        }}
      />
    </motion.div>
  );
}
