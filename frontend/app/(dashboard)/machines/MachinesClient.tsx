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
import { Plus, AlertCircle, Wrench, ChevronDown } from "lucide-react";

interface Machine {
  id: string;
  name: string;
  brand: string | null;
  serial_number: string | null;
  status: string;
  notes: string | null;
}

interface MaintenanceLog {
  id: string;
  description: string;
  technician: string;
  cost: number | null;
  resolved_at: string | null;
  created_at: string;
}

export default function MachinesClient() {
  const sessionData = useSession(); const session = sessionData?.data;
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedMachine, setExpandedMachine] = useState<string | null>(null);
  const [maintenanceLogs, setMaintenanceLogs] = useState<Record<string, MaintenanceLog[]>>({});
  const [logForm, setLogForm] = useState({ description: "", technician: "", cost: "" });
  const [addingLog, setAddingLog] = useState(false);
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

  const toggleMachine = async (machineId: string) => {
    if (expandedMachine === machineId) {
      setExpandedMachine(null);
      return;
    }
    setExpandedMachine(machineId);
    if (!maintenanceLogs[machineId] && session?.accessToken) {
      try {
        const client = apiClient(session.accessToken as string);
        const res = await client.get(`/api/v1/machines/${machineId}/maintenance`);
        setMaintenanceLogs((prev) => ({ ...prev, [machineId]: res.data }));
      } catch {
        toast.error("Error cargando historial de mantenimiento");
      }
    }
  };

  const handleAddLog = async (machineId: string) => {
    if (!session?.accessToken || !logForm.description.trim() || !logForm.technician.trim()) return;
    setAddingLog(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.post(`/api/v1/machines/${machineId}/maintenance`, {
        description: logForm.description,
        technician: logForm.technician,
        cost: logForm.cost ? parseFloat(logForm.cost) : null,
      });
      toast.success("Mantenimiento registrado");
      setLogForm({ description: "", technician: "", cost: "" });
      // Refresh logs
      const res = await client.get(`/api/v1/machines/${machineId}/maintenance`);
      setMaintenanceLogs((prev) => ({ ...prev, [machineId]: res.data }));
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error registrando mantenimiento");
    } finally {
      setAddingLog(false);
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
                <TableHead className="text-muted w-8"></TableHead>
                <TableHead className="text-muted">Nombre</TableHead>
                <TableHead className="text-muted">Marca</TableHead>
                <TableHead className="text-muted">Serial</TableHead>
                <TableHead className="text-muted">Estado</TableHead>
                <TableHead className="text-muted">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted py-8">Cargando...</TableCell></TableRow>
              ) : machines.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted py-8">No hay maquinas registradas</TableCell></TableRow>
              ) : (
                machines.flatMap((m) => [
                  <TableRow key={m.id} className="border-border-dark">
                    <TableCell className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleMachine(m.id)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        aria-label="Toggle maintenance history"
                      >
                        <ChevronDown
                          className={`h-4 w-4 text-muted transition-transform ${
                            expandedMachine === m.id ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </TableCell>
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
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleMachine(m.id)}
                        className="text-muted hover:text-white text-xs"
                      >
                        {expandedMachine === m.id ? "Ocultar" : "Historial"}
                      </Button>
                    </TableCell>
                  </TableRow>,
                  expandedMachine === m.id && (
                    <TableRow key={`${m.id}-maintenance`} className="border-border-dark">
                      <TableCell colSpan={6} className="p-4 bg-white/2">
                        <div className="space-y-3">
                          <p className="text-sm font-medium text-white">Historial de mantenimiento</p>
                          {/* Maintenance logs list */}
                          <div className="space-y-2">
                            {(maintenanceLogs[m.id] || []).map((log: MaintenanceLog) => (
                              <div key={log.id} className="p-3 bg-white/5 rounded-lg text-sm">
                                <p className="text-white">{log.description}</p>
                                <div className="flex gap-4 mt-1 text-muted text-xs flex-wrap">
                                  <span>Técnico: {log.technician}</span>
                                  {log.cost && <span>Costo: ${Number(log.cost).toLocaleString("es-CO")}</span>}
                                  <span>{new Date(log.created_at).toLocaleDateString("es-CO")}</span>
                                </div>
                              </div>
                            ))}
                            {(maintenanceLogs[m.id] || []).length === 0 && (
                              <p className="text-muted text-xs">Sin registros de mantenimiento</p>
                            )}
                          </div>
                          {/* Add log form */}
                          <div className="pt-3 border-t border-border-dark space-y-2">
                            <p className="text-muted text-xs font-medium uppercase tracking-wide">Registrar mantenimiento</p>
                            <Input
                              placeholder="Descripción del mantenimiento *"
                              value={logForm.description}
                              onChange={(e) =>
                                setLogForm((prev) => ({ ...prev, description: e.target.value }))
                              }
                              className="bg-bg-deep border-border-dark text-white text-sm"
                            />
                            <div className="flex gap-2">
                              <Input
                                placeholder="Técnico *"
                                value={logForm.technician}
                                onChange={(e) =>
                                  setLogForm((prev) => ({ ...prev, technician: e.target.value }))
                                }
                                className="bg-bg-deep border-border-dark text-white text-sm flex-1"
                              />
                              <Input
                                type="number"
                                placeholder="Costo"
                                value={logForm.cost}
                                onChange={(e) =>
                                  setLogForm((prev) => ({ ...prev, cost: e.target.value }))
                                }
                                className="bg-bg-deep border-border-dark text-white text-sm w-32"
                              />
                            </div>
                            <Button
                              type="button"
                              disabled={
                                addingLog ||
                                !logForm.description.trim() ||
                                !logForm.technician.trim()
                              }
                              onClick={() => handleAddLog(m.id)}
                              className="bg-primary text-bg-deep font-semibold text-sm hover:bg-primary/90"
                            >
                              {addingLog ? "Guardando..." : "Registrar"}
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ),
                ])
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
    </div>
  );
}


