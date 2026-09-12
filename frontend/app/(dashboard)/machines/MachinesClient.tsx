"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { P, useCan } from "@/lib/permissions";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { DatePicker } from "@/components/ui/date-picker";
import { FileUpload } from "@/components/ui/file-upload";
import { FormDialog, FormField } from "@/components/ui/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { formatDate, parseDateOnly, toISODate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertCircle, ChevronDown, Pencil, Plus, Search, Trash2, TriangleAlert, Wrench,
} from "lucide-react";

interface Machine {
  id: string;
  name: string;
  area: string | null;
  brand: string | null;
  serial_number: string | null;
  location_id: string | null;
  status: string;
  last_maintenance_date: string | null;
  maintenance_interval_days: number | null;
  notes: string | null;
  photo_url: string | null;
  // Calculado por el backend: la regla de "vencida" vive en un solo sitio.
  next_maintenance_date: string | null;
  is_overdue: boolean;
  is_due_soon: boolean;
  days_until_maintenance: number | null;
}

interface MaintenanceLog {
  id: string;
  description: string;
  technician: string;
  cost: number | null;
  resolved_at: string | null;
  kind: string;
  reported_by: string | null;
  created_at: string;
}

interface Location {
  id: string;
  name: string;
}

const AREA_OPTIONS = [
  "Cardio", "Fuerza", "Peso libre", "Funcional", "Cross-training", "Estiramiento", "Otra",
];

const STATUS_BADGE: Record<string, string> = {
  active:      "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
  maintenance: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
  damaged:     "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400",
  retired:     "bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-base)]",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  maintenance: "Mantenimiento",
  damaged: "Dañada",
  retired: "Retirada",
};

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";
const selectCls =
  "w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-1 text-sm text-[var(--text-base)]";

const PAGE_SIZE = 25;

const emptyForm = {
  name: "", area: "", brand: "", serial_number: "", location_id: "",
  status: "active", last_maintenance_date: "", maintenance_interval_days: "",
  notes: "",
};
type MachineForm = typeof emptyForm;

/** El aviso de mantenimiento, en una frase que se entiende sin hacer cuentas. */
function maintenanceNote(m: Machine): { text: string; cls: string } | null {
  if (m.is_overdue) {
    const atraso = -(m.days_until_maintenance ?? 0);
    return {
      text: atraso === 0 ? "Preventivo vence hoy" : `Preventivo vencido hace ${atraso} d`,
      cls: "bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400",
    };
  }
  if (m.is_due_soon) {
    return {
      text: `Preventivo en ${m.days_until_maintenance} d`,
      cls: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
    };
  }
  return null;
}

export default function MachinesClient() {
  const { data: session } = useSession();
  // Recepción puede consultar y registrar mantenimiento, no dar de alta ni
  // borrar equipos: ofrecerle esos botones solo la lleva a un 403.
  const { can } = useCan();
  const puedeEditar = can(P.MACHINES_WRITE);
  const token = session?.accessToken as string | undefined;

  const [machines, setMachines] = useState<Machine[]>([]);
  const [total, setTotal] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [page, setPage] = useState(0);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, MaintenanceLog[]>>({});
  const [logForm, setLogForm] = useState({
    description: "", technician: "", cost: "", kind: "preventivo", resolved_at: "",
  });
  const [addingLog, setAddingLog] = useState(false);

  const [editing, setEditing] = useState<Machine | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<MachineForm>(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [faultTarget, setFaultTarget] = useState<Machine | null>(null);
  const [faultText, setFaultText] = useState("");
  const [reporting, setReporting] = useState(false);

  const fetchMachines = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiClient(token).get("/api/v1/machines", {
        params: {
          q: q || undefined,
          status: statusFilter || undefined,
          area: areaFilter || undefined,
          only_overdue: onlyOverdue || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      setMachines(res.data.items);
      setTotal(res.data.total);
      setOverdueCount(res.data.overdue);
      setError("");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Error cargando máquinas");
    } finally {
      setLoading(false);
    }
  }, [token, q, statusFilter, areaFilter, onlyOverdue, page]);

  useEffect(() => {
    // Debounce del buscador: una petición por pausa de escritura, no por tecla.
    const t = setTimeout(() => { void fetchMachines(); }, 250);
    return () => clearTimeout(t);
  }, [fetchMachines]);

  useEffect(() => {
    if (!token) return;
    apiClient(token)
      .get<Location[]>("/api/v1/locations")
      .then((r) => setLocations(r.data))
      .catch(() => setLocations([]));
  }, [token]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setPhotoFile(null);
    setDialogOpen(true);
  };

  const openEdit = (m: Machine) => {
    setEditing(m);
    setForm({
      name: m.name,
      area: m.area ?? "",
      brand: m.brand ?? "",
      serial_number: m.serial_number ?? "",
      location_id: m.location_id ?? "",
      status: m.status,
      last_maintenance_date: m.last_maintenance_date ?? "",
      maintenance_interval_days: m.maintenance_interval_days?.toString() ?? "",
      notes: m.notes ?? "",
    });
    setPhotoFile(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!token || !form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSubmitting(true);
    const client = apiClient(token);
    const body = {
      name: form.name.trim(),
      area: form.area || null,
      brand: form.brand.trim() || null,
      serial_number: form.serial_number.trim() || null,
      location_id: form.location_id || null,
      status: form.status,
      last_maintenance_date: form.last_maintenance_date || null,
      maintenance_interval_days: form.maintenance_interval_days
        ? Number(form.maintenance_interval_days)
        : null,
      notes: form.notes.trim() || null,
    };
    try {
      const id = editing
        ? (await client.put(`/api/v1/machines/${editing.id}`, body)).data.id
        : (await client.post("/api/v1/machines", body)).data.id;

      // La foto se sube DESPUÉS: el endpoint necesita el id de la máquina, y
      // así nunca se persiste un blob local (que no sobrevive a la recarga).
      if (photoFile) {
        const fd = new FormData();
        fd.append("file", photoFile);
        await client.post(`/api/v1/machines/${id}/photo`, fd, {
          headers: { "Content-Type": undefined },
        });
      }
      toast.success(editing ? "Máquina actualizada" : "Máquina creada");
      setDialogOpen(false);
      await fetchMachines();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string" ? detail
          : Array.isArray(detail) ? detail[0]?.msg
          : "Error guardando la máquina",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiClient(token).delete(`/api/v1/machines/${deleteTarget.id}`);
      toast.success(
        res.data?.archived
          ? "La máquina se retiró: conserva su historial"
          : "Máquina eliminada",
      );
      setDeleteTarget(null);
      await fetchMachines();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No se pudo eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const handleFault = async () => {
    if (!token || !faultTarget || faultText.trim().length < 3) {
      toast.error("Describe qué le pasa a la máquina");
      return;
    }
    setReporting(true);
    try {
      await apiClient(token).post(`/api/v1/machines/${faultTarget.id}/report-fault`, {
        description: faultText.trim(),
      });
      toast.success("Avería reportada: la máquina queda marcada como dañada");
      setFaultTarget(null);
      setFaultText("");
      setLogs((prev) => {
        const copia = { ...prev };
        delete copia[faultTarget.id];
        return copia;
      });
      await fetchMachines();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No se pudo reportar");
    } finally {
      setReporting(false);
    }
  };

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!logs[id] && token) {
      try {
        const res = await apiClient(token).get(`/api/v1/machines/${id}/maintenance`);
        setLogs((prev) => ({ ...prev, [id]: res.data }));
      } catch {
        setLogs((prev) => ({ ...prev, [id]: [] }));
        toast.error("Error cargando el historial");
      }
    }
  };

  const handleAddLog = async (id: string) => {
    if (!token || !logForm.description.trim() || !logForm.technician.trim()) return;
    setAddingLog(true);
    try {
      const client = apiClient(token);
      await client.post(`/api/v1/machines/${id}/maintenance`, {
        description: logForm.description.trim(),
        technician: logForm.technician.trim(),
        cost: logForm.cost ? parseFloat(logForm.cost) : null,
        kind: logForm.kind,
        resolved_at: logForm.resolved_at || null,
      });
      toast.success("Mantenimiento registrado");
      setLogForm({ description: "", technician: "", cost: "", kind: "preventivo", resolved_at: "" });
      const res = await client.get(`/api/v1/machines/${id}/maintenance`);
      setLogs((prev) => ({ ...prev, [id]: res.data }));
      await fetchMachines();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error registrando el mantenimiento");
    } finally {
      setAddingLog(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <PageHeader
        module="machines"
        eyebrow={overdueCount > 0 ? `${overdueCount} con preventivo vencido` : undefined}
        title="Máquinas"
        subtitle="Inventario, estado y mantenimiento de los equipos."
        action={
          puedeEditar ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva máquina
            </Button>
          ) : undefined
        }
      />

      <GlassCard className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Nombre, marca o serial"
              className={cn(inputCls, "pl-8")}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className={cn(selectCls, "w-auto min-w-[130px]")}
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select
            value={areaFilter}
            onChange={(e) => { setAreaFilter(e.target.value); setPage(0); }}
            className={cn(selectCls, "w-auto min-w-[130px]")}
          >
            <option value="">Todas las áreas</option>
            {AREA_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            type="button"
            onClick={() => { setOnlyOverdue((v) => !v); setPage(0); }}
            aria-pressed={onlyOverdue}
            className={cn(
              "h-9 px-3 rounded-md border text-sm font-medium transition-colors",
              onlyOverdue
                ? "border-orange-300 bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/50"
                : "border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]",
            )}
          >
            Solo vencidas
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        ) : machines.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-6 w-6" />}
            title={q || statusFilter || areaFilter || onlyOverdue
              ? "Ninguna máquina coincide"
              : "Sin máquinas registradas"}
            description={q || statusFilter || areaFilter || onlyOverdue
              ? "Prueba con otro filtro o limpia la búsqueda."
              : "Agrega el inventario de equipos del gym."}
            action={puedeEditar ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nueva máquina</Button> : undefined}
          />
        ) : (
          <ul className="list-none m-0 p-0 space-y-2">
            {machines.map((m) => {
              const aviso = maintenanceNote(m);
              const abierta = expanded === m.id;
              return (
                <li key={m.id} className="rounded-lg border border-[var(--border-base)] overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    {m.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.photo_url} alt={m.name}
                           className="h-9 w-9 rounded-md object-cover shrink-0 border border-[var(--border-base)]" />
                    ) : (
                      <span className="h-9 w-9 rounded-md shrink-0 border border-[var(--border-base)] flex items-center justify-center">
                        <Wrench className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-base)] truncate">{m.name}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {[m.area, m.brand, m.serial_number].filter(Boolean).join(" · ") || "Sin detalles"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                      {aviso && (
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", aviso.cls)}>
                          <Wrench className="h-3 w-3" /> {aviso.text}
                        </span>
                      )}
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                        STATUS_BADGE[m.status] ?? "bg-[var(--bg-base)] text-[var(--text-muted)]",
                      )}>
                        {STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <IconButton title="Reportar avería" onClick={() => { setFaultTarget(m); setFaultText(""); }}>
                        <TriangleAlert className="h-3.5 w-3.5" />
                      </IconButton>
                      {puedeEditar && (
                        <>
                          <IconButton title="Editar" onClick={() => openEdit(m)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton title="Eliminar" onClick={() => setDeleteTarget(m)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </>
                      )}
                      <IconButton
                        title={abierta ? "Ocultar historial" : "Ver historial"}
                        onClick={() => toggle(m.id)}
                        aria-expanded={abierta}
                      >
                        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", abierta && "rotate-180")} />
                      </IconButton>
                    </div>
                  </div>

                  {abierta && (
                    <div className="px-3 pb-3 pt-1 bg-[var(--bg-base)] space-y-3">
                      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                        {m.last_maintenance_date && (
                          <span>Último preventivo: {formatDate(parseDateOnly(m.last_maintenance_date))}</span>
                        )}
                        {m.next_maintenance_date && (
                          <span>Próximo: {formatDate(parseDateOnly(m.next_maintenance_date))}</span>
                        )}
                        {m.notes && <span>· {m.notes}</span>}
                      </div>

                      <div className="space-y-2">
                        {(logs[m.id] ?? []).map((log) => (
                          <div key={log.id} className="p-3 surface-1 rounded-lg text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[var(--text-base)]">{log.description}</p>
                              <span className={cn(
                                "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
                                log.kind === "correctivo"
                                  ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                                  : "bg-sky-100 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400",
                              )}>
                                {log.kind}
                              </span>
                            </div>
                            <div className="flex gap-3 mt-1 text-[var(--text-muted)] text-xs flex-wrap">
                              <span>Técnico: {log.technician}</span>
                              {log.reported_by && <span>Reportó: {log.reported_by}</span>}
                              {log.cost != null && <span>${Number(log.cost).toLocaleString("es-CO")}</span>}
                              {log.resolved_at && <span>Resuelto: {formatDate(parseDateOnly(log.resolved_at))}</span>}
                              <span>{formatDate(log.created_at)}</span>
                            </div>
                          </div>
                        ))}
                        {(logs[m.id] ?? []).length === 0 && (
                          <p className="text-[var(--text-muted)] text-xs py-1">Sin registros de mantenimiento</p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-[var(--border-base)] space-y-2">
                        <p className="text-[var(--text-muted)] text-xs font-medium uppercase tracking-wide">
                          Registrar mantenimiento
                        </p>
                        <Input
                          placeholder="Qué se hizo *"
                          value={logForm.description}
                          onChange={(e) => setLogForm((p) => ({ ...p, description: e.target.value }))}
                          className={cn(inputCls, "text-sm")}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Input
                            placeholder="Técnico *"
                            value={logForm.technician}
                            onChange={(e) => setLogForm((p) => ({ ...p, technician: e.target.value }))}
                            className={cn(inputCls, "text-sm flex-1 min-w-[140px]")}
                          />
                          <select
                            value={logForm.kind}
                            onChange={(e) => setLogForm((p) => ({ ...p, kind: e.target.value }))}
                            className={cn(selectCls, "w-auto")}
                            title="Solo el preventivo reinicia el ciclo"
                          >
                            <option value="preventivo">Preventivo</option>
                            <option value="correctivo">Correctivo</option>
                          </select>
                          <Input
                            type="number" min="0" step="0.01" placeholder="Costo"
                            value={logForm.cost}
                            onChange={(e) => setLogForm((p) => ({ ...p, cost: e.target.value }))}
                            className={cn(inputCls, "text-sm w-28")}
                          />
                        </div>
                        <Button
                          type="button"
                          disabled={addingLog || !logForm.description.trim() || !logForm.technician.trim()}
                          onClick={() => handleAddLog(m.id)}
                        >
                          {addingLog ? "Guardando…" : "Registrar"}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-[var(--text-muted)] tabular-nums">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button variant="ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </GlassCard>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Editar máquina" : "Nueva máquina"}
        onSubmit={handleSave}
        submitting={submitting}
        submitLabel={editing ? "Guardar cambios" : "Crear máquina"}
        contentClassName="max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <FormField label="Nombre" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Caminadora #2"
            className={inputCls}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Área">
            <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className={selectCls}>
              <option value="">Sin área</option>
              {AREA_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </FormField>
          <FormField label="Estado">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectCls}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Marca">
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                   placeholder="Technogym" className={inputCls} />
          </FormField>
          <FormField label="Serial" hint="El número que pide el servicio técnico">
            <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                   placeholder="TG-88231" className={inputCls} />
          </FormField>
        </div>

        {locations.length > 0 && (
          <FormField label="Sede">
            <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} className={selectCls}>
              <option value="">Sin sede asignada</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Último preventivo">
            <DatePicker
              value={form.last_maintenance_date ? parseDateOnly(form.last_maintenance_date) : undefined}
              onChange={(d) => setForm({ ...form, last_maintenance_date: toISODate(d) })}
              placeholder="Seleccionar fecha"
              maxDate={new Date()}
              fromYear={2000}
            />
          </FormField>
          <FormField label="Preventivo cada (días)" hint="Vacío = sin alertas">
            <Input
              type="number" min={1}
              value={form.maintenance_interval_days}
              onChange={(e) => setForm({ ...form, maintenance_interval_days: e.target.value })}
              placeholder="90"
              className={inputCls}
            />
          </FormField>
        </div>

        <FormField label="Observaciones">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className={cn(selectCls, "h-auto py-2 resize-none")}
          />
        </FormField>

        <FormField label="Foto">
          <FileUpload
            value={editing?.photo_url ?? undefined}
            onChange={setPhotoFile}
            shape="rect"
          />
        </FormField>
      </FormDialog>

      <FormDialog
        open={!!faultTarget}
        onOpenChange={(v) => { if (!v) setFaultTarget(null); }}
        title={`Reportar avería · ${faultTarget?.name ?? ""}`}
        description="La máquina queda marcada como dañada de inmediato y el reporte entra al historial."
        onSubmit={handleFault}
        submitting={reporting}
        submitLabel="Reportar"
        destructive
      >
        <FormField label="Qué le pasa" required>
          <textarea
            value={faultText}
            onChange={(e) => setFaultText(e.target.value)}
            rows={3}
            placeholder="La banda patina y se frena sola"
            className={cn(selectCls, "h-auto py-2 resize-none")}
          />
        </FormField>
      </FormDialog>

      <FormDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={`Eliminar ${deleteTarget?.name ?? ""}`}
        description="Si tiene mantenimientos registrados se retira en vez de borrarse: ese historial es el argumento para reclamar la garantía."
        onSubmit={handleDelete}
        submitting={deleting}
        submitLabel="Eliminar"
        destructive
      >
        <p className="text-sm text-[var(--text-muted)]">Esta acción no se puede deshacer.</p>
      </FormDialog>
    </motion.div>
  );
}

function IconButton({
  title, onClick, children, ...rest
}: { title: string; onClick: () => void; children: React.ReactNode } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-base)] transition-colors"
      {...rest}
    >
      {children}
    </button>
  );
}
