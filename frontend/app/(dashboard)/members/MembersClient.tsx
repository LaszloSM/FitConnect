"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, AlertCircle } from "lucide-react";

const memberSchema = z.object({
  full_name: z.string().min(2, "Nombre demasiado corto"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
  id_number: z.string().optional(),
  birth_date: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  notes: z.string().optional(),
});

interface Member {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  id_number: string | null;
  birth_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";
const selectCls =
  "w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-1 text-sm text-[var(--text-base)]";

export default function MembersClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    id_number: "",
    birth_date: "",
    status: "active",
    notes: "",
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchMembers = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/members", {
        params: { q: search, ...(statusFilter ? { status: statusFilter } : {}) },
      });
      setMembers(res.data);
      setError("");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setError((err as any).response?.data?.detail || "Error cargando miembros"); // eslint-disable-line @typescript-eslint/no-explicit-any
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    setLoading(true);
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/members", {
      params: { q: search, ...(statusFilter ? { status: statusFilter } : {}) },
    }).then((res) => {
      if (!cancelled) { setMembers(res.data); setError(""); }
    }).catch((err: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!cancelled) setError((err as any).response?.data?.detail || "Error cargando miembros"); // eslint-disable-line @typescript-eslint/no-explicit-any
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [session, search, statusFilter]);

  const resetForm = () => {
    setForm({ full_name: "", email: "", phone: "", id_number: "", birth_date: "", status: "active", notes: "" });
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (member: Member) => {
    setEditing(member);
    setForm({
      full_name: member.full_name, email: member.email, phone: member.phone || "",
      id_number: member.id_number || "", birth_date: member.birth_date || "",
      status: member.status, notes: member.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    const validation = memberSchema.safeParse(form);
    if (!validation.success) { toast.error(validation.error.issues[0].message); return; }
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);
    try {
      if (editing) { await client.put(`/api/v1/members/${editing.id}`, form); }
      else { await client.post("/api/v1/members", form); }
      toast.success(editing ? "Miembro actualizado" : "Miembro creado");
      setDialogOpen(false); resetForm(); fetchMembers();
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const detail = (err as any).response?.data?.detail; // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0]?.msg : "Error guardando miembro");
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.delete(`/api/v1/members/${id}`);
      toast.success("Miembro eliminado correctamente");
      setDeleteId(null); fetchMembers();
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const detail = (err as any).response?.data?.detail; // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0]?.msg : "Error eliminando");
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
          title="Miembros"
          subtitle="Gestiona los socios de tu gym"
          action={
            <DialogTrigger render={
              <Button onClick={openCreate} className="bg-orange-500 text-white hover:bg-orange-600">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo miembro
              </Button>
            } />
          }
        />
        <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-base)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-base)] font-display">
              {editing ? "Editar miembro" : "Nuevo miembro"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name" className="text-[var(--text-muted)] text-sm">Nombre completo</Label>
                <Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[var(--text-muted)] text-sm">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Teléfono</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Documento</Label>
                <Input value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Fecha nacimiento</Label>
                <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Estado</Label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectCls}>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[var(--text-muted)] text-sm">Notas</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="text-[var(--text-muted)]">Cancelar</Button>
              <Button type="submit" disabled={submitting} className="bg-orange-500 text-white font-semibold hover:bg-orange-600">
                {submitting ? "Guardando..." : (editing ? "Guardar cambios" : "Crear miembro")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <GlassCard className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn("pl-9", inputCls)}
            />
          </div>
          <div className="flex items-center gap-2">
            {(["", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  statusFilter === s
                    ? "bg-orange-500 text-white"
                    : "bg-[var(--bg-base)] border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
                )}
              >
                {s === "" ? "Todos" : s === "active" ? "Activos" : "Inactivos"}
              </button>
            ))}
          </div>
        </div>

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
                <TableHead className="text-[var(--text-muted)]">Email</TableHead>
                <TableHead className="text-[var(--text-muted)]">Teléfono</TableHead>
                <TableHead className="text-[var(--text-muted)]">Documento</TableHead>
                <TableHead className="text-[var(--text-muted)]">Estado</TableHead>
                <TableHead className="text-[var(--text-muted)]">Fecha Registro</TableHead>
                <TableHead className="text-[var(--text-muted)] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-[var(--border-base)]">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><div className="skeleton h-4 rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      title="Sin miembros"
                      description="Crea tu primer miembro para comenzar"
                      action={
                        <Button onClick={openCreate} className="bg-orange-500 text-white hover:bg-orange-600">
                          <Plus className="h-4 w-4 mr-2" />
                          Nuevo miembro
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => (
                  <TableRow
                    key={m.id}
                    className="border-[var(--border-base)] cursor-pointer hover:bg-[var(--bg-base)]"
                    onClick={() => router.push(`/members/${m.id}`)}
                  >
                    <TableCell className="text-[var(--text-base)] font-medium">
                      <div className="flex items-center gap-2">
                        <span className="h-7 w-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {m.full_name[0].toUpperCase()}
                        </span>
                        {m.full_name}
                      </div>
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)]">{m.email}</TableCell>
                    <TableCell className="text-[var(--text-muted)]">{m.phone || "-"}</TableCell>
                    <TableCell className="text-[var(--text-muted)]">{m.id_number || "-"}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                        m.status === "active"
                          ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                          : "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                      )}>
                        {m.status === "active" ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] text-sm">
                      {new Date(m.created_at).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-[var(--text-muted)] hover:text-[var(--text-base)]"
                          onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-[var(--text-muted)] hover:text-red-500"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(m.id); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDeleteId(null)}>
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[var(--text-base)] font-semibold mb-2">¿Eliminar miembro?</h3>
            <p className="text-[var(--text-muted)] text-sm mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { handleDelete(deleteId); }}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
