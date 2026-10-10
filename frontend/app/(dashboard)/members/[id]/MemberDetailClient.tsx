"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { apiClient, newIdempotencyKey, postOnce } from "@/lib/api";
import { formatCOP, formatTimeAgo, formatDate, formatDateTime, parseDateOnly, todayISO, daysUntil } from "@/lib/format";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/dashboard/hoy/parts";
import { ArrowLeftIcon as ArrowLeft, UserIcon as User, PhoneIcon as Phone, EnvelopeSimpleIcon as Mail, IdentificationCardIcon as IdCard, CalendarBlankIcon as Calendar, CreditCardIcon as CreditCard, ActivityIcon as Activity, TagIcon as Tag, XCircleIcon as BadgeX, SpinnerGapIcon as Loader2, PencilSimpleIcon as Pencil, SnowflakeIcon as Snowflake, PlayIcon as Play, HeartbeatIcon as HeartPulse, UserPlusIcon as UserPlus, TicketIcon as Ticket, BarbellIcon as Dumbbell, FingerprintIcon as Fingerprint, ChatTextIcon as MessageSquare, PaperPlaneTiltIcon as Send, UsersIcon as Users } from "@phosphor-icons/react";
import { MemberRoutineTab } from "@/components/routines/MemberRoutineTab";
import { MemberAccessTab } from "@/components/access/MemberAccessTab";
import { CourtesyDialog } from "@/components/members/CourtesyDialog";
import { P, useCan } from "@/lib/permissions";
import { ProfileCompletion } from "@/components/members/ProfileCompletion";
import { MemberAppAccess } from "@/components/members/MemberAppAccess";
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
import { parseApiError } from "@/lib/errors";

type Tab = "info" | "timeline" | "memberships" | "payments" | "checkins" | "routine" | "access";

const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "info",        label: "Perfil",       icon: <User className="h-3.5 w-3.5" /> },
  { key: "timeline",    label: "Actividad",    icon: <Activity className="h-3.5 w-3.5" /> },
  { key: "memberships", label: "Membresías",   icon: <Tag className="h-3.5 w-3.5" /> },
  { key: "payments",    label: "Pagos",         icon: <CreditCard className="h-3.5 w-3.5" /> },
  { key: "checkins",    label: "Check-ins",     icon: <Activity className="h-3.5 w-3.5" /> },
  { key: "routine",     label: "Rutina",        icon: <Dumbbell className="h-3.5 w-3.5" /> },
  { key: "access",      label: "Acceso",        icon: <Fingerprint className="h-3.5 w-3.5" /> },
];

// Un entrenador entra a la ficha de SUS socios, pero el dinero, la membresía
// y las credenciales de acceso no son suyos: la matriz de permisos ya los
// bloquea y la pantalla no debe ofrecerle puertas cerradas.
const TRAINER_TABS: Tab[] = ["info", "timeline", "checkins", "routine"];

const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", wompi: "Wompi" };

interface TimelineEvent {
  type: "checkin" | "payment" | "membership" | "booking";
  at: string;
  [key: string]: any;
}

/** Estado de la membresía con el mismo badge del resto de la app. */
function MembershipStatusPill({ status }: { status: string }) {
  return <StatusBadge status={status} />;
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
  const [startDate, setStartDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const esEntrenador = session?.role === "trainer";
  const { can } = useCan();
  const [trainers, setTrainers] = useState<{ id: string; full_name: string }[]>([]);
  const [trainerId, setTrainerId] = useState("");
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgSending, setMsgSending] = useState(false);
  // La clave se fija al montar y `postOnce` la rota tras un envío bueno: un
  // doble clic o un reintento por timeout no manda el mensaje dos veces.
  const msgKey = useRef(newIdempotencyKey());
  const [showDiscount, setShowDiscount] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [freezeFor, setFreezeFor] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  // Cancelar pide un segundo clic en línea: window.confirm no sigue el tema y en móvil tapa la ficha.
  const [cancelFor, setCancelFor] = useState<string | null>(null);
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
      toast.error(parseApiError(err, "No se pudo generar el link"));
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
      toast.error(parseApiError(err, "No se pudo completar la acción"));
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    // Cada fuente cae en su propio vacío: un 403 en una pestaña que este rol no
    // puede ver no puede dejar la ficha entera en "Miembro no encontrado".
    const traer = async <T,>(url: string, vacio: T): Promise<T> => {
      try {
        return (await client.get<T>(url)).data;
      } catch {
        return vacio;
      }
    };
    Promise.all([
      client.get(`/api/v1/members/${memberId}`).then((r) => r.data).catch(() => null),
      traer<any[]>(`/api/v1/members/${memberId}/payments`, []),
      traer<any[]>(`/api/v1/members/${memberId}/checkins`, []),
      traer<any[]>(`/api/v1/members/${memberId}/memberships`, []),
      traer<any[]>("/api/v1/member-plans", []),
    ]).then(([m, p, c, ms, pl]) => {
      setMember(m);
      setPayments(p);
      setCheckins(c);
      setMemberships(ms);
      setPlans(pl);
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
          ? `Membresía programada desde el ${formatDate(realStart, "d 'de' MMMM yyyy")} (al terminar la vigente)`
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
      toast.error(parseApiError(err, "Error asignando membresía"));
    } finally {
      setAssigning(false);
    }
  };

  useEffect(() => {
    if (!editOpen || !session?.accessToken) return;
    // El select es CONTROLADO a propósito: las opciones llegan después de montar
    // el diálogo, y con `defaultValue` el entrenador ya guardado se perdía.
    setTrainerId(member?.trainer_id ?? "");
    apiClient(session.accessToken as string)
      .get<{ id: string; full_name: string }[]>("/api/v1/instructors")
      .then((r) => setTrainers(r.data))
      .catch(() => setTrainers([]));
  }, [editOpen, session?.accessToken, member?.trainer_id]);

  const handleEditSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, string | null> = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string" && v.trim() !== "") payload[k] = v.trim();
    }
    // Los vacíos se descartan arriba, así que quitar el entrenador nunca
    // llegaría al backend: este campo necesita viajar como null explícito.
    if (!trainerId) payload.trainer_id = null;
    setEditSaving(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.put(`/api/v1/members/${memberId}`, payload);
      setMember(res.data);
      setEditOpen(false);
      toast.success("Datos actualizados correctamente");
    } catch (err: any) {
      toast.error(parseApiError(err, "Error guardando cambios"));
    } finally {
      setEditSaving(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const body = String(fd.get("body") ?? "").trim();
    if (title.length < 3 || body.length < 3) {
      toast.error("Escribe un asunto y un mensaje");
      return;
    }
    setMsgSending(true);
    try {
      const client = apiClient(session.accessToken as string);
      await postOnce(client, "/api/v1/messages/send", {
        member_id: memberId, title, body,
      }, msgKey);
      setMsgOpen(false);
      toast.success("Mensaje enviado");
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo enviar el mensaje"));
    } finally {
      setMsgSending(false);
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
        <button onClick={() => router.back()} className="text-xs text-[var(--color-primary-ink)] hover:underline">Volver</button>
      </div>
    );
  }

  const activeMembership = memberships.find((m: any) =>
    ["active", "in_grace", "frozen"].includes(m.effective_status ?? m.status)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 md:flex-nowrap">
        <button
          onClick={() => router.back()}
          className="mt-0.5 flex w-full items-center md:w-auto gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-base)] text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        {member.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photo_url}
            alt={member.full_name}
            className="size-12 shrink-0 rounded-[16px] object-cover md:size-16 md:rounded-[21px]"
          />
        ) : (
          <>
            <span className="md:hidden"><Avatar name={member.full_name} size={48} /></span>
            <span className="hidden md:block"><Avatar name={member.full_name} size={64} /></span>
          </>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="truncate font-display text-[28px] font-bold leading-tight text-ink md:text-[34px]">
              {member.full_name}
            </h1>
            {member.parq_answers && Object.values(member.parq_answers).some(Boolean) && (
              <span
                className="inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--signal-warn-bg)] px-2 text-xs font-medium text-[var(--signal-warn)]"
                title="Respondió sí a una o más preguntas del PAR-Q: se recomienda aval médico antes de entrenar"
              >
                <HeartPulse className="h-3 w-3" /> Requiere aval médico
              </span>
            )}
            {!esEntrenador && (
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger
                render={
                  <button
                    className="flex h-8 items-center gap-1.5 px-2.5 rounded-[var(--radius-md)] border border-line bg-panel text-sm text-ink hover:bg-muted transition-colors"
                    title="Editar miembro"
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </button>
                }
              />
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    Editar miembro
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleEditSave} className="space-y-3 mt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-[var(--text-muted)] text-xs">Nombre completo</Label>
                      <Input name="full_name" defaultValue={member.full_name} required />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Correo</Label>
                      <Input name="email" type="email" defaultValue={member.email ?? ""} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Teléfono</Label>
                      <Input name="phone" defaultValue={member.phone ?? ""} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Ciudad</Label>
                      <Input name="city" defaultValue={member.city ?? ""} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Estado</Label>
                      <select name="status" defaultValue={member.status} className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink">
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-[var(--text-muted)] text-xs">Entrenador</Label>
                      <select
                        name="trainer_id"
                        value={trainerId}
                        onChange={(e) => setTrainerId(e.target.value)}
                        className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink"
                      >
                        <option value="">Sin entrenador asignado</option>
                        {trainers.map((t) => (
                          <option key={t.id} value={t.id}>{t.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Contacto emergencia</Label>
                      <Input name="emergency_contact_name" defaultValue={member.emergency_contact_name ?? ""} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[var(--text-muted)] text-xs">Tel. emergencia</Label>
                      <Input name="emergency_contact_phone" defaultValue={member.emergency_contact_phone ?? ""} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-[var(--text-muted)] text-xs">Notas</Label>
                      <textarea
                        name="notes"
                        defaultValue={member.notes ?? ""}
                        rows={2}
                        className="w-full rounded-[var(--radius-md)] border border-line bg-field px-3 py-2 text-sm text-ink resize-none outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} className="text-[var(--text-muted)]">
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={editSaving}>
                      {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            )}
            {!esEntrenador && (
            <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
              <DialogTrigger
                render={
                  <button
                    className="flex h-8 items-center gap-1.5 px-2.5 rounded-[var(--radius-md)] border border-line bg-panel text-sm text-ink hover:bg-muted transition-colors"
                    title="Enviar un mensaje a este socio"
                  >
                    <MessageSquare className="h-3 w-3" />
                    Mensaje
                  </button>
                }
              />
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    Mensaje para {member.full_name}
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-[var(--text-muted)] -mt-1">
                  Queda como aviso dentro de la app para el socio. Puedes usar{" "}
                  <code className="font-mono">{"{nombre}"}</code> y{" "}
                  <code className="font-mono">{"{gym}"}</code>.
                </p>
                <form onSubmit={handleSendMessage} className="space-y-3 mt-2">
                  <div className="space-y-1">
                    <Label className="text-[var(--text-muted)] text-xs">Asunto</Label>
                    <Input
                      name="title"
                      maxLength={120}
                      required
                      placeholder="Recordatorio"
                     
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[var(--text-muted)] text-xs">Mensaje</Label>
                    <textarea
                      name="body"
                      rows={4}
                      maxLength={2000}
                      required
                      placeholder="Hola {nombre}, te dejamos la rutina nueva en recepción."
                      className="w-full rounded-[var(--radius-md)] border border-line bg-field px-3 py-2 text-sm text-ink resize-none outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="ghost" onClick={() => setMsgOpen(false)} className="text-[var(--text-muted)]">
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={msgSending}>
                      {msgSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5" /> Enviar</>}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            )}
            <span
              className={
                member.status === "active"
                  ? "inline-flex h-6 items-center rounded-[var(--radius-sm)] bg-[var(--signal-ok-bg)] px-2 text-xs font-medium text-[var(--signal-ok)]"
                  : "inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] bg-muted px-2 text-xs font-medium text-ink-muted"
              }
            >
              {member.status === "active" ? "Activo" : "Inactivo"}
            </span>
            {member.member_type === "visitor" && (
              <span className="inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] bg-muted px-2 text-xs font-medium text-ink-muted">
                <Ticket className="h-3 w-3" /> Visitante · pase del día
              </span>
            )}
            {member.member_type === "staff" && (
              <span className="inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] bg-muted px-2 text-xs font-medium text-ink-muted">
                <Users className="h-3 w-3" /> Equipo · acceso de cortesía
              </span>
            )}
            {activeMembership && (
              <span className="inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] bg-muted px-2 text-xs font-medium text-ink-muted">
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
        <div className="flex w-full items-center gap-2 shrink-0 md:w-auto">
          {member.phone && (
            <a
              href={`https://wa.me/${member.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp"
              aria-label={"Escribir a " + member.full_name + " por WhatsApp"}
              className="h-9 w-9 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--signal-ok)] hover:border-[var(--signal-ok-line)] transition-colors"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          {esEntrenador ? null : member.member_type === "visitor" ? (
            <button
              onClick={() => router.push(`/members?convert=${memberId}`)}
              className="flex items-center gap-1.5 h-10 px-4 rounded-[var(--radius-md)] bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Convertir en socio
            </button>
          ) : (
            <button
              onClick={() => router.push(`/payments?member=${memberId}`)}
              className="flex items-center gap-1.5 h-10 px-4 rounded-[var(--radius-md)] bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              <CreditCard className="h-4 w-4" />
              Cobrar
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Secciones de la ficha" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        {TAB_CONFIG.filter((t) => !esEntrenador || TRAINER_TABS.includes(t.key)).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            aria-selected={tab === key}
            className={`flex h-11 shrink-0 items-center whitespace-nowrap px-3 text-sm border-b-[3px] -mb-px transition-colors ${
              tab === key
                ? "border-primary font-semibold text-ink"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-base)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={tab}
        variants={cardVariants}
        initial={false}
        animate="visible"
        transition={{ duration: 0.2 }}
      >
        <GlassCard className="p-4 sm:p-5">
          {/* PERFIL */}
          {tab === "info" && (
            <div className="space-y-5">
              {can(P.MEMBERS_WRITE) && (
                <ProfileCompletion memberId={memberId} hasEmail={Boolean(member.email)} />
              )}
              {can(P.MEMBERS_WRITE) && <MemberAppAccess memberId={memberId} hasDocument={Boolean(member.id_number)} hasEmail={Boolean(member.email)} />}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {([
                  { label: "Correo", value: member.email, icon: <Mail className="h-3.5 w-3.5" /> },
                  { label: "Teléfono", value: member.phone, icon: <Phone className="h-3.5 w-3.5" /> },
                  { label: "Documento", value: [member.id_type, member.id_number].filter(Boolean).join(" "), icon: <IdCard className="h-3.5 w-3.5" /> },
                  { label: "Fecha nacimiento", value: member.birth_date ? formatDate(member.birth_date, "d MMMM yyyy") : null, icon: <Calendar className="h-3.5 w-3.5" /> },
                  { label: "Ciudad", value: member.city, icon: null },
                  { label: "Dirección", value: member.address, icon: null },
                  { label: "Contacto emergencia", value: member.emergency_contact_name, icon: null },
                  { label: "Tel. emergencia", value: member.emergency_contact_phone, icon: null },
                  { label: "Grupo sanguíneo", value: member.blood_type, icon: null },
                  { label: "Miembro desde", value: formatDate(member.created_at), icon: null },
                ] as { label: string; value: string | null | undefined; icon: React.ReactNode }[])
                  .filter(({ value }) => value)
                  .map(({ label, value, icon }) => (
                    <div key={label} className="flex items-start gap-2">
                      {icon && <span className="mt-0.5 text-[var(--text-muted)]">{icon}</span>}
                      <div className={icon ? "" : "ml-5"}>
                        <dt className="text-ink-muted text-xs mb-0.5">{label}</dt>
                        <dd className="text-[var(--text-base)] text-sm">{value}</dd>
                      </div>
                    </div>
                  ))}
              </dl>
              {member.notes && (
                <div className="pt-3 border-t border-[var(--border-base)]">
                  <p className="text-ink-muted text-xs mb-1">Notas</p>
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
                        className="p-3 rounded-[var(--radius-md)] space-y-2 bg-muted/60"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[var(--text-base)] text-sm font-medium">{m.plan_name}</p>
                            <p className="text-[var(--text-muted)] text-xs font-mono tabular-nums mt-0.5">
                              {m.start_date} → {m.end_date}
                              {m.source === "import" && <span className="ml-2 font-sans">· importada</span>}
                              {m.source === "courtesy" && <span className="ml-2 font-sans">· cortesía</span>}
                              {m.discount_amount && Number(m.discount_amount) > 0 && (
                                <span className="ml-2 text-[var(--signal-ok)]">
                                  −{formatCOP(Number(m.discount_amount))}{m.discount_reason ? ` (${m.discount_reason})` : ""}
                                </span>
                              )}
                            </p>
                            {m.entries_total != null && (
                              <p className="mt-1 text-xs text-[var(--text-muted)]">
                                Ticketera:{" "}
                                <span className="num font-semibold text-[var(--text-base)]">
                                  {Math.max(m.entries_total - (m.entries_used ?? 0), 0)}
                                </span>{" "}
                                de {m.entries_total} entradas disponibles
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <MembershipStatusPill status={st} />
                            {canFreeze && (
                              <button
                                type="button"
                                title="Congelar membresía"
                                disabled={actionBusy}
                                onClick={() => { setFreezeFor(freezeFor === m.id ? null : m.id); setFreezeReason(""); }}
                                className="flex h-8 items-center gap-1 px-2.5 rounded-[var(--radius-md)] border border-line text-xs text-ink hover:bg-muted transition-colors"
                              >
                                <Snowflake className="h-3 w-3" /> Congelar
                              </button>
                            )}
                            {canUnfreeze && (
                              <button
                                type="button"
                                title="Reactivar membresía (corre la fecha de fin)"
                                disabled={actionBusy}
                                onClick={() => membershipAction(m.id, "unfreeze", {}, "Membresía reactivada: fecha de fin extendida")}
                                className="flex h-8 items-center gap-1 px-2.5 rounded-[var(--radius-md)] border border-line text-xs text-ink hover:bg-muted transition-colors"
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
                                  if (cancelFor !== m.id) { setCancelFor(m.id); return; }
                                  setCancelFor(null);
                                  membershipAction(m.id, "cancel", undefined, "Membresía cancelada");
                                }}
                                className="flex h-8 items-center gap-1 px-2.5 rounded-[var(--radius-md)] border border-line text-xs text-[var(--signal-danger)] hover:bg-[var(--signal-danger-bg)] transition-colors"
                              >
                                <BadgeX className="h-3 w-3" /> {cancelFor === m.id ? "¿Cancelar? No se deshace" : "Cancelar"}
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
                              className="text-sm"
                            />
                            <Button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => membershipAction(m.id, "freeze", { reason: freezeReason.trim() || null }, "Membresía congelada")}
                              className="shrink-0"
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
                const daysLeft = daysUntil(activeMembership.end_date);
                if (daysLeft > 7) return null;
                const activePlanObj = plans.find((p: any) => p.name === activeMembership.plan_name);
                const renewDate = activeMembership.end_date; // start day after current end
                return (
                  <div className="rounded-[var(--radius-md)] bg-[var(--signal-warn-bg)] p-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--signal-warn)]">
                        {daysLeft <= 0 ? "Membresía vencida" : `Vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`}
                      </p>
                      <p className="text-xs text-ink-muted">
                        Plan actual: {activeMembership.plan_name}
                      </p>
                    </div>
                    {activePlanObj && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => sendRenewalLink(activePlanObj.id)}
                          disabled={renewalBusy}
                          className="h-8 text-sm font-medium text-ink border border-line bg-panel rounded-[var(--radius-md)] px-3 hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {renewalBusy ? "…" : "Cobrar en línea"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlan(activePlanObj.id);
                            setStartDate(renewDate);
                          }}
                          className="h-8 text-sm font-medium text-primary-contrast bg-primary rounded-[var(--radius-md)] px-3 hover:bg-primary-hover transition-colors"
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
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-ink text-sm font-medium">Asignar membresía</p>
                  {can(P.MEMBERSHIPS_COURTESY) && member && (
                    <CourtesyDialog
                      memberId={memberId}
                      memberName={member.full_name}
                      plans={plans.map((p: any) => ({ id: p.id, name: p.name }))}
                      onDone={refreshMemberships}
                    />
                  )}
                </div>
                <form onSubmit={handleAssign} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[var(--text-muted)] text-xs mb-1 block">Plan</label>
                      <select
                        value={selectedPlan}
                        onChange={(e) => setSelectedPlan(e.target.value)}
                        className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        required
                      >
                        <option value="">Seleccionar plan…</option>
                        {plans.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name}, {formatCOP(p.price)} / {p.duration_days}d
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
                        className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[var(--text-muted)] text-xs mb-1 block">
                        Método de pago <span className="opacity-60">(opcional: genera pago pendiente)</span>
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                        className="text-xs text-[var(--color-primary-ink)] hover:underline"
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
                              className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                              className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-40"
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
                              className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-40"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={assigning || !selectedPlan}
                    className="px-5"
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
                    <p className="text-ink text-sm font-semibold font-mono tabular-nums">
                      Total: {formatCOP(payments.filter((p: any) => p.status === "paid").reduce((acc: number, p: any) => acc + Number(p.amount), 0))}
                    </p>
                  </div>
                  {payments.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] text-sm bg-muted/60"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--text-base)] font-medium truncate">{p.concept || "Pago"}</p>
                        <p className="text-[var(--text-muted)] text-[11px]">
                          {METHOD_LABEL[p.method] ?? p.method ?? "Sin método"} · {formatDate(p.created_at)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-ink font-mono font-semibold tabular-nums">{formatCOP(Number(p.amount))}</p>
                        <StatusBadge status={p.status} className="mt-1" />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "routine" && <MemberRoutineTab memberId={memberId} />}
          {tab === "access" && <MemberAccessTab memberId={memberId} idNumber={member.id_number} hasPhoto={Boolean(member.photo_url && member.consent_image_at)} />}


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
                        ? "bg-[var(--signal-ok)]"
                        : ev.type === "membership"
                        ? "bg-primary"
                        : ev.type === "booking"
                        ? "bg-[var(--signal-info)]"
                        : ev.decision === "denied"
                        ? "bg-[var(--signal-danger)]"
                        : "bg-ink-muted";
                    let title = "";
                    let detail = "";
                    if (ev.type === "checkin") {
                      title =
                        ev.decision === "denied"
                          ? "Acceso denegado"
                          : ev.decision === "override"
                          ? "Entrada autorizada por recepción"
                          : "Entró al gym";
                      detail = ev.source === "kiosk" ? "Kiosko" : ev.source === "qr" || ev.source === "app_qr" ? "QR (antes)" : "Recepción";
                    } else if (ev.type === "payment") {
                      title = `${ev.concept}, ${formatCOP(ev.amount)}`;
                      detail = ev.status === "paid" ? "Pagado" : ev.status === "pending" ? "Pendiente" : ev.status;
                    } else if (ev.type === "membership") {
                      title = `Membresía ${ev.plan_name}`;
                      detail = `${formatDate(ev.start_date, "d MMM")} → ${formatDate(ev.end_date)} · ${formatCOP(ev.price)}`;
                    } else if (ev.type === "booking") {
                      title = `Reserva: ${ev.class_name}`;
                      detail = `${formatDate(ev.session_date, "d MMM")}${ev.start_time ? ` ${ev.start_time.slice(0, 5)}` : ""} · ${
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
                      className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-muted/60"
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        c.type === "entry"
                          ? "bg-[var(--signal-ok-bg)]"
                          : "bg-muted"
                      }`}>
                        {c.type === "entry"
                          ? <Activity className="h-3.5 w-3.5 text-[var(--signal-ok)]" />
                          : <Activity className="h-3.5 w-3.5 text-ink-muted" />
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
                          {formatTimeAgo(c.created_at)}
                        </p>
                        <p className="text-[var(--text-muted)] text-xs font-mono tabular-nums">
                          {formatDateTime(c.created_at, "d MMM, HH:mm")}
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
    </div>
  );
}
