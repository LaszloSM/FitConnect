/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { GlassCard } from "@/components/common/GlassCard";
import MemberSelect from "@/components/common/MemberSelect";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface CheckIn {
  id: string;
  member_id: string;
  type: string;
  notes: string | null;
  created_at: string;
}

export default function CheckinsClient() {
  const { data: session } = useSession();
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [memberId, setMemberId] = useState("");
  const [type, setType] = useState("entry");

  const fetchCheckins = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/checkins");
      setCheckins(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error cargando check-ins");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCheckins();
  }, [session]);

  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    try {
      await client.post("/api/v1/checkins", {
        member_id: memberId,
        type,
      });
      setMemberId("");
      fetchCheckins();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error registrando check-in");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white font-display">Check-ins</h2>
        <p className="text-muted text-sm mt-1">Registra entradas y salidas de miembros</p>
      </div>

      <GlassCard className="p-4">
        <form onSubmit={handleCheckin} className="flex items-end gap-3 mb-6">
          <div className="flex-1 space-y-2">
            <Label className="text-muted text-sm">Miembro</Label>
            <MemberSelect
              value={memberId}
              onChange={(id) => setMemberId(id)}
            />
          </div>
          <div className="w-40 space-y-2">
            <Label className="text-muted text-sm">Tipo</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full h-9 rounded-md border border-border-dark bg-bg-deep px-3 py-1 text-sm text-white"
            >
              <option value="entry">Entrada</option>
              <option value="exit">Salida</option>
            </select>
          </div>
          <Button type="submit" className="bg-primary text-bg-deep font-semibold hover:bg-primary/90 h-9">
            <Activity className="h-4 w-4 mr-2" />
            Registrar
          </Button>
        </form>

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
                <TableHead className="text-muted">Miembro</TableHead>
                <TableHead className="text-muted">Tipo</TableHead>
                <TableHead className="text-muted">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted py-8">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : checkins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted py-8">
                    No hay check-ins registrados hoy
                  </TableCell>
                </TableRow>
              ) : (
                checkins.map((c) => (
                  <TableRow key={c.id} className="border-border-dark">
                    <TableCell className="text-white font-medium">{c.member_id.slice(0, 8)}...</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.type === "entry"
                            ? "bg-success/20 text-success"
                            : "bg-danger/20 text-danger"
                        }`}
                      >
                        {c.type === "entry" ? "Entrada" : "Salida"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted text-xs">
                      {new Date(c.created_at).toLocaleString()}
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


