/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import MemberSelect from "@/components/common/MemberSelect";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
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
import { Activity, AlertCircle, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface CheckIn {
  id: string;
  member_id: string;
  member_name?: string;
  type: string;
  notes: string | null;
  created_at: string;
}

type TypeFilter = "" | "entry" | "exit";

const selectCls =
  "w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-1 text-sm text-[var(--text-base)]";

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "",      label: "Todos" },
  { key: "entry", label: "Entradas" },
  { key: "exit",  label: "Salidas" },
];

export default function CheckinsClient() {
  const { data: session } = useSession();
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [memberId, setMemberId] = useState("");
  const [type, setType] = useState("entry");
  const [submitting, setSubmitting] = useState(false);

  const fetchCheckins = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/checkins");
      setCheckins(res.data);
      setError("");
    } catch (err: any) {
      setError(
        typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Error cargando check-ins"
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
      .get("/api/v1/checkins")
      .then((res) => {
        if (!cancelled) { setCheckins(res.data); setError(""); }
      })
      .catch((err: any) => {
        if (!cancelled)
          setError(
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Error cargando check-ins"
          );
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session]);

  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken || !memberId) return;
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);
    try {
      await client.post("/api/v1/checkins", { member_id: memberId, type });
      toast.success(type === "entry" ? "Entrada registrada" : "Salida registrada");
      setMemberId("");
      fetchCheckins();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail[0]?.msg
          : "Error registrando check-in"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = typeFilter
    ? checkins.filter((c) => c.type === typeFilter)
    : checkins;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <PageHeader
        title="Check-ins"
        subtitle="Registra entradas y salidas de miembros"
      />

      <GlassCard className="p-4">
        {/* Quick-register form */}
        <form onSubmit={handleCheckin} className="flex flex-wrap items-end gap-3 mb-6 pb-5 border-b border-[var(--border-base)]">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Miembro</Label>
            <MemberSelect value={memberId} onChange={(id) => setMemberId(id)} />
          </div>
          <div className="w-36 space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Tipo</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={selectCls}
            >
              <option value="entry">Entrada</option>
              <option value="exit">Salida</option>
            </select>
          </div>
          <Button
            type="submit"
            disabled={submitting || !memberId}
            className="bg-orange-500 text-white font-semibold hover:bg-orange-600 h-9"
          >
            <Activity className="h-4 w-4 mr-2" />
            {submitting ? "Registrando..." : "Registrar"}
          </Button>
        </form>

        {/* Type filter pills */}
        <div
          className="flex gap-2 flex-wrap mb-4"
          role="group"
          aria-label="Filtrar por tipo"
        >
          {TYPE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              aria-pressed={typeFilter === key}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                typeFilter === key
                  ? "bg-orange-500 text-white"
                  : "bg-[var(--bg-base)] border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
              )}
            >
              {label}
            </button>
          ))}
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
                <TableHead className="text-[var(--text-muted)]">Miembro</TableHead>
                <TableHead className="text-[var(--text-muted)]">Tipo</TableHead>
                <TableHead className="text-[var(--text-muted)]">Notas</TableHead>
                <TableHead className="text-[var(--text-muted)]">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-[var(--border-base)]">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="skeleton h-4 rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState
                      title={typeFilter ? "Sin registros de este tipo" : "Sin check-ins hoy"}
                      description={
                        typeFilter
                          ? "Cambia el filtro para ver otros registros"
                          : "Registra la entrada de un miembro usando el formulario de arriba"
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="border-[var(--border-base)] hover:bg-[var(--bg-base)]">
                    <TableCell className="text-[var(--text-base)] font-medium">
                      {c.member_name ?? `${c.member_id.slice(0, 8)}…`}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                          c.type === "entry"
                            ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                            : "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                        )}
                      >
                        {c.type === "entry" ? (
                          <LogIn className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <LogOut className="h-3 w-3" aria-hidden="true" />
                        )}
                        {c.type === "entry" ? "Entrada" : "Salida"}
                      </span>
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] text-sm">
                      {c.notes || "-"}
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] text-sm">
                      <span title={new Date(c.created_at).toLocaleString("es-ES")}>
                        {formatDistanceToNow(new Date(c.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
    </motion.div>
  );
}
