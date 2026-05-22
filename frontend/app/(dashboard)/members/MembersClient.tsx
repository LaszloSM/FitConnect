"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMsg = (err as any).response?.data?.detail || "Error cargando miembros";
      setError(errorMsg);
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
      if (!cancelled) {
        setMembers(res.data);
        setError("");
      }
    }).catch((err: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!cancelled) setError((err as any).response?.data?.detail || "Error cargando miembros");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [session, search, statusFilter]);

  const resetForm = () => {
    setForm({
      full_name: "",
      email: "",
      phone: "",
      id_number: "",
      birth_date: "",
      status: "active",
      notes: "",
    });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (member: Member) => {
    setEditing(member);
    setForm({
      full_name: member.full_name,
      email: member.email,
      phone: member.phone || "",
      id_number: member.id_number || "",
      birth_date: member.birth_date || "",
      status: member.status,
      notes: member.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;

    const validation = memberSchema.safeParse(form);
    if (!validation.success) {
      toast.error(validation.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    const client = apiClient(session.accessToken as string);
    try {
      if (editing) {
        await client.put(`/api/v1/members/${editing.id}`, form);
      } else {
        await client.post("/api/v1/members", form);
      }
      toast.success(editing ? "Miembro actualizado" : "Miembro creado");
      setDialogOpen(false);
      resetForm();
      fetchMembers();
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any).response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail[0]?.msg
            : "Error guardando miembro";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.delete(`/api/v1/members/${id}`);
      toast.success("Miembro eliminado correctamente");
      setDeleteId(null);
      fetchMembers();
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any).response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail[0]?.msg
            : "Error eliminando";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white font-display">Miembros</h2>
          <p className="text-muted text-sm mt-1">Gestiona los miembros de tu gym</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={openCreate} className="bg-primary text-bg-deep font-semibold hover:bg-primary/90" />}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo miembro
          </DialogTrigger>
          <DialogContent className="bg-surface border-border-dark text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white font-display">
                {editing ? "Editar miembro" : "Nuevo miembro"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name" className="text-muted text-sm">Nombre completo</Label>
                  <Input
                    id="full_name"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                    className="bg-bg-deep border-border-dark text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="bg-bg-deep border-border-dark text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Telefono</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="bg-bg-deep border-border-dark text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Documento</Label>
                  <Input
                    value={form.id_number}
                    onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                    className="bg-bg-deep border-border-dark text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Fecha nacimiento</Label>
                  <Input
                    type="date"
                    value={form.birth_date}
                    onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                    className="bg-bg-deep border-border-dark text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted text-sm">Estado</Label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full h-9 rounded-md border border-border-dark bg-bg-deep px-3 py-1 text-sm text-white"
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted text-sm">Notas</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="bg-bg-deep border-border-dark text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="text-muted">
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} className="bg-primary text-bg-deep font-semibold hover:bg-primary/90">
                  {submitting ? "Guardando..." : (editing ? "Guardar cambios" : "Crear miembro")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <GlassCard className="p-4">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-bg-deep border-border-dark text-white placeholder:text-muted"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
            className="h-9 rounded-md border border-border-dark bg-bg-deep px-3 text-sm text-white"
          >
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>

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
                <TableHead className="text-muted">Email</TableHead>
                <TableHead className="text-muted">Teléfono</TableHead>
                <TableHead className="text-muted">Documento</TableHead>
                <TableHead className="text-muted">Estado</TableHead>
                <TableHead className="text-muted">Fecha Registro</TableHead>
                <TableHead className="text-muted text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border-dark">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-white/5 rounded animate-pulse" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted py-8">
                    No hay miembros registrados
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => (
                  <TableRow
                    key={m.id}
                    className="border-border-dark cursor-pointer hover:bg-white/5"
                    onClick={() => router.push(`/members/${m.id}`)}
                  >
                    <TableCell className="text-white font-medium">{m.full_name}</TableCell>
                    <TableCell className="text-muted">{m.email}</TableCell>
                    <TableCell className="text-muted">{m.phone || "-"}</TableCell>
                    <TableCell className="text-muted">{m.id_number || "-"}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.status === "active"
                            ? "bg-success/20 text-success"
                            : "bg-danger/20 text-danger"
                        }`}
                      >
                        {m.status === "active" ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted text-sm">
                      {new Date(m.created_at).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted hover:text-white"
                          onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted hover:text-danger"
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeleteId(null)}>
          <div className="bg-surface border border-border-dark rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-2">¿Eliminar?</h3>
            <p className="text-muted text-sm mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { handleDelete(deleteId); }}
                className="px-4 py-2 text-sm bg-danger text-white rounded-md hover:bg-danger/90 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


