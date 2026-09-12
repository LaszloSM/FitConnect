"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
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
import { parseApiError } from "@/lib/errors";
import { formatCOP, formatDate, parseDateOnly, toISODate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertCircle, CalendarDays, ChevronDown, ImageIcon, List, Pencil, Plus, QrCode, Search, ShieldCheck,
  Trash2, TriangleAlert, Wrench,
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
  purchase_date: string | null;
  supplier: string | null;
  warranty_until: string | null;
  warranty_active: boolean;
  has_report_link: boolean;
  // Solo llega a quien administra equipos.
  maintenance_cost_total?: string;
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
  photo_url: string | null;
  created_at: string;
}

interface Location {
  id: string;
  name: string;
}

interface CalendarItem {
  id: string;
  name: string;
  area: string | null;
  next_maintenance_date: string;
  days_until_maintenance: number;
  is_overdue: boolean;
}

interface Costs {
  total: string;
  corrective: string;
  preventive: string;
  by_area: { area: string | null; label: string; amount: string; count: number }[];
  by_machine: { id: string; name: string; amount: string; corrective: string; count: number }[];
}

// Espejo de `backend/app/services/machine_areas.py`. Se guarda el slug; la
// etiqueta es solo presentación y puede cambiar sin dejar filas huérfanas.
const AREA_OPTIONS = [
  { value: "cardio", label: "Cardio" },
  { value: "fuerza", label: "Fuerza" },
  { value: "peso_libre", label: "Peso libre" },
  { value: "funcional", label: "Funcional" },
  { value: "cross_training", label: "Cross-training" },
  { value: "estiramiento", label: "Estiramiento" },
  { value: "otra", label: "Otra" },
] as const;

const areaLabel = (v: string | null) => (v ? AREA_OPTIONS.find((a) => a.value === v)?.label ?? v : null);

type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

function toneStyle(tone: Tone): React.CSSProperties {
  if (tone === "neutral") return { color: "var(--text-muted)", background: "var(--bg-muted)" };
  return { color: `var(--signal-${tone})`, background: `var(--signal-${tone}-bg)` };
}

const STATUS_TONE: Record<string, Tone> = {
  active: "ok",
  maintenance: "warn",
  damaged: "danger",
  retired: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  maintenance: "Mantenimiento",
  damaged: "Dañada",
  retired: "Retirada",
};

const selectCls =
  "w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-3 py-1 text-sm text-[var(--text-base)]";

const PAGE_SIZE = 25;

const emptyForm = {
  name: "", area: "", brand: "", serial_number: "", location_id: "",
  status: "active", last_maintenance_date: "", maintenance_interval_days: "",
  notes: "", purchase_date: "", supplier: "", warranty_until: "",
};
type MachineForm = typeof emptyForm;

const emptyLog = { description: "", technician: "", cost: "", kind: "preventivo", resolved_at: "" };

/** El aviso de mantenimiento, en una frase que se entiende sin hacer cuentas. */
function maintenanceNote(m: Machine): { text: string; tone: Tone } | null {
  if (m.is_overdue) {
    const atraso = -(m.days_until_maintenance ?? 0);
    return { text: atraso === 0 ? "Preventivo vence hoy" : `Preventivo vencido hace ${atraso} d`, tone: "danger" };
  }
  if (m.is_due_soon) return { text: `Preventivo en ${m.days_until_maintenance} d`, tone: "warn" };
  return null;
}

function Badge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", className)}
      style={toneStyle(tone)}
    >
      {children}
    </span>
  );
}

export default function MachinesClient() {
  const { data: session } = useSession();
  // Recepción puede consultar y registrar mantenimiento, no dar de alta ni
  // borrar equipos: ofrecerle esos botones solo la lleva a un 403.
  const { can } = useCan();
  const puedeEditar = can(P.MACHINES_WRITE);
  const token = session?.accessToken as string | undefined;

  const [view, setView] = useState<"list" | "calendar">("list");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [total, setTotal] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calendar, setCalendar] = useState<CalendarItem[] | null>(null);
  const [costs, setCosts] = useState<Costs | null>(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [page, setPage] = useState(0);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, MaintenanceLog[]>>({});
  const [logForm, setLogForm] = useState(emptyLog);
  const [logPhoto, setLogPhoto] = useState<File | null>(null);
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

  const [qrTarget, setQrTarget] = useState<{ machine: Machine; url: string } | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const filtering = !!(q || statusFilter || areaFilter || locationFilter || onlyOverdue);

  const fetchMachines = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiClient(token).get("/api/v1/machines", {
        params: {
          q: q || undefined,
          status: statusFilter || undefined,
          area: areaFilter || undefined,
          location_id: locationFilter || undefined,
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
      setError(parseApiError(err, "Error cargando máquinas"));
    } finally {
      setLoading(false);
    }
  }, [token, q, statusFilter, areaFilter, locationFilter, onlyOverdue, page]);

  const fetchSide = useCallback(async () => {
    if (!token) return;
    const client = apiClient(token);
    const [cal, cost] = await Promise.all([
      client.get("/api/v1/machines/calendar", { params: { days: 60 } }).catch(() => null),
      puedeEditar ? client.get("/api/v1/machines/costs", { params: { days: 365 } }).catch(() => null) : null,
    ]);
    setCalendar(cal ? cal.data.items : null);
    setCosts(cost ? cost.data : null);
  }, [token, puedeEditar]);

  useEffect(() => {
    // Debounce del buscador: una petición por pausa de escritura, no por tecla.
    const t = setTimeout(() => { void fetchMachines(); }, 250);
    return () => clearTimeout(t);
  }, [fetchMachines]);

  useEffect(() => { void fetchSide(); }, [fetchSide]);

  useEffect(() => {
    if (!token) return;
    apiClient(token)
      .get<Location[]>("/api/v1/locations")
      .then((r) => setLocations(r.data))
      .catch(() => setLocations([]));
  }, [token]);

  const refresh = async () => {
    await Promise.all([fetchMachines(), fetchSide()]);
  };

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
      purchase_date: m.purchase_date ?? "",
      supplier: m.supplier ?? "",
      warranty_until: m.warranty_until ?? "",
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
      purchase_date: form.purchase_date || null,
      supplier: form.supplier.trim() || null,
      warranty_until: form.warranty_until || null,
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
      await refresh();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error guardando la máquina"));
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
      await refresh();
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo eliminar"));
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
      await refresh();
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo reportar"));
    } finally {
      setReporting(false);
    }
  };

  const openQr = async (m: Machine, rotate = false) => {
    if (!token) return;
    try {
      const res = await apiClient(token).post(`/api/v1/machines/${m.id}/report-link`, null, {
        params: rotate ? { rotate: true } : undefined,
      });
      setQrTarget({ machine: m, url: `${window.location.origin}${res.data.path}` });
      if (rotate) toast.success("Código nuevo: el QR anterior dejó de funcionar");
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo generar el código"));
    }
  };

  const printQr = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg || !qrTarget) return;
    const nombre = qrTarget.machine.name.replace(/[&<>"']/g, "");
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("El navegador bloqueó la ventana de impresión");
      return;
    }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR · ${nombre}</title>
      <style>
        body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; color: #111; }
        .tag { border: 2px solid #111; border-radius: 16px; padding: 20px 24px; text-align: center; width: 260px; }
        .tag svg { width: 200px; height: 200px; }
        h1 { font-size: 18px; margin: 12px 0 4px; }
        p { font-size: 13px; margin: 0; color: #333; }
      </style></head><body>
      <div class="tag">${new XMLSerializer().serializeToString(svg)}
        <h1>¿Está dañada?</h1><p>Escanea y avísanos. ${nombre}</p></div>
      <script>window.onload = () => window.print();<\/script></body></html>`);
    win.document.close();
  };

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setLogForm(emptyLog);
    setLogPhoto(null);
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
      const created = await client.post(`/api/v1/machines/${id}/maintenance`, {
        description: logForm.description.trim(),
        technician: logForm.technician.trim(),
        cost: logForm.cost ? parseFloat(logForm.cost) : null,
        kind: logForm.kind,
        resolved_at: logForm.resolved_at || null,
      });
      if (logPhoto) {
        const fd = new FormData();
        fd.append("file", logPhoto);
        // El registro ya quedó: si la foto falla se avisa sin deshacer el mantenimiento.
        await client
          .post(`/api/v1/machines/${id}/maintenance/${created.data.id}/photo`, fd, { headers: { "Content-Type": undefined } })
          .catch((err) => toast.error(parseApiError(err, "El mantenimiento quedó, pero la foto no se subió")));
      }
      toast.success("Mantenimiento registrado");
      setLogForm(emptyLog);
      setLogPhoto(null);
      const res = await client.get(`/api/v1/machines/${id}/maintenance`);
      setLogs((prev) => ({ ...prev, [id]: res.data }));
      await refresh();
    } catch (err: any) {
      toast.error(parseApiError(err, "Error registrando el mantenimiento"));
    } finally {
      setAddingLog(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const calendarGroups = calendar
    ? [
        { key: "overdue", title: "Vencidos", items: calendar.filter((i) => i.is_overdue) },
        { key: "week", title: "Esta semana", items: calendar.filter((i) => !i.is_overdue && i.days_until_maintenance <= 7) },
        { key: "month", title: "Este mes", items: calendar.filter((i) => i.days_until_maintenance > 7 && i.days_until_maintenance <= 30) },
        { key: "later", title: "Más adelante", items: calendar.filter((i) => i.days_until_maintenance > 30) },
      ]
    : [];

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
        subtitle="Inventario, estado, garantías y mantenimiento de los equipos."
        action={
          puedeEditar ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva máquina
            </Button>
          ) : undefined
        }
      />

      {costs && Number(costs.total) > 0 && (
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Mantenimiento · 12 meses</p>
              <p className="text-2xl font-bold tabular-nums text-[var(--text-base)]">{formatCOP(Number(costs.total))}</p>
              <p className="text-xs text-[var(--text-muted)] tabular-nums">
                {formatCOP(Number(costs.preventive))} preventivo · {formatCOP(Number(costs.corrective))} en arreglos
              </p>
            </div>
            {costs.by_machine.length > 0 && (
              <div className="min-w-[220px] flex-1">
                <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Las que más cuestan</p>
                <ul className="space-y-1">
                  {costs.by_machine.slice(0, 3).map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 text-sm">
                      <span className="truncate text-[var(--text-base)]">{c.name}</span>
                      <span className="tabular-nums text-[var(--text-base)]">{formatCOP(Number(c.amount))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {costs.by_area.length > 1 && (
              <div className="min-w-[180px]">
                <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Por área</p>
                <ul className="space-y-1">
                  {costs.by_area.slice(0, 4).map((a) => (
                    <li key={a.label} className="flex justify-between gap-3 text-sm">
                      <span className="text-[var(--text-muted)]">{a.label}</span>
                      <span className="tabular-nums text-[var(--text-base)]">{formatCOP(Number(a.amount))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Vista" className="flex rounded-md border border-[var(--border-base)] p-0.5">
            {([["list", "Lista", List], ["calendar", "Calendario", CalendarDays]] as const).map(([v, l, Icon]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "h-8 px-2.5 rounded text-sm flex items-center gap-1.5 transition-colors",
                  view === v ? "bg-[var(--bg-muted)] text-[var(--text-base)] font-medium" : "text-[var(--text-muted)] hover:text-[var(--text-base)]",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden /> {l}
              </button>
            ))}
          </div>

          {view === "list" && (
            <>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(0); }}
                  placeholder="Nombre, marca o serial"
                  aria-label="Buscar máquina"
                  className="pl-8"
                />
              </div>
              <select
                aria-label="Estado"
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
                aria-label="Área"
                value={areaFilter}
                onChange={(e) => { setAreaFilter(e.target.value); setPage(0); }}
                className={cn(selectCls, "w-auto min-w-[130px]")}
              >
                <option value="">Todas las áreas</option>
                {AREA_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              {locations.length > 1 && (
                <select
                  aria-label="Sede"
                  value={locationFilter}
                  onChange={(e) => { setLocationFilter(e.target.value); setPage(0); }}
                  className={cn(selectCls, "w-auto min-w-[130px]")}
                >
                  <option value="">Todas las sedes</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              <button
                type="button"
                onClick={() => { setOnlyOverdue((v) => !v); setPage(0); }}
                aria-pressed={onlyOverdue}
                className="h-9 px-3 rounded-md border text-sm font-medium transition-colors"
                style={
                  onlyOverdue
                    ? { color: "var(--signal-danger)", background: "var(--signal-danger-bg)", borderColor: "var(--signal-danger-line)" }
                    : { color: "var(--text-muted)", borderColor: "var(--border-base)" }
                }
              >
                Solo vencidas
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2" style={{ color: "var(--signal-danger)" }}>
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {view === "calendar" ? (
          calendar === null ? (
            <p className="text-sm text-[var(--text-muted)] py-4">No se pudo cargar el calendario.</p>
          ) : calendar.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-6 w-6" />}
              title="Nada programado en los próximos 60 días"
              description="Configura cada cuántos días le toca preventivo a cada máquina y aparecerá aquí."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {calendarGroups.map((g) => (
                <section key={g.key} aria-labelledby={`cal-${g.key}`} className="space-y-2">
                  <h3 id={`cal-${g.key}`} className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
                    {g.title}
                    <span className="tabular-nums font-normal">{g.items.length}</span>
                  </h3>
                  {g.items.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">—</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {g.items.map((i) => (
                        <li key={i.id} className="rounded-lg border border-[var(--border-base)] px-3 py-2">
                          <p className="text-sm font-medium text-[var(--text-base)] truncate">{i.name}</p>
                          <p className="text-xs tabular-nums" style={{ color: i.is_overdue ? "var(--signal-danger)" : "var(--text-muted)" }}>
                            {formatDate(parseDateOnly(i.next_maintenance_date))}
                            {i.is_overdue
                              ? i.days_until_maintenance === 0 ? " · hoy" : ` · hace ${-i.days_until_maintenance} d`
                              : ` · en ${i.days_until_maintenance} d`}
                            {i.area ? ` · ${areaLabel(i.area)}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        ) : machines.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-6 w-6" />}
            title={filtering ? "Ninguna máquina coincide" : "Sin máquinas registradas"}
            description={filtering
              ? "Prueba con otro filtro o limpia la búsqueda."
              : "Agrega el inventario de equipos: con la fecha de compra y la garantía, el historial sirve para reclamar."}
            action={puedeEditar && !filtering ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nueva máquina</Button> : undefined}
          />
        ) : (
          <ul className="list-none m-0 p-0 space-y-2">
            {machines.map((m) => {
              const aviso = maintenanceNote(m);
              const abierta = expanded === m.id;
              const detalles = [areaLabel(m.area), m.brand, m.serial_number].filter(Boolean).join(" · ");
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
                        {detalles || "Sin detalles"}
                        {m.maintenance_cost_total !== undefined && Number(m.maintenance_cost_total) > 0 && (
                          <span className="tabular-nums"> · {formatCOP(Number(m.maintenance_cost_total))} en mantenimiento</span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                      {aviso && (
                        <Badge tone={aviso.tone}><Wrench className="h-3 w-3" /> {aviso.text}</Badge>
                      )}
                      {m.warranty_active && m.warranty_until && (
                        <Badge tone="info" className="hidden sm:inline-flex">
                          <ShieldCheck className="h-3 w-3" /> Garantía hasta {formatDate(parseDateOnly(m.warranty_until))}
                        </Badge>
                      )}
                      <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{STATUS_LABEL[m.status] ?? m.status}</Badge>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <IconButton title="Reportar avería" onClick={() => { setFaultTarget(m); setFaultText(""); }}>
                        <TriangleAlert className="h-4 w-4" />
                      </IconButton>
                      {puedeEditar && (
                        <>
                          <IconButton title="QR para reportar averías" onClick={() => openQr(m)}>
                            <QrCode className="h-4 w-4" />
                          </IconButton>
                          <IconButton title="Editar" onClick={() => openEdit(m)}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton title="Eliminar" onClick={() => setDeleteTarget(m)}>
                            <Trash2 className="h-4 w-4" />
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
                    <div className="px-3 pb-3 pt-2 bg-[var(--bg-muted)] space-y-3">
                      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                        {m.last_maintenance_date && (
                          <div><dt className="inline">Último preventivo: </dt><dd className="inline text-[var(--text-base)]">{formatDate(parseDateOnly(m.last_maintenance_date))}</dd></div>
                        )}
                        {m.next_maintenance_date && (
                          <div><dt className="inline">Próximo: </dt><dd className="inline text-[var(--text-base)]">{formatDate(parseDateOnly(m.next_maintenance_date))}</dd></div>
                        )}
                        {m.purchase_date && (
                          <div><dt className="inline">Comprada: </dt><dd className="inline text-[var(--text-base)]">{formatDate(parseDateOnly(m.purchase_date))}</dd></div>
                        )}
                        {m.supplier && (
                          <div><dt className="inline">Proveedor: </dt><dd className="inline text-[var(--text-base)]">{m.supplier}</dd></div>
                        )}
                        {m.warranty_until && (
                          <div>
                            <dt className="inline">Garantía: </dt>
                            <dd className="inline" style={{ color: m.warranty_active ? "var(--text-base)" : "var(--signal-warn)" }}>
                              {m.warranty_active ? "hasta " : "venció el "}{formatDate(parseDateOnly(m.warranty_until))}
                            </dd>
                          </div>
                        )}
                        {m.notes && <div className="basis-full">{m.notes}</div>}
                      </dl>

                      <div className="space-y-2">
                        {(logs[m.id] ?? []).map((log) => (
                          <div key={log.id} className="p-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] text-sm flex gap-3">
                            {log.photo_url && (
                              <a href={log.photo_url} target="_blank" rel="noreferrer" className="shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={log.photo_url} alt="Foto del mantenimiento" className="h-14 w-14 rounded-md object-cover border border-[var(--border-base)]" />
                              </a>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[var(--text-base)]">{log.description}</p>
                                <Badge tone={log.kind === "correctivo" ? "danger" : "info"} className="shrink-0 uppercase tracking-wide text-[10px]">
                                  {log.kind}
                                </Badge>
                              </div>
                              <div className="flex gap-3 mt-1 text-[var(--text-muted)] text-xs flex-wrap">
                                <span>Técnico: {log.technician}</span>
                                {log.reported_by && <span>Reportó: {log.reported_by}</span>}
                                {log.cost != null && <span className="tabular-nums">{formatCOP(Number(log.cost))}</span>}
                                {log.resolved_at && <span>Resuelto: {formatDate(parseDateOnly(log.resolved_at))}</span>}
                                <span>{formatDate(log.created_at)}</span>
                              </div>
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
                          aria-label="Qué se hizo"
                          value={logForm.description}
                          onChange={(e) => setLogForm((p) => ({ ...p, description: e.target.value }))}
                          className="text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Input
                            placeholder="Técnico *"
                            aria-label="Técnico"
                            value={logForm.technician}
                            onChange={(e) => setLogForm((p) => ({ ...p, technician: e.target.value }))}
                            className="text-sm flex-1 min-w-[140px]"
                          />
                          <select
                            aria-label="Tipo de mantenimiento"
                            value={logForm.kind}
                            onChange={(e) => setLogForm((p) => ({ ...p, kind: e.target.value }))}
                            className={cn(selectCls, "w-auto")}
                            title="Solo el preventivo reinicia el ciclo"
                          >
                            <option value="preventivo">Preventivo</option>
                            <option value="correctivo">Correctivo</option>
                          </select>
                          <Input
                            type="number" min="0" step="1" placeholder="Costo"
                            aria-label="Costo"
                            value={logForm.cost}
                            onChange={(e) => setLogForm((p) => ({ ...p, cost: e.target.value }))}
                            className="text-sm w-28"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="h-9 px-3 rounded-md border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-base)] flex items-center gap-1.5 cursor-pointer">
                            <ImageIcon className="h-4 w-4" aria-hidden />
                            <span className="max-w-[160px] truncate">{logPhoto ? logPhoto.name : "Adjuntar foto"}</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              onChange={(e) => setLogPhoto(e.target.files?.[0] ?? null)}
                            />
                          </label>
                          <Button
                            type="button"
                            disabled={addingLog || !logForm.description.trim() || !logForm.technician.trim()}
                            onClick={() => handleAddLog(m.id)}
                          >
                            {addingLog ? "Guardando…" : "Registrar"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {view === "list" && total > PAGE_SIZE && (
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
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Área">
            <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className={selectCls}>
              <option value="">Sin área</option>
              {AREA_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
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
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Technogym" />
          </FormField>
          <FormField label="Serial" hint="El número que pide el servicio técnico">
            <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="TG-88231" />
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
          <FormField label="Fecha de compra">
            <DatePicker
              value={form.purchase_date ? parseDateOnly(form.purchase_date) : undefined}
              onChange={(d) => setForm({ ...form, purchase_date: toISODate(d) })}
              placeholder="Seleccionar fecha"
              maxDate={new Date()}
              fromYear={2000}
            />
          </FormField>
          <FormField label="Garantía hasta" hint="Para saber contra quién reclamar">
            <DatePicker
              value={form.warranty_until ? parseDateOnly(form.warranty_until) : undefined}
              onChange={(d) => setForm({ ...form, warranty_until: toISODate(d) })}
              placeholder="Seleccionar fecha"
              fromYear={2000}
              toYear={new Date().getFullYear() + 10}
            />
          </FormField>
        </div>

        <FormField label="Proveedor">
          <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Importadora Andina · 601 555 0199" />
        </FormField>

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
        open={!!qrTarget}
        onOpenChange={(v) => { if (!v) setQrTarget(null); }}
        title={`QR de reporte · ${qrTarget?.machine.name ?? ""}`}
        description="Imprímelo y pégalo en la máquina. Quien la encuentre dañada la reporta desde el celular, sin cuenta."
        onSubmit={printQr}
        submitLabel="Imprimir"
      >
        {qrTarget && (
          <div className="flex flex-col items-center gap-3">
            <div ref={qrRef} className="p-3 bg-white rounded-xl border border-[var(--border-base)]">
              <QRCodeSVG value={qrTarget.url} size={184} level="M" marginSize={1} />
            </div>
            <p className="text-xs text-[var(--text-muted)] break-all text-center">{qrTarget.url}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => openQr(qrTarget.machine, true)}>
              Generar un código nuevo
            </Button>
          </div>
        )}
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
      className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors"
      {...rest}
    >
      {children}
    </button>
  );
}
