"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { DatePicker } from "@/components/ui/date-picker";
import { FileUpload } from "@/components/ui/file-upload";
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
import { Plus, AlertCircle, Wrench, ChevronDown } from "lucide-react";

interface Machine {
  id: string;
  name: string;
  area: string | null;
  status: string;
  last_maintenance_date: string | null;
  notes: string | null;
  photo_url: string | null;
}

const AREA_OPTIONS = [
  "Cardio",
  "Fuerza",
  "Peso libre",
  "Funcional",
  "Cross-training",
  "Estiramiento",
  "Otra",
];

interface MaintenanceLog {
  id: string;
  description: string;
  technician: string;
  cost: number | null;
  resolved_at: string | null;
  created_at: string;
}

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";
const selectCls =
  "w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-1 text-sm text-[var(--text-base)]";

const STATUS_BADGE: Record<string, string> = {
  active:      "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
  maintenance: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
  damaged:     "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400",
  retired:     "bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-base)]",
};

const STATUS_LABEL: Record<string, string> = {
  active:      "Activa",
  maintenance: "Mantenimiento",
  damaged:     "Dañada",
  retired:     "Retirada",
};


export default function MachinesClient() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedMachine, setExpandedMachine] = useState<string | null>(null);
  const [maintenanceLogs, setMaintenanceLogs] = useState<Record<string, MaintenanceLog[]>>({});
  const [logForm, setLogForm] = useState({ description: "", technician: "", cost: "" });
  const [addingLog, setAddingLog] = useState(false);
  const [form, setForm] = useState({
    name: "",
    area: "",
    status: "active",
    last_maintenance_date: "" as string,
    notes: "",
    photo_url: "",
  });

  const fetchMachines = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/machines");
      setMachines(res.data);
      setError("");
    } catch (err: any) {
      setError(
        typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Error cargando máquinas"
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
      .get("/api/v1/machines")
      .then((res) => {
        if (!cancelled) { setMachines(res.data); setError(""); }
      })
      .catch((err: any) => {
        if (!cancelled)
          setError(
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Error cargando máquinas"
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
      await client.post("/api/v1/machines", {
        name: form.name,
        area: form.area || undefined,
        status: form.status,
        last_maintenance_date: form.last_maintenance_date || undefined,
        notes: form.notes || undefined,
        // No enviar blobs locales (URL.createObjectURL no persiste)
        photo_url: form.photo_url.startsWith("blob:") ? undefined : form.photo_url || undefined,
      });
      toast.success("Máquina creada correctamente");
      setDialogOpen(false);
      setForm({ name: "", area: "", status: "active", last_maintenance_date: "", notes: "", photo_url: "" });
      fetchMachines();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail[0]?.msg
          : "Error guardando máquina"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMachine = async (machineId: string) => {
    if (expandedMachine === machineId) { setExpandedMachine(null); return; }
    setExpandedMachine(machineId);
    if (!maintenanceLogs[machineId] && session?.accessToken) {
      try {
        const client = apiClient(session.accessToken as string);
        const res = await client.get(`/api/v1/machines/${machineId}/maintenance`);
        setMaintenanceLogs((prev) => ({ ...prev, [machineId]: res.data }));
      } catch {
        setMaintenanceLogs((prev) => ({ ...prev, [machineId]: [] }));
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <PageHeader
          module="machines"
          title="Máquinas"
          subtitle="Inventario y estado de equipos"
          action={
            <DialogTrigger
              render={
                <Button className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva máquina
                </Button>
              }
            />
          }
        />

        <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-base)] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-base)] font-display">
              Nueva máquina
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Caminadora #2"
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Área *</Label>
                <select
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  required
                  className={selectCls}
                >
                  <option value="" disabled>Seleccionar área</option>
                  {AREA_OPTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Estado *</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className={selectCls}
                >
                  <option value="active">Disponible</option>
                  <option value="maintenance">Mantenimiento</option>
                  <option value="damaged">Dañada</option>
                  <option value="retired">Retirada</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Último mantenimiento</Label>
              <DatePicker
                value={form.last_maintenance_date ? new Date(form.last_maintenance_date + "T12:00:00") : undefined}
                onChange={(d) => setForm({ ...form, last_maintenance_date: d.toISOString().split("T")[0] })}
                placeholder="Seleccionar fecha"
                maxDate={new Date()}
                fromYear={2000}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Observaciones</Label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className={cn(selectCls, "h-auto py-2 resize-none")}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Foto (opcional)</Label>
              <FileUpload
                value={form.photo_url || undefined}
                onChange={(file) => {
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setForm({ ...form, photo_url: url });
                  } else {
                    setForm({ ...form, photo_url: "" });
                  }
                }}
                shape="rect"
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
                {submitting ? "Creando..." : "Crear máquina"}
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
                <TableHead className="text-[var(--text-muted)] w-8" />
                <TableHead className="text-[var(--text-muted)]">Nombre</TableHead>
                <TableHead className="text-[var(--text-muted)]">Área</TableHead>
                <TableHead className="text-[var(--text-muted)]">Estado</TableHead>
                <TableHead className="text-[var(--text-muted)]">Historial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="border-[var(--border-base)]">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="skeleton h-4 rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : machines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState
                      title="Sin máquinas registradas"
                      description="Agrega el inventario de equipos del gym"
                      action={
                        <Button
                          onClick={() => setDialogOpen(true)}
                          className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Nueva máquina
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                machines.flatMap((m) => [
                  <TableRow key={m.id} className="border-[var(--border-base)] hover:bg-[var(--bg-base)]">
                    <TableCell className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleMachine(m.id)}
                        className="p-1 hover:bg-[var(--bg-base)] rounded transition-colors"
                        aria-label="Ver historial de mantenimiento"
                        aria-expanded={expandedMachine === m.id}
                      >
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-[var(--text-muted)] transition-transform duration-200",
                            expandedMachine === m.id && "rotate-180"
                          )}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="text-[var(--text-base)] font-medium">
                      <div className="flex items-center gap-2">
                        {m.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photo_url} alt={m.name} className="h-7 w-7 rounded-md object-cover shrink-0 border border-[var(--border-base)]" />
                        ) : (
                          <Wrench className="h-4 w-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                        )}
                        <div>
                          {m.name}
                          {m.notes && (
                            <p className="text-xs text-[var(--text-muted)] font-normal line-clamp-1">{m.notes}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] text-sm">{m.area || "-"}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          STATUS_BADGE[m.status] ?? "bg-[var(--bg-base)] text-[var(--text-muted)]"
                        )}
                      >
                        {STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleMachine(m.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--text-base)] text-xs"
                      >
                        {expandedMachine === m.id ? "Ocultar" : "Historial"}
                      </Button>
                    </TableCell>
                  </TableRow>,

                  expandedMachine === m.id && (
                    <TableRow key={`${m.id}-maintenance`} className="border-[var(--border-base)]">
                      <TableCell colSpan={5} className="p-4 bg-[var(--bg-base)]">
                        <div className="space-y-3">
                          {m.last_maintenance_date && (
                            <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                              <span>Último mantenimiento: {new Date(m.last_maintenance_date + "T12:00:00").toLocaleDateString("es-ES")}</span>
                            </div>
                          )}

                          <p className="text-sm font-semibold text-[var(--text-base)]">
                            Historial de mantenimiento
                          </p>
                          <div className="space-y-2">
                            {(maintenanceLogs[m.id] || []).map((log: MaintenanceLog) => (
                              <div
                                key={log.id}
                                className="p-3 surface-1 rounded-lg text-sm"
                              >
                                <p className="text-[var(--text-base)]">{log.description}</p>
                                <div className="flex gap-4 mt-1 text-[var(--text-muted)] text-xs flex-wrap">
                                  <span>Técnico: {log.technician}</span>
                                  {log.cost != null && (
                                    <span>Costo: ${Number(log.cost).toLocaleString("es-CO")}</span>
                                  )}
                                  <span>{new Date(log.created_at).toLocaleDateString("es-ES")}</span>
                                </div>
                              </div>
                            ))}
                            {(maintenanceLogs[m.id] || []).length === 0 && (
                              <p className="text-[var(--text-muted)] text-xs py-1">
                                Sin registros de mantenimiento
                              </p>
                            )}
                          </div>

                          <div className="pt-3 border-t border-[var(--border-base)] space-y-2">
                            <p className="text-[var(--text-muted)] text-xs font-medium uppercase tracking-wide">
                              Registrar mantenimiento
                            </p>
                            <Input
                              placeholder="Descripción del mantenimiento *"
                              value={logForm.description}
                              onChange={(e) => setLogForm((prev) => ({ ...prev, description: e.target.value }))}
                              className={cn(inputCls, "text-sm")}
                            />
                            <div className="flex gap-2">
                              <Input
                                placeholder="Técnico *"
                                value={logForm.technician}
                                onChange={(e) => setLogForm((prev) => ({ ...prev, technician: e.target.value }))}
                                className={cn(inputCls, "text-sm flex-1")}
                              />
                              <Input
                                type="number"
                                placeholder="Costo"
                                min="0"
                                step="0.01"
                                value={logForm.cost}
                                onChange={(e) => setLogForm((prev) => ({ ...prev, cost: e.target.value }))}
                                className={cn(inputCls, "text-sm w-32")}
                              />
                            </div>
                            <Button
                              type="button"
                              disabled={addingLog || !logForm.description.trim() || !logForm.technician.trim()}
                              onClick={() => handleAddLog(m.id)}
                              className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold text-sm hover:bg-[var(--color-primary-hover)]"
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
    </motion.div>
  );
}
