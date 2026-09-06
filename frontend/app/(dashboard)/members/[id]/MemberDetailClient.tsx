"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { apiClient } from "@/lib/api";
import { formatCOP, formatTimeAgo } from "@/lib/format";
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
  BadgeX,
  Loader2,
  QrCode,
  Pencil,
  Snowflake,
  Play,
  CalendarClock,
  HeartPulse,
  UserPlus,
  Ticket,
} from "lucide-react";
import { QRCodeDisplay } from "@/components/common/QRCodeDisplay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

type Tab = "info" | "timeline" | "memberships" | "payments" | "checkins" | "qr";

const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "info",        label: "Perfil",       icon: <User className="h-3.5 w-3.5" /> },
  { key: "timeline",    label: "Actividad",    icon: <Activity className="h-3.5 w-3.5" /> },
  { key: "memberships", label: "Membresías",   icon: <Tag className="h-3.5 w-3.5" /> },
  { key: "payments",    label: "Pagos",         icon: <CreditCard className="h-3.5 w-3.5" /> },
  { key: "checkins",    label: "Check-ins",     icon: <Activity className="h-3.5 w-3.5" /> },
  { key: "qr",          label: "Carné QR",      icon: <QrCode className="h-3.5 w-3.5" /> },
];

interface TimelineEvent {
  type: "checkin" | "payment" | "membership" | "booking";
  at: string;
  [key: string]: any;
}

const STATUS_PILL: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  active: {
    label: "Activa",
    cls: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-800/60",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  scheduled: {
    label: "Programada",
    cls: "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 ring-violet-200 dark:ring-violet-800/60",
    icon: <CalendarClock className="h-3 w-3" />,
  },
  frozen: {
    label: "Congelada",
    cls: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 ring-sky-200 dark:ring-sky-800/60",
    icon: <Snowflake className="h-3 w-3" />,
  },
  in_grace: {
    label: "En gracia",
    cls: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 ring-amber-200 dark:ring-amber-800/60",
    icon: <Clock className="h-3 w-3" />,
  },
  expired: {
    label: "Vencida",
    cls: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 ring-red-200 dark:ring-red-800/60",
    icon: <Clock className="h-3 w-3" />,
  },
  cancelled: {
    label: "Cancelada",
    cls: "bg-[var(--bg-muted)] text-[var(--text-muted)] ring-[var(--border-base)]",
    icon: <BadgeX className="h-3 w-3" />,
  },
};

function MembershipStatusPill({ status }: { status: string }) {
  const pill = STATUS_PILL[status] ?? STATUS_PILL.expired;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${pill.cls}`}>
      {pill.icon} {pill.label}
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
  const [paymentMethod, setPaymentMethod] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [freezeFor, setFreezeFor] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [renewalBusy, setRenewalBusy] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[] | null>(null);

  useEffect(() => {
    if (tab !== "timeline" || timeline !== null || !session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client.get(`/api/v1/members/${memberId}/timeline`)
      .then((res) => setTimeline(res.data))
      .catch(() => setTimeline([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, session?.accessToken]);

  const sendRenewalLink = async (planId: string) => {
    if (!session?.accessToken) return;
    setRenewalBusy(true);
    try {
      const client = apiClient(session.accessToken as string);
      const { data } = await client.post(`/api/v1/members/${memberId}/renewal-link`, { plan_id: planId });
      if (!data.checkout_url) {
        toast.error("Wompi no está configurado en Ajustes › Integraciones");
        return;
      }
      await navigator.clipboard.writeText(data.checkout_url).catch(() => {});
      const phone = (member?.phone ?? "").replace(/\D/g, "");
      if (phone) {
        const text = encodeURIComponent(`Hola ${member.full_name}, renueva tu membresía aquí: ${data.checkout_url}`);
        window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
      }
      toast.success("Link de pago creado y copiado");
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "No se pudo generar el link");
    } finally {
      setRenewalBusy(false);
    }
  };

  const refreshMemberships = async () => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    const ms = await client.get(`/api/v1/members/${memberId}/memberships`);
    setMemberships(ms.data);
  };

  const membershipAction = async (
    membershipId: string,
    action: "freeze" | "unfreeze" | "cancel",
    body: Record<string, unknown> = {},
    okMessage = "Listo"
  ) => {
    if (!session?.accessToken) return;
    setActionBusy(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.post(`/api/v1/memberships/${membershipId}/${action}`, body);
      toast.success(okMessage);
      setFreezeFor(null);
      setFreezeReason("");
      await refreshMemberships();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No se pudo completar la acción");
    } finally {
      setActionBusy(false);
    }
  };

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
      const res = await client.post("/api/v1/member-plans/assign", {
        member_id: memberId,
        plan_id: selectedPlan,
        start_date: startDate,
        payment_method: paymentMethod || null,
        promo_code: promoCode.trim() || null,
        discount_amount: discountAmount ? Number(discountAmount) : null,
        discount_reason: discountReason.trim() || null,
      });
      const realStart: string | undefined = res.data?.start_date;
      const chained = realStart && realStart !== startDate;
      toast.success(
        chained
          ? `Membresía programada desde el ${format(new Date(realStart + "T00:00:00"), "d 'de' MMMM yyyy", { locale: es })} (al terminar la vigente)`
          : paymentMethod ? "Membresía asignada y pago generado" : "Membresía asignada correctamente"
      );
      setSelectedPlan("");
      setPaymentMethod("");
      setPromoCode("");
      setDiscountAmount("");
      setDiscountReason("");
      setShowDiscount(false);
      const ms = await client.get(`/api/v1/members/${memberId}/memberships`);
      setMemberships(ms.data);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error asignando membresía");
    } finally {
      setAssigning(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string" && v.trim() !== "") payload[k] = v.trim();
    }
    setEditSaving(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.put(`/api/v1/members/${memberId}`, payload);
      setMember(res.data);
      setEditOpen(false);
      toast.success("Datos actualizados correctamente");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error guardando cambios");
    } finally {
      setEditSaving(false);
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
        <button onClick={() => router.back()} className="text-xs text-[var(--color-primary)] hover:underline">Volver</button>
      </div>
    );
  }

  const activeMembership = memberships.find((m: any) =>
    ["active", "in_grace", "frozen"].includes(m.effective_status ?? m.status)
  );

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
        {member.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photo_url}
            alt={member.full_name}
            className="h-14 w-14 rounded-full object-cover shrink-0 ring-2 ring-[var(--border-base)]"
          />
        ) : (
          <span className="h-14 w-14 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] text-lg font-bold flex items-center justify-center shrink-0">
            {(member.full_name?.[0] ?? "?").toUpperCase()}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-[var(--text-base)] font-display truncate">
              {member.full_name}
            </h2>
            {member.parq_answers && Object.values(member.parq_answers).some(Boolean) && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 ring-amber-200 dark:ring-amber-800/60"
                title="Respondió sí a una o más preguntas del PAR-Q: se recomienda aval médico antes de entrenar"
              >
                <HeartPulse className="h-3 w-3" /> Requiere aval médico
              </span>
            )}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger
                render={
                  <button
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border-base)] text-xs text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-base)] transition-colors"
                    title="Editar miembro"
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </button>
                }
              />
              <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-base)] max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-[var(--text-base)] font-display">
                    Editar miembro
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleEditSave} className="space-y-3 mt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-[var(--text-muted)] text-xs">Nombre completo</Label>
                      <Input name="full_name" defaultValue={member.full_name} required className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Correo</Label>
                      <Input name="email" type="email" defaultValue={member.email ?? ""} className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Teléfono</Label>
                      <Input name="phone" defaultValue={member.phone ?? ""} className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Ciudad</Label>
                      <Input name="city" defaultValue={member.city ?? ""} className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Estado</Label>
                      <select name="status" defaultValue={member.status} className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)]">
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Contacto emergencia</Label>
                      <Input name="emergency_contact_name" defaultValue={member.emergency_contact_name ?? ""} className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Tel. emergencia</Label>
                      <Input name="emergency_contact_phone" defaultValue={member.emergency_contact_phone ?? ""} className="bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]" />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-[var(--text-muted)] text-xs">Notas</Label>
                      <textarea
                        name="notes"
                        defaultValue={member.notes ?? ""}
                        rows={2}
                        className="w-full rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-base)] resize-none outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} className="text-[var(--text-muted)]">
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={editSaving} className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]">
                      {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <span
              className={
                member.status === "active"
                  ? "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800/60"
                  : "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-800/60"
              }
            >
              {member.status === "active" ? "Activo" : "Inactivo"}
            </span>
            {member.member_type === "visitor" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 ring-1 ring-violet-200 dark:ring-violet-800/60">
                <Ticket className="h-3 w-3" /> Visitante · pase del día
              </span>
            )}
            {activeMembership && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--bg-muted)] text-[var(--text-muted)] border border-[var(--border-base)]">
                <Tag className="h-3 w-3" />
                {activeMembership.plan_name}
              </span>
            )}
          </div>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">
            {member.email ?? "Sin correo"}
            {member.id_number && (
              <span className="ml-2 font-mono text-xs">
                {member.id_type ?? "CC"} {member.id_number}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {member.phone && (
            <a
              href={`https://wa.me/${member.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp"
              className="h-9 w-9 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-600 hover:border-emerald-300 transition-colors"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          {member.member_type === "visitor" ? (
            <button
              onClick={() => router.push(`/members?convert=${memberId}`)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-contrast)] text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Convertir en socio
            </button>
          ) : (
            <button
              onClick={() => router.push(`/payments?member=${memberId}`)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-contrast)] text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              <CreditCard className="h-4 w-4" />
              Cobrar
            </button>
          )}
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
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
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
                  {memberships.map((m: any) => {
                    const st = m.effective_status ?? m.status;
                    const canFreeze = st === "active" || st === "in_grace";
                    const canUnfreeze = st === "frozen";
                    const canCancel = st === "active" || st === "frozen" || st === "in_grace" || st === "scheduled";
                    return (
                      <div
                        key={m.id}
                        className="p-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] space-y-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[var(--text-base)] text-sm font-medium">{m.plan_name}</p>
                            <p className="text-[var(--text-muted)] text-[11px] mt-0.5">
                              {m.start_date} → {m.end_date}
                              {m.discount_amount && Number(m.discount_amount) > 0 && (
                                <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                  −{formatCOP(Number(m.discount_amount))}{m.discount_reason ? ` (${m.discount_reason})` : ""}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <MembershipStatusPill status={st} />
                            {canFreeze && (
                              <button
                                type="button"
                                title="Congelar membresía"
                                disabled={actionBusy}
                                onClick={() => { setFreezeFor(freezeFor === m.id ? null : m.id); setFreezeReason(""); }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border-base)] text-[11px] text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors"
                              >
                                <Snowflake className="h-3 w-3" /> Congelar
                              </button>
                            )}
                            {canUnfreeze && (
                              <button
                                type="button"
                                title="Reactivar membresía (corre la fecha de fin)"
                                disabled={actionBusy}
                                onClick={() => membershipAction(m.id, "unfreeze", {}, "Membresía reactivada — fecha de fin extendida")}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border-base)] text-[11px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                              >
                                <Play className="h-3 w-3" /> Reactivar
                              </button>
                            )}
                            {canCancel && (
                              <button
                                type="button"
                                title="Cancelar membresía"
                                disabled={actionBusy}
                                onClick={() => {
                                  if (window.confirm(`¿Cancelar la membresía ${m.plan_name}? Esta acción no se puede deshacer.`)) {
                                    membershipAction(m.id, "cancel", undefined, "Membresía cancelada");
                                  }
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border-base)] text-[11px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              >
                                <BadgeX className="h-3 w-3" /> Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                        {freezeFor === m.id && (
                          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-base)]">
                            <Input
                              value={freezeReason}
                              onChange={(e) => setFreezeReason(e.target.value)}
                              placeholder="Motivo (vacaciones, lesión...)"
                              className="h-8 text-xs bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)]"
                            />
                            <Button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => membershipAction(m.id, "freeze", { reason: freezeReason.trim() || null }, "Membresía congelada")}
                              className="h-8 text-xs bg-sky-600 hover:bg-sky-700 text-white shrink-0"
                            >
                              {actionBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirmar"}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Renewal alert + quick pre-fill */}
              {(() => {
                if (!activeMembership?.end_date) return null;
                const daysLeft = Math.ceil(
                  (new Date(activeMembership.end_date).getTime() - Date.now()) / 86_400_000
                );
                if (daysLeft > 7) return null;
                const activePlanObj = plans.find((p: any) => p.name === activeMembership.plan_name);
                const renewDate = activeMembership.end_date; // start day after current end
                return (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        {daysLeft <= 0 ? "Membresía vencida" : `Vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`}
                      </p>
                      <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                        Plan actual: {activeMembership.plan_name}
                      </p>
                    </div>
                    {activePlanObj && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => sendRenewalLink(activePlanObj.id)}
                          disabled={renewalBusy}
                          className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 rounded-lg px-3 py-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                        >
                          {renewalBusy ? "…" : "Cobrar en línea"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlan(activePlanObj.id);
                            setStartDate(renewDate);
                          }}
                          className="text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 rounded-lg px-3 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                        >
                          Renovar →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

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
                        className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
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
                        className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[var(--text-muted)] text-xs mb-1 block">
                        Método de pago <span className="opacity-60">(opcional — genera pago pendiente)</span>
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
                      >
                        <option value="">No generar pago ahora</option>
                        <option value="cash">Efectivo</option>
                        <option value="transfer">Transferencia</option>
                        <option value="card">Tarjeta</option>
                        <option value="wompi">Wompi</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => setShowDiscount(!showDiscount)}
                        className="text-xs text-[var(--color-primary)] hover:underline"
                      >
                        {showDiscount ? "− Quitar descuento" : "+ Aplicar descuento o código promo"}
                      </button>
                      {showDiscount && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                          <div>
                            <label className="text-[var(--text-muted)] text-xs mb-1 block">Código promo</label>
                            <input
                              value={promoCode}
                              onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); if (e.target.value) { setDiscountAmount(""); setDiscountReason(""); } }}
                              placeholder="VERANO25"
                              className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
                            />
                          </div>
                          <div>
                            <label className="text-[var(--text-muted)] text-xs mb-1 block">Descuento manual (COP)</label>
                            <input
                              type="number"
                              min="0"
                              value={discountAmount}
                              onChange={(e) => { setDiscountAmount(e.target.value); if (e.target.value) setPromoCode(""); }}
                              disabled={!!promoCode}
                              placeholder="10000"
                              className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] disabled:opacity-40"
                            />
                          </div>
                          <div>
                            <label className="text-[var(--text-muted)] text-xs mb-1 block">Motivo del descuento</label>
                            <input
                              value={discountReason}
                              onChange={(e) => setDiscountReason(e.target.value)}
                              disabled={!!promoCode}
                              placeholder="Convenio empresa"
                              required={!!discountAmount}
                              className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-base)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] disabled:opacity-40"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={assigning || !selectedPlan}
                    className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-contrast)] font-semibold text-sm h-9 px-5 disabled:opacity-50"
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

          {/* QR CARNÉ */}
          {tab === "qr" && (
            <div className="flex flex-col items-center gap-4 py-4">
              {member.qr_code ? (
                <QRCodeDisplay qrCode={member.qr_code} memberName={member.full_name} />
              ) : (
                <div className="text-center py-8 space-y-2">
                  <QrCode className="h-10 w-10 text-[var(--text-muted)] mx-auto" />
                  <p className="text-[var(--text-muted)] text-sm">
                    Este miembro no tiene código QR asignado.
                  </p>
                  <p className="text-[var(--text-muted)] text-xs">
                    El QR se genera automáticamente para nuevos miembros.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ACTIVIDAD — timeline unificado */}
          {tab === "timeline" && (
            <div className="space-y-0">
              {timeline === null ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton h-12 rounded-lg" />
                  ))}
                </div>
              ) : timeline.length === 0 ? (
                <p className="text-[var(--text-muted)] text-sm py-4 text-center">Sin actividad registrada</p>
              ) : (
                <div className="relative pl-6">
                  <span className="absolute left-2 top-2 bottom-2 w-px bg-[var(--border-base)]" />
                  {timeline.map((ev, i) => {
                    const dot =
                      ev.type === "payment"
                        ? "bg-emerald-500"
                        : ev.type === "membership"
                        ? "bg-fuchsia-500"
                        : ev.type === "booking"
                        ? "bg-violet-500"
                        : ev.decision === "denied"
                        ? "bg-red-500"
                        : "bg-sky-500";
                    let title = "";
                    let detail = "";
                    if (ev.type === "checkin") {
                      title =
                        ev.decision === "denied"
                          ? "Acceso denegado"
                          : ev.decision === "override"
                          ? "Entrada autorizada por recepción"
                          : "Entró al gym";
                      detail = ev.source === "kiosk" ? "Kiosko" : ev.source === "qr" ? "QR" : "Recepción";
                    } else if (ev.type === "payment") {
                      title = `${ev.concept} — ${formatCOP(ev.amount)}`;
                      detail = ev.status === "paid" ? "Pagado" : ev.status === "pending" ? "Pendiente" : ev.status;
                    } else if (ev.type === "membership") {
                      title = `Membresía ${ev.plan_name}`;
                      detail = `${format(new Date(ev.start_date + "T12:00"), "d MMM", { locale: es })} → ${format(new Date(ev.end_date + "T12:00"), "d MMM yyyy", { locale: es })} · ${formatCOP(ev.price)}`;
                    } else if (ev.type === "booking") {
                      title = `Reserva: ${ev.class_name}`;
                      detail = `${format(new Date(ev.session_date + "T12:00"), "d MMM", { locale: es })}${ev.start_time ? ` ${ev.start_time.slice(0, 5)}` : ""} · ${
                        ev.status === "attended" ? "asistió" : ev.status === "no_show" ? "no vino" : ev.status === "cancelled" ? "cancelada" : ev.status === "waitlisted" ? "lista de espera" : "reservada"
                      }`;
                    }
                    return (
                      <div key={`${ev.type}-${ev.at}-${i}`} className="relative pb-4">
                        <span className={`absolute -left-[1.18rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-card)] ${dot}`} />
                        <p className="text-sm font-medium text-[var(--text-base)] leading-tight">{title}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {detail} · {formatTimeAgo(ev.at)}
                        </p>
                      </div>
                    );
                  })}
                </div>
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
