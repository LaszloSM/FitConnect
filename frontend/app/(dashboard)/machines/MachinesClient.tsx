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
import { Plus, AlertCircle, Wrench } from "lucide-react";

interface Machine {
  id: string;
  name: string;
  brand: string | null;
  serial_number: string | null;
  status: string;
  notes: string | null;
}

export default function MachinesClient() {
  const sessionData = useSession(); const session = sessionData?.data;
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    brand: "",
    serial_number: "",
    status: "active",
    notes: "",
  });

  const fetchMachines = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/machines");
      setMachines(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error cargando maquinas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMachines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    try {
      await client.post("/api/v1/machines", form);
      toast.success("Máquina creada correctamente");
      setDialogOpen(false);
      setForm({ name: "", brand: "", serial_number: "", status: "active", notes: "" });
      fetchMachines();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error guardando maquina");
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-success/20 text-success";
      case "maintenance": return "bg-warning/20 text-warning";
      case "damaged": return "bg-danger/20 text-danger";
      default: return "bg-muted/20 text-muted";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "active": return "Activa";
      case "maintenance": return "Mantenimiento";
      case "damaged": return "Danada";
      case "retired": return "Retirada";
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white font-display">Maquinas</h2>
          <p className="text-muted text-sm mt-1">Inventario y estado de equipos</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button onClick={() => setDialogOpen(true)} className="bg-primary text-bg-deep font-semibold hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />
              Nueva maquina
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-surface border-border-dark text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white font-display">Nueva maquina</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Nombre</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="bg-bg-deep border-border-dark text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Marca</Label>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="bg-bg-deep border-border-dark text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted text-sm">Serial</Label>
                <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} className="bg-bg-deep border-border-dark text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted text-sm">Estado</Label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full h-9 rounded-md border border-border-dark bg-bg-deep px-3 py-1 text-sm text-white">
                  <option value="active">Activa</option>
                  <option value="maintenance">Mantenimiento</option>
                  <option value="damaged">Danada</option>
                  <option value="retired">Retirada</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted text-sm">Notas</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-bg-deep border-border-dark text-white" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="text-muted">Cancelar</Button>
                <Button type="submit" className="bg-primary text-bg-deep font-semibold hover:bg-primary/90">Crear maquina</Button>
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
                <TableHead className="text-muted">Marca</TableHead>
                <TableHead className="text-muted">Serial</TableHead>
                <TableHead className="text-muted">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted py-8">Cargando...</TableCell></TableRow>
              ) : machines.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted py-8">No hay maquinas registradas</TableCell></TableRow>
              ) : (
                machines.map((m) => (
                  <TableRow key={m.id} className="border-border-dark">
                    <TableCell className="text-white font-medium flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-muted" />
                      {m.name}
                    </TableCell>
                    <TableCell className="text-muted">{m.brand || "-"}</TableCell>
                    <TableCell className="text-muted">{m.serial_number || "-"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(m.status)}`}>
                        {statusLabel(m.status)}
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


