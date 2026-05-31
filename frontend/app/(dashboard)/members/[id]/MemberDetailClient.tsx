"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { apiClient } from "@/lib/api";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  IdCard,
  Calendar,
  CreditCard,
  Activity,
  Tag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BadgeX,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

type Tab = "info" | "memberships" | "payments" | "checkins";

const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "info",        label: "Perfil",       icon: <User className="h-3.5 w-3.5" /> },
  { key: "memberships", label: "Membresías",   icon: <Tag className="h-3.5 w-3.5" /> },
  { key: "payments",    label: "Pagos",         icon: <CreditCard className="h-3.5 w-3.5" /> },
  { key: "checkins",    label: "Check-ins",     icon: <Activity className="h-3.5 w-3.5" /> },
];

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function MembershipStatusPill({ status }: { status: string }) {
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800/60">
        <CheckCircle2 className="h-3 w-3" /> Activa
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-800/60">
      <Clock className="h-3 w-3" /> Vencida
    </span>
  );
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export default function MemberDetailClient({ memberId }: { memberId: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("info");
  const [member, setMember] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    Promise.all([
      client.get(`/api/v1/members/${memberId}`),
      client.get(`/api/v1/members/${memberId}/payments`),
      client.get(`/api/v1/members/${memberId}/checkins`),
      client.get(`/api/v1/members/${memberId}/memberships`),
      client.get("/api/v1/member-plans"),
    ]).then(([m, p, c, ms, pl]) => {
      setMember(m.data);
      setPayments(p.data);
      setCheckins(c.data);
      setMemberships(ms.data);
      setPlans(pl.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [session?.accessToken, memberId]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken || !selectedPlan) return;
    setAssigning(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.post("/api/v1/member-plans/assign", {
        member_id: memberId,
        plan_id: selectedPlan,
        start_date: startDate,
      });
      toast.success("Membresía asignada correctamente");
      setSelectedPlan("");
      const ms = await client.get(`/api/v1/members/${memberId}/memberships`);
      setMemberships(ms.data);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error asignando membresía");
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-7 w-48 rounded-lg" />
        </div>
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <BadgeX className="h-10 w-10 text-[var(--text-muted)]" />
        <p className="text-[var(--text-muted)] text-sm">Miembro no encontrado</p>
        <button onClick={() => router.back()} className="text-xs text-orange-500 hover:underline">Volver</button>
      </div>
    );
  }

  const activeMembership = memberships.find((m: any) => m.status === "active");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="mt-0.5 flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-base)] text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-[var(--text-base)] font-display truncate">
              {member.full_name}
            </h2>
            <span
              className={
                member.status === "active"
                  ? "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800/60"
                  : "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-800/60"
              }
            >
              {member.status === "active" ? "Activo" : "Inactivo"}
            </span>
            {activeMembership && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--bg-muted)] text-[var(--text-muted)] border border-[var(--border-base)]">
                <Tag className="h-3 w-3" />
                {activeMembership.plan_name}
              </span>
            )}
          </div>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">{member.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-[var(--border-base)]">
        {TAB_CONFIG.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-orange-500 text-orange-500"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-base)]"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={tab}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.2 }}
      >
        <GlassCard className="p-5">
          {/* PERFIL */}
          {tab === "info" && (
            <div className="space-y-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {([
                  { label: "Correo", value: member.email, icon: <Mail className="h-3.5 w-3.5" /> },
                  { label: "Teléfono", value: member.phone, icon: <Phone className="h-3.5 w-3.5" /> },
                  { label: "Documento", value: [member.id_type, member.id_number].filter(Boolean).join(" "), icon: <IdCard className="h-3.5 w-3.5" /> },
                  { label: "Fecha nacimiento", value: member.birth_date ? format(new Date(member.birth_date + "T00:00"), "d MMMM yyyy", { locale: es }) : null, icon: <Calendar className="h-3.5 w-3.5" /> },
                  { label: "Ciudad", value: member.city, icon: null },
                  { label: "Dirección", value: member.address, icon: null },
                  { label: "Contacto emergencia", value: member.emergency_contact_name, icon: null },
                  { label: "Tel. emergencia", value: member.emergency_contact_phone, icon: null },
                  { label: "Grupo sanguíneo", value: member.blood_type, icon: null },
                  { label: "Objetivo", value: member.training_goal, icon: null },
                  { label: "Miembro desde", value: format(new Date(member.created_at), "d MMM yyyy", { locale: es }), icon: null },
                ] as { label: string; value: string | null | undefined; icon: React.ReactNode }[])
                  .filter(({ value }) => value)
                  .map(({ label, value, icon }) => (
                    <div key={label} className="flex items-start gap-2">
                      {icon && <span className="mt-0.5 text-[var(--text-muted)]">{icon}</span>}
                      <div className={icon ? "" : "ml-5"}>
                        <dt className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider mb-0.5">{label}</dt>
                        <dd className="text-[var(--text-base)] text-sm">{value}</dd>
                      </div>
                    </div>
                  ))}
              </dl>
              {member.notes && (
                <div className="pt-3 border-t border-[var(--border-base)]">
                  <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider mb-1">Notas</p>
                  <p className="text-[var(--text-base)] text-sm">{member.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* MEMBRESÍAS */}
          {tab === "memberships" && (
            <div className="space-y-4">
              {/* Historial */}
              {memberships.length === 0 ? (
                <p className="text-[var(--text-muted)] text-sm py-4 text-center">Sin membresías registradas</p>
              ) : (
                <div className="space-y-2">
                  {memberships.map((m: any) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)]"
                    >
                      <div>
                        <p className="text-[var(--text-base)] text-sm font-medium">{m.plan_name}</p>
                        <p className="text-[var(--text-muted)] text-[11px] mt-0.5">
                          {m.start_date} → {m.end_date}
                        </p>
                      </div>
                      <MembershipStatusPill status={m.status} />
                    </div>
                  ))}
                </div>
              )}

              {/* Asignar nueva */}
              <div className="pt-4 border-t border-[var(--border-base)]">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider mb-3 font-medium">
                  Asignar membresía
                </p>
                <form onSubmit={handleAssign} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[var(--text-muted)] text-xs mb-1 block">Plan</label>
                      <select
                        value={selectedPlan}
                        onChange={(e) => setSelectedPlan(e.target.value)}
                        className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                        required
                      >
                        <option value="">Seleccionar plan...</option>
                        {plans.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatCOP(p.price)} / {p.duration_days}d
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[var(--text-muted)] text-xs mb-1 block">Fecha inicio</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={assigning || !selectedPlan}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm h-9 px-5 disabled:opacity-50"
                  >
                    {assigning ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Asignando...</> : "Asignar membresía"}
                  </Button>
                </form>
              </div>
            </div>
          )}

          {/* PAGOS */}
          {tab === "payments" && (
            <div className="space-y-2">
              {payments.length === 0 ? (
                <p className="text-[var(--text-muted)] text-sm py-4 text-center">Sin pagos registrados</p>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-base)]">
                    <p className="text-[var(--text-muted)] text-xs">
                      {payments.length} pago{payments.length !== 1 ? "s" : ""} registrado{payments.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                      Total: {formatCOP(payments.filter((p: any) => p.status === "paid").reduce((acc: number, p: any) => acc + Number(p.amount), 0))}
                    </p>
                  </div>
                  {payments.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--text-base)] font-medium truncate">{p.concept || "Pago"}</p>
                        <p className="text-[var(--text-muted)] text-[11px]">
                          {p.method ? p.method.charAt(0).toUpperCase() + p.method.slice(1) : ""} · {format(new Date(p.created_at), "d MMM yyyy", { locale: es })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[var(--text-base)] font-semibold tabular-nums">{formatCOP(Number(p.amount))}</p>
                        <span className={`text-[10px] font-medium ${p.status === "paid" ? "text-emerald-600 dark:text-emerald-400" : p.status === "pending" ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                          {p.status === "paid" ? "Pagado" : p.status === "pending" ? "Pendiente" : "Fallido"}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* CHECK-INS */}
          {tab === "checkins" && (
            <div className="space-y-2">
              {checkins.length === 0 ? (
                <p className="text-[var(--text-muted)] text-sm py-4 text-center">Sin check-ins registrados</p>
              ) : (
                <>
                  <p className="text-[var(--text-muted)] text-xs pb-2 border-b border-[var(--border-base)]">
                    Últimos {checkins.length} registros
                  </p>
                  {checkins.map((c: any) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)]"
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        c.type === "entry"
                          ? "bg-emerald-50 dark:bg-emerald-950/40"
                          : "bg-red-50 dark:bg-red-950/40"
                      }`}>
                        {c.type === "entry"
                          ? <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          : <Activity className="h-3.5 w-3.5 text-red-500" />
                        }
                      </div>
                      <div className="flex-1">
                        <p className="text-[var(--text-base)] text-sm font-medium">
                          {c.type === "entry" ? "Entrada" : "Salida"}
                        </p>
                        {c.notes && <p className="text-[var(--text-muted)] text-xs">{c.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-[var(--text-muted)] text-xs">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: es })}
                        </p>
                        <p className="text-[var(--text-muted)] text-[10px]">
                          {format(new Date(c.created_at), "d MMM, HH:mm", { locale: es })}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </GlassCard>
      </motion.div>
    </motion.div>
  );
}
