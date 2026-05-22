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
import { Plus, AlertCircle, Users } from "lucide-react";

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

export default function ClassesClient() {
  const sessionData = useSession(); const session = sessionData?.data;
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    instructor: "",
    schedule: "",
    max_capacity: "20",
    duration_minutes: "60",
    description: "",
  });

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
      toast.error(err.response?.data?.detail || "Error guardando clase");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white font-display">Clases</h2>
          <p className="text-muted text-sm mt-1">Gestiona clases grupales del gym</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button onClick={() => setDialogOpen(true)} className="bg-primary text-bg-deep font-semibold hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />
              Nueva clase
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-surface border-border-dark text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white font-display">Nueva clase</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Nombre</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="bg-bg-deep border-border-dark text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Instructor</Label>
                  <Input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} required className="bg-bg-deep border-border-dark text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Horario</Label>
                  <Input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} required placeholder="Lun/Mie 18:00" className="bg-bg-deep border-border-dark text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Capacidad</Label>
                  <Input type="number" value={form.max_capacity} onChange={(e) => setForm({ ...form, max_capacity: e.target.value })} required className="bg-bg-deep border-border-dark text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted text-sm">Duracion (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} required className="bg-bg-deep border-border-dark text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted text-sm">Descripcion</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-bg-deep border-border-dark text-white" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="text-muted">Cancelar</Button>
                <Button type="submit" className="bg-primary text-bg-deep font-semibold hover:bg-primary/90">Crear clase</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <GlassCard className="p-4">
        {error && (
          <div className="flex items-center gap-2 text-danger mb-4">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border-dark hover:bg-transparent">
                <TableHead className="text-muted">Nombre</TableHead>
                <TableHead className="text-muted">Instructor</TableHead>
                <TableHead className="text-muted">Horario</TableHead>
                <TableHead className="text-muted">Capacidad</TableHead>
                <TableHead className="text-muted">Duracion</TableHead>
                <TableHead className="text-muted">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted py-8">Cargando...</TableCell></TableRow>
              ) : classes.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted py-8">No hay clases registradas</TableCell></TableRow>
              ) : (
                classes.map((c) => (
                  <TableRow key={c.id} className="border-border-dark">
                    <TableCell className="text-white font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted">{c.instructor}</TableCell>
                    <TableCell className="text-muted">{c.schedule}</TableCell>
                    <TableCell className="text-white"><Users className="h-3 w-3 inline mr-1" />{c.max_capacity}</TableCell>
                    <TableCell className="text-muted">{c.duration_minutes} min</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? "bg-success/20 text-success" : "bg-danger/20 text-danger"}`}>
                        {c.is_active ? "Activa" : "Inactiva"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
    </div>
  );
}


