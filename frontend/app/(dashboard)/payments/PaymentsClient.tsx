/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { GlassCard } from "@/components/common/GlassCard";
import MemberSelect from "@/components/common/MemberSelect";
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
import { Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Payment {
  id: string;
  member_id: string;
  amount: number;
  method: string | null;
  status: string;
  concept: string;
  created_at: string;
}

const inputCls = "bg-white border-slate-200 text-slate-800";
const selectCls = "w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800";

export default function PaymentsClient() {
  const { data: session } = useSession();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ member_id: "", amount: "", method: "cash", concept: "" });

  const fetchPayments = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/payments");
      setPayments(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error cargando pagos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPayments(); }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    try {
      await client.post("/api/v1/payments", { ...form, amount: parseFloat(form.amount) });
      setDialogOpen(false);
      setForm({ member_id: "", amount: "", method: "cash", concept: "" });
      fetchPayments();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error guardando pago");
    }
  };

  const statusBadge = (status: string) => {
    if (status === "paid") return "bg-green-50 text-green-600";
    if (status === "pending") return "bg-amber-50 text-amber-600";
    return "bg-red-50 text-red-600";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 font-display">Pagos</h2>
          <p className="text-slate-500 text-sm mt-1">Registra y gestiona pagos de miembros</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button onClick={() => setDialogOpen(true)} className="bg-orange-500 text-white font-semibold hover:bg-orange-600">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo pago
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-slate-200 text-slate-800 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-slate-800 font-display">Nuevo pago</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label className="text-slate-600 text-sm">Miembro</Label>
                <MemberSelect value={form.member_id} onChange={(id) => setForm({ ...form, member_id: id })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-600 text-sm">Monto</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-600 text-sm">Método</Label>
                  <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={selectCls}>
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                    <option value="card">Tarjeta</option>
                    <option value="wompi">Wompi</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-600 text-sm">Concepto</Label>
                <Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} required className={inputCls} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="text-slate-500">Cancelar</Button>
                <Button type="submit" className="bg-orange-500 text-white font-semibold hover:bg-orange-600">Registrar pago</Button>
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
                <TableHead className="text-slate-500">Miembro</TableHead>
                <TableHead className="text-slate-500">Concepto</TableHead>
                <TableHead className="text-slate-500">Monto</TableHead>
                <TableHead className="text-slate-500">Método</TableHead>
                <TableHead className="text-slate-500">Estado</TableHead>
                <TableHead className="text-slate-500">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">Cargando...</TableCell>
                </TableRow>
              ) : payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">No hay pagos registrados</TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p.id} className="border-slate-200">
                    <TableCell className="text-slate-800 font-medium">{p.member_id.slice(0, 8)}...</TableCell>
                    <TableCell className="text-slate-500">{p.concept}</TableCell>
                    <TableCell className="text-slate-800 font-medium">${p.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-500 capitalize">{p.method || "-"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(p.status)}`}>
                        {p.status === "paid" ? "Pagado" : p.status === "pending" ? "Pendiente" : p.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell>
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
