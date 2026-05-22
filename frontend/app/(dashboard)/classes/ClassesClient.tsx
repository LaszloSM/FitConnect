"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { apiClient } from "@/lib/api";
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

const inputCls = "bg-white border-slate-200 text-slate-800";

export default function ClassesClient() {
  const sessionData = useSession(); const session = sessionData?.data;
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", instructor: "", schedule: "", max_capacity: "20", duration_minutes: "60", description: "" });
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<Record<string, Enrollment[]>>({});
  const [enrollMemberId, setEnrollMemberId] = useState<Record<string, string>>({});

  const fetchClasses = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/classes");
      setClasses(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error cargando clases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    try {
      await client.post("/api/v1/classes", { ...form, max_capacity: parseInt(form.max_capacity), duration_minutes: parseInt(form.duration_minutes) });
      toast.success("Clase creada correctamente");
      setDialogOpen(false);
      setForm({ name: "", instructor: "", schedule: "", max_capacity: "20", duration_minutes: "60", description: "" });
      fetchClasses();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error guardando clase");
    }
  };

  const toggleExpand = async (classId: string) => {
    if (expandedClass === classId) { setExpandedClass(null); return; }
    setExpandedClass(classId);
    if (!enrollments[classId] && session?.accessToken) {
      try {
        const client = apiClient(session.accessToken as string);
        const res = await client.get(`/api/v1/classes/${classId}/enrollments`);
        setEnrollments(prev => ({ ...prev, [classId]: res.data }));
      } catch {
        setEnrollments(prev => ({ ...prev, [classId]: [] }));
      }
    }
  };

  const handleEnroll = async (classId: string) => {
    const memberId = enrollMemberId[classId];
    if (!memberId || !session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.post(`/api/v1/classes/${classId}/enroll`, { member_id: memberId });
      toast.success("Miembro inscrito");
      setEnrollMemberId(prev => ({ ...prev, [classId]: "" }));
      const res = await client.get(`/api/v1/classes/${classId}/enrollments`);
      setEnrollments(prev => ({ ...prev, [classId]: res.data }));
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error al inscribir");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 font-display">Clases</h2>
          <p className="text-slate-500 text-sm mt-1">Gestiona clases grupales del gym</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button onClick={() => setDialogOpen(true)} className="bg-orange-500 text-white font-semibold hover:bg-orange-600">
              <Plus className="h-4 w-4 mr-2" />
              Nueva clase
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-slate-200 text-slate-800 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-slate-800 font-display">Nueva clase</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-600 text-sm">Nombre</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-600 text-sm">Instructor</Label>
                  <Input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} required className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-600 text-sm">Horario</Label>
                  <Input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} required placeholder="Lun/Mie 18:00" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-600 text-sm">Capacidad</Label>
                  <Input type="number" value={form.max_capacity} onChange={(e) => setForm({ ...form, max_capacity: e.target.value })} required className={inputCls} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-600 text-sm">Duración (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} required className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-600 text-sm">Descripción</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="text-slate-500">Cancelar</Button>
                <Button type="submit" className="bg-orange-500 text-white font-semibold hover:bg-orange-600">Crear clase</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="text-slate-500">Nombre</TableHead>
                <TableHead className="text-slate-500">Instructor</TableHead>
                <TableHead className="text-slate-500">Horario</TableHead>
                <TableHead className="text-slate-500">Capacidad</TableHead>
                <TableHead className="text-slate-500">Duración</TableHead>
                <TableHead className="text-slate-500">Estado</TableHead>
                <TableHead className="text-slate-500">Inscritos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">Cargando...</TableCell></TableRow>
              ) : classes.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">No hay clases registradas</TableCell></TableRow>
              ) : (
                classes.map((cls) => (
                  <>
                    <TableRow key={cls.id} className="border-slate-200">
                      <TableCell className="text-slate-800 font-medium">{cls.name}</TableCell>
                      <TableCell className="text-slate-500">{cls.instructor}</TableCell>
                      <TableCell className="text-slate-500">{cls.schedule}</TableCell>
                      <TableCell className="text-slate-800"><Users className="h-3 w-3 inline mr-1" />{cls.max_capacity}</TableCell>
                      <TableCell className="text-slate-500">{cls.duration_minutes} min</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls.is_active ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                          {cls.is_active ? "Activa" : "Inactiva"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="sm" onClick={() => toggleExpand(cls.id)}
                          className="text-slate-400 hover:text-slate-700 text-xs flex items-center gap-1 px-2 py-1">
                          {expandedClass === cls.id ? (
                            <><ChevronUp className="h-3 w-3" /> Ocultar</>
                          ) : (
                            <><ChevronDown className="h-3 w-3" /> Ver inscritos</>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedClass === cls.id && (
                      <TableRow key={`${cls.id}-expanded`} className="border-slate-200">
                        <TableCell colSpan={7} className="bg-slate-50 p-4">
                          <div className="space-y-3">
                            <p className="text-sm font-medium text-slate-700">
                              Inscritos ({(enrollments[cls.id] || []).length}/{cls.max_capacity})
                            </p>
                            <div className="space-y-1">
                              {(enrollments[cls.id] || []).map((e) => (
                                <div key={e.id} className="flex items-center justify-between text-sm py-1.5 px-3 bg-white border border-slate-100 rounded-lg">
                                  <span className="text-slate-800">{e.member_name}</span>
                                  <span className="text-slate-400 text-xs">{e.member_email}</span>
                                </div>
                              ))}
                              {(enrollments[cls.id] || []).length === 0 && (
                                <p className="text-slate-400 text-xs">Sin inscritos</p>
                              )}
                            </div>
                            <div className="flex gap-2 items-end pt-2 border-t border-slate-200">
                              <div className="flex-1">
                                <MemberSelect value={enrollMemberId[cls.id] || ""} onChange={(id) => setEnrollMemberId(prev => ({ ...prev, [cls.id]: id }))} />
                              </div>
                              <Button type="button" onClick={() => handleEnroll(cls.id)} className="bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600">
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
    </div>
  );
}
