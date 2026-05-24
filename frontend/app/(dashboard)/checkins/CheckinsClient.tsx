/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { MembershipStatusBadge } from "@/components/common/MembershipStatusBadge";
import MemberSelect from "@/components/common/MemberSelect";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, AlertCircle, LogIn, LogOut, QrCode, ScanLine, User } from "lucide-react";
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

interface MemberMembership {
  status: "ok" | "expired" | "no_membership";
  end_date?: string;
}

type TypeFilter = "" | "entry" | "exit";
type ActiveTab = "qr" | "manual";

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
  const [activeTab, setActiveTab] = useState<ActiveTab>("qr");

  // QR tab state
  const [qrCode, setQrCode] = useState("");
  const [submittingQr, setSubmittingQr] = useState(false);

  // Manual tab state
  const [memberId, setMemberId] = useState("");
  const [type, setType] = useState("entry");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<MemberMembership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);

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

  useEffect(() => {
    if (!memberId || !session?.accessToken) {
      setMembershipStatus(null);
      return;
    }
    setMembershipLoading(true);
    const client = apiClient(session.accessToken as string);
    client
      .get(`/api/v1/members/${memberId}/memberships`)
      .then((res) => {
        const data = res.data;
        if (Array.isArray(data) && data.length > 0) {
          const latest = data[0];
          const now = new Date();
          const end = latest.end_date ? new Date(latest.end_date) : null;
          setMembershipStatus({
            status: !end ? "ok" : end < now ? "expired" : "ok",
            end_date: latest.end_date,
          });
        } else if (Array.isArray(data) && data.length === 0) {
          setMembershipStatus({ status: "no_membership" });
        } else if (data?.status) {
          setMembershipStatus(data as MemberMembership);
        } else {
          setMembershipStatus(null);
        }
      })
      .catch(() => setMembershipStatus(null))
      .finally(() => setMembershipLoading(false));
  }, [memberId, session]);

  const handleQrCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken || !qrCode.trim()) return;
    setSubmittingQr(true);
    const client = apiClient(session.accessToken as string);
    try {
      await client.post(`/api/v1/checkins/qr/${qrCode.trim()}`);
      toast.success("Check-in por QR registrado");
      setQrCode("");
      fetchCheckins();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error registrando check-in por QR");
    } finally {
      setSubmittingQr(false);
    }
  };

  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken || !memberId) return;
    setSubmitting(true);
    const client = apiClient(session.accessToken as string);
    try {
      await client.post("/api/v1/checkins", { member_id: memberId, type, notes: notes || undefined });
      toast.success(type === "entry" ? "Entrada registrada" : "Salida registrada");
      setMemberId("");
      setNotes("");
      setMembershipStatus(null);
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

  const filtered = typeFilter ? checkins.filter((c) => c.type === typeFilter) : checkins;
  const showMembershipWarning =
    membershipStatus?.status === "expired" || membershipStatus?.status === "no_membership";

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

      <GlassCard className="p-0 overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-[var(--border-base)]">
          <button
            onClick={() => setActiveTab("qr")}
            className={cn(
              "flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors relative",
              activeTab === "qr"
                ? "text-[var(--color-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-base)]"
            )}
          >
            <QrCode className="h-4 w-4" />
            Por QR
            {activeTab === "qr" && (
              <motion.span
                layoutId="checkin-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)]"
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={cn(
              "flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors relative",
              activeTab === "manual"
                ? "text-[var(--color-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-base)]"
            )}
          >
            <User className="h-4 w-4" />
            Manual
            {activeTab === "manual" && (
              <motion.span
                layoutId="checkin-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)]"
              />
            )}
          </button>
        </div>

        {/* QR Tab */}
        {activeTab === "qr" && (
          <motion.div
            key="qr-tab"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="p-6"
          >
            <form onSubmit={handleQrCheckin} className="flex flex-col items-center gap-6 max-w-sm mx-auto py-4">
              {/* QR visual area */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-24 h-24 rounded-2xl bg-[var(--bg-muted)] border-2 border-dashed border-[var(--border-base)] flex items-center justify-center">
                  <ScanLine className="h-12 w-12 text-[var(--color-primary)] opacity-80" strokeWidth={1.5} />
                </div>
                <p className="text-[var(--text-muted)] text-sm text-center leading-relaxed">
                  Posiciona el código QR del carné frente al escáner<br />
                  o ingrésalo manualmente
                </p>
              </div>

              {/* Large input */}
              <div className="w-full space-y-2">
                <Input
                  value={qrCode}
                  onChange={(e) => setQrCode(e.target.value)}
                  placeholder="Código QR del miembro..."
                  autoFocus
                  className="text-center text-base h-12 bg-[var(--bg-input)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)] tracking-widest"
                />
              </div>

              <Button
                type="submit"
                disabled={submittingQr || !qrCode.trim()}
                className="w-full h-11 bg-[var(--color-primary)] text-white font-semibold hover:opacity-90 transition-opacity"
              >
                <Activity className="h-4 w-4 mr-2" />
                {submittingQr ? "Registrando..." : "Registrar entrada"}
              </Button>
            </form>
          </motion.div>
        )}

        {/* Manual Tab */}
        {activeTab === "manual" && (
          <motion.div
            key="manual-tab"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="p-6"
          >
            <form onSubmit={handleCheckin} className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
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
                  className="bg-[var(--color-primary)] text-white font-semibold hover:opacity-90 transition-opacity h-9"
                >
                  <Activity className="h-4 w-4 mr-2" />
                  {submitting ? "Registrando..." : "Registrar"}
                </Button>
              </div>

              {memberId && !membershipLoading && membershipStatus && (
                <div className="flex items-center gap-2">
                  <MembershipStatusBadge
                    status={membershipStatus.status}
                    endDate={membershipStatus.end_date}
                  />
                </div>
              )}

              {showMembershipWarning && (
                <Alert variant="warning">
                  {membershipStatus?.status === "no_membership"
                    ? "El miembro no tiene membresía activa."
                    : "La membresía del miembro está vencida."
                  }{" "}
                  ¿Desea registrar el ingreso de todas formas?
                </Alert>
              )}

              <div className="space-y-2">
                <Label className="text-[var(--text-muted)] text-sm">Notas (opcional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones del check-in..."
                />
              </div>
            </form>
          </motion.div>
        )}
      </GlassCard>

      {/* History */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-base)]">Historial de hoy</h2>
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por tipo">
            {TYPE_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                aria-pressed={typeFilter === key}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  typeFilter === key
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--bg-base)] border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
                )}
              >
                {label}
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
                <TableHead className="text-[var(--text-muted)]">Miembro</TableHead>
                <TableHead className="text-[var(--text-muted)]">Tipo</TableHead>
                <TableHead className="text-[var(--text-muted)]">Notas</TableHead>
                <TableHead className="text-[var(--text-muted)]">Hora</TableHead>
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
                          : "Usa el QR o el formulario manual para registrar la primera entrada del día"
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
                            : "bg-gray-100 dark:bg-gray-800/30 text-gray-600 dark:text-gray-400"
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
