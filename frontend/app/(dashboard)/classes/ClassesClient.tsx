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
import { Plus, AlertCircle, Users, ChevronDown, ChevronUp } from "lucide-react";
import MemberSelect from "@/components/common/MemberSelect";

interface GymClass {
  id: string;
  name: string;
  instructor: string;
  schedule: string;
  max_capacity: number;
  duration_minutes: number;
  is_active: boolean;
  description: string | null;
}

interface Enrollment {
  id: string;
  member_id: string;
  member_name: string;
  member_email: string;
}

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";

export default function ClassesClient() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    instructor: "",
    schedule: "",
    max_capacity: "20",
    duration_minutes: "60",
    description: "",
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
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);
    try {
      await client.post("/api/v1/classes", {
        ...form,
        max_capacity: parseInt(form.max_capacity),
        duration_minutes: parseInt(form.duration_minutes),
      });
      toast.success("Clase creada correctamente");
      setDialogOpen(false);
      setForm({ name: "", instructor: "", schedule: "", max_capacity: "20", duration_minutes: "60", description: "" });
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <PageHeader
          title="Clases"
          subtitle="Gestiona clases grupales del gym"
          action={
            <DialogTrigger asChild>
              <Button className="bg-orange-500 text-white hover:bg-orange-600">
                <Plus className="h-4 w-4 mr-2" />
                Nueva clase
              </Button>
            </DialogTrigger>
          }
        />

        <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-base)] max-w-lg">
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
                <Input
                  value={form.instructor}
                  onChange={(e) => setForm({ ...form, instructor: e.target.value })}
                  required
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Horario</Label>
                <Input
                  value={form.schedule}
                  onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                  required
                  placeholder="Lun/Mie 18:00"
                  className={inputCls}
                />
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
            </div>
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Duración (min)</Label>
              <Input
                type="number"
                min="1"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                required
                className={inputCls}
              />
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
                className="bg-orange-500 text-white font-semibold hover:bg-orange-600"
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
                          className="bg-orange-500 text-white hover:bg-orange-600"
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
                        {cls.name}
                        {cls.description && (
                          <p className="text-xs text-[var(--text-muted)] font-normal mt-0.5 line-clamp-1">
                            {cls.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-[var(--text-muted)]">{cls.instructor}</TableCell>
                      <TableCell className="text-[var(--text-muted)]">{cls.schedule}</TableCell>
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
                              <span className="text-orange-500 font-bold">
                                {(enrollments[cls.id] || []).length}
                              </span>
                              /{cls.max_capacity})
                            </p>
                            <div className="space-y-1">
                              {(enrollments[cls.id] || []).map((enr) => (
                                <div
                                  key={enr.id}
                                  className="flex items-center justify-between text-sm py-1.5 px-3 surface-1 rounded-lg"
                                >
                                  <span className="text-[var(--text-base)]">{enr.member_name}</span>
                                  <span className="text-[var(--text-muted)] text-xs">{enr.member_email}</span>
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
                                className="bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600"
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
    </motion.div>
  );
}
