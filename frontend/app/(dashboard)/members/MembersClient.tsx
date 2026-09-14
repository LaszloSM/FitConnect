"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { GlassCard } from "@/components/common/GlassCard";
import { Avatar } from "@/components/dashboard/hoy/parts";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { MemberImportDialog } from "@/components/members/MemberImportDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { QRCodeDisplay } from "@/components/common/QRCodeDisplay";
import { PARQForm, PARQ_KEYS } from "@/components/common/PARQForm";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { daysUntil, formatCOP, formatDate, parseDateOnly, todayISO, toISODate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { DatePicker } from "@/components/ui/date-picker";
import { IdTypeSelect } from "@/components/ui/id-type-select";
import { BloodTypeSelect } from "@/components/ui/blood-type-select";
import { GenderSelect } from "@/components/ui/gender-select";
import { CityCombobox } from "@/components/ui/city-combobox";
import { CountrySelect } from "@/components/ui/country-select";
import { FileUpload } from "@/components/ui/file-upload";
import { CameraCapture } from "@/components/common/CameraCapture";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusIcon as Plus, MagnifyingGlassIcon as Search, PencilSimpleIcon as Pencil, TrashIcon as Trash2, WarningCircleIcon as AlertCircle, QrCodeIcon as QrCode, XIcon as X, TagIcon as Tag, ClockIcon as Clock, CheckCircleIcon as CheckCircle2, DownloadSimpleIcon as Download, CheckIcon as Check, UserIcon as User, HeartbeatIcon as HeartPulse, CreditCardIcon as CreditCard } from "@phosphor-icons/react";
import { MembershipStatusBadge } from "@/components/common/MembershipStatusBadge";
import type { TrainingGoal } from "@/lib/types";

const TRAINING_GOALS = [
  { value: "weight_loss", label: "Bajar de peso" },
  { value: "muscle_gain", label: "Ganar masa muscular" },
  { value: "endurance", label: "Resistencia" },
  { value: "flexibility", label: "Flexibilidad" },
  { value: "general_fitness", label: "Estado físico general" },
] as const satisfies readonly { value: TrainingGoal; label: string }[];

const memberSchema = z.object({
  full_name: z.string().min(2, "Nombre demasiado corto"),
  email: z.union([z.string().email("Email inválido"), z.literal("")]).optional(),
  phone: z.string().optional(),
  id_number: z.string().optional(),
  id_type: z.enum(["CC", "NIT", "CE", "PP", "TI"]).optional(),
  birth_date: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  notes: z.string().optional(),
  gender: z.enum(["M", "F", "other"]).optional(),
  training_goal: z.enum(["weight_loss", "muscle_gain", "endurance", "flexibility", "general_fitness"]).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  blood_type: z.string().optional(),
  photo_url: z.string().optional(),
  parq_answers: z.record(z.string(), z.boolean()).optional(),
  parq_completed_at: z.string().optional(),
});

interface Member {
  id: string;
  full_name: string;
  email: string | null;
  member_type?: "member" | "visitor" | "staff";
  phone: string | null;
  id_number: string | null;
  id_type: string | null;
  birth_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  gender: string | null;
  training_goal: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_type: string | null;
  photo_url: string | null;
  parq_answers: Record<string, boolean> | null;
  parq_completed_at: string | null;
  qr_code: string | null;
  // Populated by backend list endpoint
  membership_status: "active" | "expired" | "none" | null;
  membership_end_date: string | null;
  membership_plan_name: string | null;
}

const inputCls = "";
const selectCls =
  "w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink";

function calcAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const today = new Date();
  const birth = parseDateOnly(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

type FormState = {
  full_name: string;
  email: string;
  phone: string;
  id_number: string;
  id_type: string;
  birth_date: string;
  status: string;
  notes: string;
  gender: string;
  training_goal: string;
  address: string;
  city: string;
  country: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  blood_type: string;
  photo_url: string;
  parq_answers: Record<string, boolean>;
};

const WIZARD_STEPS = [
  { label: "Datos personales", icon: User },
  { label: "Salud", icon: HeartPulse },
  { label: "Membresía", icon: CreditCard },
];

const emptyForm: FormState = {
  full_name: "",
  email: "",
  phone: "",
  id_number: "",
  id_type: "",
  birth_date: "",
  status: "active",
  notes: "",
  gender: "",
  training_goal: "",
  address: "",
  city: "",
  country: "CO",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  blood_type: "",
  photo_url: "",
  parq_answers: {},
};

export default function MembersClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  // El personal y los visitantes del pase viven en la misma tabla que los socios:
  // sin filtro, un gimnasio con diez empleados los ve mezclados en su lista.
  const [typeFilter, setTypeFilter] = useState<"" | "member" | "visitor" | "staff">("");
  const [missingIdOnly, setMissingIdOnly] = useState(false);
  const [missingIdCount, setMissingIdCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [consentData, setConsentData] = useState(false);
  const [consentImage, setConsentImage] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [qrMember, setQrMember] = useState<Member | null>(null);
  // Visitante del pase del día que se está convirtiendo en socio (wizard precargado)
  const [converting, setConverting] = useState<Member | null>(null);
  const searchParams = useSearchParams();
  const convertHandled = useRef<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  // Membership tab state
  const [availablePlans, setAvailablePlans] = useState<{ id: string; name: string; price: number; duration_days: number }[]>([]);
  const [currentMembership, setCurrentMembership] = useState<{ plan_name: string; start_date: string; end_date: string; status: string } | null>(null);
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignPaymentMethod, setAssignPaymentMethod] = useState("");
  const [assigningMembership, setAssigningMembership] = useState(false);
  const [membershipTabActive, setMembershipTabActive] = useState(false);

  const exportCSV = () => {
    if (members.length === 0) return;
    const headers = ["Nombre", "Email", "Teléfono", "Tipo Doc", "Documento", "Estado", "Membresía", "Vence", "Fecha registro"];
    const rows = members.map((m) => [
      m.full_name,
      m.email,
      m.phone ?? "",
      m.id_type ?? "",
      m.id_number ?? "",
      m.status === "active" ? "Activo" : "Inactivo",
      m.membership_plan_name ?? "",
      m.membership_end_date ?? "",
      formatDate(m.created_at, "dd/MM/yyyy"),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `miembros-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchMembers = async (currentPage = page) => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/members", {
        params: {
          q: search,
          limit: PAGE_SIZE,
          offset: currentPage * PAGE_SIZE,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(typeFilter ? { member_type: typeFilter } : {}),
          ...(missingIdOnly ? { missing_id_number: true } : {}),
        },
      });
      setMembers(res.data);
      setHasMore(res.data.length === PAGE_SIZE);
      setError("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(parseApiError(e, "Error cargando miembros"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    setLoading(true);
    // Reset to page 0 when filters change
    setPage(0);
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/members", {
      params: {
        q: search,
        limit: PAGE_SIZE,
        offset: 0,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(typeFilter ? { member_type: typeFilter } : {}),
        ...(missingIdOnly ? { missing_id_number: true } : {}),
      },
    }).then((res) => {
      if (!cancelled) {
        setMembers(res.data);
        setHasMore(res.data.length === PAGE_SIZE);
        setError("");
      }
    }).catch((err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } } };
      if (!cancelled) setError(parseApiError(e, "Error cargando miembros"));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [session?.accessToken, search, statusFilter, typeFilter, missingIdOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Contador para el banner de miembros antiguos sin cédula
  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/members/missing-id-number/count")
      .then((res) => setMissingIdCount(res.data?.count ?? 0))
      .catch(() => {});
  }, [session?.accessToken, members.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar planes: al abrir el wizard de creación, o al activar la pestaña de
  // membresía en edición (lazy)
  useEffect(() => {
    if (!session?.accessToken || !dialogOpen) return;
    if (editing && !membershipTabActive) return;
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/member-plans/").then((res) => setAvailablePlans(res.data)).catch(() => {});
    if (editing?.id) {
      client.get(`/api/v1/members/${editing.id}/memberships`).then((res) => {
        const data = res.data;
        if (Array.isArray(data) && data.length > 0) {
          setCurrentMembership(data[0]);
        } else {
          setCurrentMembership(null);
        }
      }).catch(() => setCurrentMembership(null));
    }
  }, [dialogOpen, membershipTabActive, session, editing]);

  const handleAssignMembership = async () => {
    if (!session?.accessToken || !editing || !assignPlanId || !assignStartDate) return;
    setAssigningMembership(true);
    const client = apiClient(session.accessToken as string);
    try {
      await client.post("/api/v1/member-plans/assign", {
        member_id: editing.id,
        plan_id: assignPlanId,
        start_date: assignStartDate,
      });
      toast.success("Membresía asignada correctamente");
      setAssignPlanId("");
      setAssignStartDate("");
      // Refresh current membership
      const res = await client.get(`/api/v1/members/${editing.id}/memberships`);
      const data = res.data;
      setCurrentMembership(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(parseApiError(e, "Error asignando membresía"));
    } finally {
      setAssigningMembership(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setPhotoFile(null);
    setConsentData(false);
    setConsentImage(false);
    setEditing(null);
    setStep(0);
    setMembershipTabActive(false);
    setCurrentMembership(null);
    setAssignPlanId("");
    setAssignStartDate("");
    setAssignPaymentMethod("");
  };

  const openCreate = () => { resetForm(); setConverting(null); setDialogOpen(true); };
  const openConvert = (visitor: Member) => {
    resetForm();
    setConverting(visitor);
    setForm({
      ...emptyForm,
      full_name: visitor.full_name,
      phone: visitor.phone || "",
      id_number: visitor.id_number || "",
      id_type: visitor.id_type || "CC",
      photo_url: visitor.photo_url || "",
    });
    setDialogOpen(true);
  };

  useEffect(() => {
    const convertId = searchParams.get("convert");
    if (!convertId || !session?.accessToken || convertHandled.current === convertId) return;
    convertHandled.current = convertId;
    const client = apiClient(session.accessToken as string);
    client
      .get(`/api/v1/members/${convertId}`)
      .then((res) => { if (res.data?.member_type === "visitor") openConvert(res.data); })
      .catch(() => {})
      .finally(() => router.replace("/members"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, session]);
  const openEdit = (member: Member) => {
    setEditing(member);
    setForm({
      full_name: member.full_name,
      email: member.email || "",
      phone: member.phone || "",
      id_number: member.id_number || "",
      id_type: member.id_type || "",
      birth_date: member.birth_date || "",
      status: member.status,
      notes: member.notes || "",
      gender: member.gender || "",
      training_goal: member.training_goal || "",
      address: member.address || "",
      city: member.city || "",
      country: member.country || "CO",
      emergency_contact_name: member.emergency_contact_name || "",
      emergency_contact_phone: member.emergency_contact_phone || "",
      blood_type: member.blood_type || "",
      photo_url: member.photo_url || "",
      parq_answers: member.parq_answers || {},
    });
    setDialogOpen(true);
  };

  // Validación por paso del wizard de creación: no se avanza con datos incompletos
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!form.id_type || !form.id_number.trim()) return "El tipo y número de documento son obligatorios";
      if (form.full_name.trim().length < 2) return "Escribe el nombre completo";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Email inválido";
      if (!form.phone.trim()) return "El teléfono es obligatorio";
      if (!form.birth_date) return "La fecha de nacimiento es obligatoria";
      if (!form.city.trim()) return "La ciudad es obligatoria";
      if (!form.country) return "El país es obligatorio";
      if (!form.address.trim()) return "La dirección es obligatoria";
    }
    if (s === 1) {
      if (!PARQ_KEYS.every((k) => typeof form.parq_answers[k] === "boolean"))
        return "Responde las 7 preguntas del cuestionario PAR-Q";
      if (!form.emergency_contact_name.trim()) return "El nombre del contacto de emergencia es obligatorio";
      if (!form.emergency_contact_phone.trim()) return "El teléfono de emergencia es obligatorio";
    }
    if (s === 2 && !assignPlanId) return "Selecciona el plan de membresía";
    if (s === 2 && !consentData) return "El socio debe aceptar la política de tratamiento de datos";
    if (s === 2 && photoFile && !consentImage) return "Para guardar la foto el socio debe autorizar el uso de su imagen";
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }
    setStep((s) => Math.min(s + 1, 2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;

    // Enter en un input del wizard avanza de paso, no envía
    if (!editing && step < 2) { goNext(); return; }

    const payload = {
      ...form,
      email: form.email || undefined,
      id_type: form.id_type || undefined,
      gender: form.gender || undefined,
      training_goal: form.training_goal || undefined,
      blood_type: form.blood_type || undefined,
      // No persistir blobs locales ni URLs firmadas (el backend guarda la key)
      photo_url: form.photo_url.startsWith("blob:") || form.photo_url.startsWith("http") ? undefined : form.photo_url || undefined,
      parq_completed_at: Object.keys(form.parq_answers).length > 0 ? todayISO() : undefined,
    };

    if (!editing) {
      for (const s of [0, 1, 2]) {
        const err = validateStep(s);
        if (err) { toast.error(err); setStep(s); return; }
      }
    } else {
      const validation = memberSchema.safeParse(payload);
      if (!validation.success) { toast.error(validation.error.issues[0].message); return; }
    }

    setSubmitting(true);
    const client = apiClient(session.accessToken as string);
    try {
      let memberId = editing?.id;
      if (editing) {
        await client.put(`/api/v1/members/${editing.id}`, payload);
      } else if (converting) {
        // Visitante del pase del día → socio: conserva cédula, pases y pagos
        const { data: created } = await client.post(`/api/v1/members/${converting.id}/convert-to-member`, {
          ...payload,
          status: "active",
          plan_id: assignPlanId,
          payment_method: assignPaymentMethod || undefined,
          consent_data: consentData,
          consent_image: consentImage,
        });
        memberId = created.id;
      } else {
        // Alta completa: la membresía es obligatoria e inicia hoy (backend)
        const { data: created } = await client.post("/api/v1/members", {
          ...payload,
          status: "active",
          plan_id: assignPlanId,
          payment_method: assignPaymentMethod || undefined,
          consent_data: consentData,
          consent_image: consentImage,
        });
        memberId = created.id;
      }
      // Subir la foto real una vez existe el socio (el blob local no persiste)
      if (photoFile && memberId) {
        const fd = new FormData();
        fd.append("file", photoFile);
        await client.post(`/api/v1/members/${memberId}/photo`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      toast.success(editing ? "Miembro actualizado" : converting ? "Visitante convertido en socio" : "Miembro creado");
      setDialogOpen(false); resetForm(); setConverting(null); fetchMembers();
    } catch (err: unknown) {
      toast.error(parseApiError(err, "Error guardando miembro"));
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.delete(`/api/v1/members/${id}`);
      toast.success("Miembro eliminado correctamente");
      setDeleteId(null); fetchMembers();
    } catch (err: unknown) {
      toast.error(parseApiError(err, "Error eliminando"));
    }
  };

  const age = form.birth_date ? calcAge(form.birth_date) : null;

  const req = !editing; // en creación todos estos campos son obligatorios

  const personalFields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label className="text-[var(--text-muted)] text-sm">Tipo de documento {req && "*"}</Label>
        <IdTypeSelect
          value={form.id_type}
          onChange={(v) => setForm({ ...form, id_type: v || "" })}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-[var(--text-muted)] text-sm">Número de documento {req && "*"}</Label>
        <Input
          value={form.id_number}
          onChange={(e) => setForm({ ...form, id_number: e.target.value })}
          inputMode="numeric"
          placeholder="Cédula — identifica al miembro en el check-in"
          className={inputCls}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="full_name" className="text-[var(--text-muted)] text-sm">Nombre completo *</Label>
        <Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} />
      </div>
      <div className="space-y-2">
        <Label className="text-[var(--text-muted)] text-sm">Género</Label>
        <GenderSelect
          value={form.gender}
          onChange={(v) => setForm({ ...form, gender: v || "" })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-[var(--text-muted)] text-sm">Email *</Label>
        <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
      </div>
      <div className="space-y-2">
        <Label className="text-[var(--text-muted)] text-sm">Teléfono {req && "*"}</Label>
        <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      </div>
      <div className="space-y-2">
        <Label className="text-[var(--text-muted)] text-sm">Fecha de nacimiento {req && "*"}</Label>
        <DatePicker
          value={form.birth_date ? parseDateOnly(form.birth_date) : undefined}
          onChange={(d) => setForm({ ...form, birth_date: toISODate(d) })}
          placeholder="Seleccionar fecha"
          maxDate={new Date()}
          fromYear={1920}
          toYear={new Date().getFullYear()}
        />
        {age !== null && (
          <p className="text-xs text-[var(--text-muted)]">{age} años</p>
        )}
      </div>
      <div className="space-y-2">
        <Label className="text-[var(--text-muted)] text-sm">Ciudad {req && "*"}</Label>
        <CityCombobox value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
      </div>
      <div className="space-y-2">
        <Label className="text-[var(--text-muted)] text-sm">País {req && "*"}</Label>
        <CountrySelect value={form.country} onChange={(v) => setForm({ ...form, country: v || "CO" })} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label className="text-[var(--text-muted)] text-sm">Dirección {req && "*"}</Label>
        <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
      </div>
      <div className="sm:col-span-2 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[var(--text-muted)] text-sm">Foto del miembro (opcional)</Label>
          <CameraCapture
            onCapture={(file) => {
              setPhotoFile(file);
              setForm({ ...form, photo_url: URL.createObjectURL(file) });
            }}
          />
        </div>
        <FileUpload
          value={form.photo_url || undefined}
          onChange={(file) => {
            if (file) {
              setPhotoFile(file);
              setForm({ ...form, photo_url: URL.createObjectURL(file) });
            } else {
              setPhotoFile(null);
              setForm({ ...form, photo_url: "" });
            }
          }}
          shape="rect"
        />
        <p className="text-[11px] text-[var(--text-muted)]">La foto se guarda de forma privada: solo el staff la ve al hacer check-in.</p>
      </div>
    </div>
  );

  const healthFields = (
    <div className="space-y-4">
      <PARQForm
        value={form.parq_answers}
        onChange={(answers) => setForm({ ...form, parq_answers: answers })}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-[var(--text-muted)] text-sm">Grupo sanguíneo</Label>
          <BloodTypeSelect
            value={form.blood_type}
            onChange={(v) => setForm({ ...form, blood_type: v || "" })}
          />
        </div>
        {/* Estaba en el schema, el estado y el payload, pero sin campo: se
            mandaba siempre vacío y el importador de Excel era el único que lo llenaba. */}
        <div className="space-y-2">
          <Label htmlFor="training_goal" className="text-[var(--text-muted)] text-sm">Objetivo de entrenamiento</Label>
          <select
            id="training_goal"
            value={form.training_goal}
            onChange={(e) => setForm({ ...form, training_goal: e.target.value })}
            className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink"
          >
            <option value="">Sin definir</option>
            {TRAINING_GOALS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label className="text-[var(--text-muted)] text-sm">Contacto de emergencia {req && "*"}</Label>
          <Input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} placeholder="Nombre" className={inputCls} />
        </div>
        <div className="space-y-2">
          <Label className="text-[var(--text-muted)] text-sm">Teléfono emergencia {req && "*"}</Label>
          <PhoneInput value={form.emergency_contact_phone} onChange={(v) => setForm({ ...form, emergency_contact_phone: v })} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <PageHeader
          module="members"
          title="Socios"
          subtitle="Busca, registra y cobra a los socios del gimnasio."
          action={
            <div className="flex items-center gap-2">
              <MemberImportDialog onImported={() => fetchMembers(0)} />
              <DialogTrigger
                render={
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo socio
                  </Button>
                }
              />
            </div>
          }
        />
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar miembro" : converting ? `Convertir a ${converting.full_name.split(" ")[0]} en socio` : "Nuevo socio"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="mt-2">
            {editing ? (
              <Tabs defaultValue="personal" onValueChange={(v) => setMembershipTabActive(v === "membresia")}>
                <TabsList>
                  <TabsTrigger value="personal">Personal</TabsTrigger>
                  <TabsTrigger value="salud">Salud</TabsTrigger>
                  <TabsTrigger value="membresia">Membresía</TabsTrigger>
                </TabsList>

                <TabsContent value="personal" className="space-y-4">
                  {personalFields}
                </TabsContent>

                <TabsContent value="salud" className="space-y-4">
                  {healthFields}
                </TabsContent>

                {/* TAB MEMBRESÍA (edición) */}
                <TabsContent value="membresia" className="space-y-4">
                  <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 space-y-3">
                    <p className="text-sm font-medium text-ink">Membresía activa</p>
                    {currentMembership ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-[var(--color-primary-ink)]" />
                          <span className="font-semibold text-[var(--text-base)]">{currentMembership.plan_name}</span>
                          <MembershipStatusBadge
                            status={daysUntil(currentMembership.end_date) >= 0 ? "ok" : "expired"}
                            endDate={currentMembership.end_date}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(currentMembership.start_date, "dd/MM/yyyy")}
                          {" → "}
                          {formatDate(currentMembership.end_date, "dd/MM/yyyy")}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
                        <CheckCircle2 className="h-4 w-4 opacity-40" />
                        Sin membresía activa
                      </div>
                    )}
                  </div>

                  <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 space-y-3">
                    <p className="text-sm font-medium text-ink">Asignar membresía</p>
                    <div className="space-y-2">
                      <Label className="text-[var(--text-muted)] text-sm">Plan</Label>
                      <select
                        value={assignPlanId}
                        onChange={(e) => setAssignPlanId(e.target.value)}
                        className={selectCls}
                      >
                        <option value="">Selecciona un plan…</option>
                        {availablePlans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatCOP(p.price)} / {p.duration_days} días
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[var(--text-muted)] text-sm">Fecha de inicio</Label>
                      <Input
                        type="date"
                        value={assignStartDate}
                        onChange={(e) => setAssignStartDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={assigningMembership || !assignPlanId || !assignStartDate}
                      onClick={handleAssignMembership}
                      className="w-full"
                    >
                      {assigningMembership ? "Asignando..." : "Asignar membresía"}
                    </Button>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div className="space-y-2">
                      <Label className="text-[var(--text-muted)] text-sm">Estado del miembro</Label>
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectCls}>
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[var(--text-muted)] text-sm">Notas</Label>
                      <Textarea
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Notas adicionales sobre el miembro..."
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-5">
                {/* Indicador de pasos del wizard */}
                <div className="flex items-center gap-1.5" aria-label={`Paso ${step + 1} de ${WIZARD_STEPS.length}`}>
                  {WIZARD_STEPS.map((s, i) => {
                    const Icon = s.icon;
                    const done = i < step;
                    const current = i === step;
                    return (
                      <div key={s.label} className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span
                          className={cn(
                            "h-7 w-7 rounded-full flex items-center justify-center shrink-0 border transition-colors",
                            done && "bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-primary-contrast)]",
                            current && "border-[var(--color-primary)] text-[var(--color-primary-ink)]",
                            !done && !current && "border-[var(--border-base)] text-[var(--text-muted)]"
                          )}
                        >
                          {done ? <Check className="h-3.5 w-3.5" weight="bold" /> : <Icon className="h-3.5 w-3.5" />}
                        </span>
                        <span className={cn(
                          "text-xs font-medium truncate",
                          current ? "text-[var(--text-base)]" : "text-[var(--text-muted)]"
                        )}>
                          {s.label}
                        </span>
                        {i < WIZARD_STEPS.length - 1 && (
                          <span className={cn("h-px flex-1 min-w-3", done ? "bg-[var(--color-primary)]" : "bg-[var(--border-base)]")} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {step === 0 && personalFields}
                {step === 1 && healthFields}
                {step === 2 && (
                  <div className="space-y-4">
                    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 space-y-3">
                      <p className="text-sm font-medium text-ink">Tratamiento de datos *</p>
                      <label className="flex items-start gap-2.5 text-sm text-[var(--text-base)] cursor-pointer">
                        <input type="checkbox" checked={consentData} onChange={(e) => setConsentData(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
                        <span>
                          El socio acepta la{" "}
                          <a href="/tratamiento-datos" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-primary-ink)] hover:underline">política de tratamiento de datos personales</a>{" "}
                          (Ley 1581 de 2012). Queda registrada la fecha de aceptación.
                        </span>
                      </label>
                      <label className="flex items-start gap-2.5 text-sm text-[var(--text-base)] cursor-pointer">
                        <input type="checkbox" checked={consentImage} onChange={(e) => setConsentImage(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
                        <span>Autoriza el uso de su foto para identificarlo en el check-in{photoFile ? " (obligatorio porque adjuntaste una foto)" : ""}.</span>
                      </label>
                    </div>
                    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 space-y-3">
                      <p className="text-sm font-medium text-ink">Membresía inicial *</p>
                      {availablePlans.length === 0 ? (
                        <div className="rounded-[var(--radius-md)] border border-[var(--signal-warn-line)] bg-[var(--signal-warn-bg)] p-3 text-sm text-[var(--signal-warn)]">
                          Aún no tienes planes creados. Ve a{" "}
                          <a href="/plans" className="font-semibold underline">Planes</a>{" "}
                          y crea tu primer plan para poder registrar socios.
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label className="text-[var(--text-muted)] text-sm">Plan *</Label>
                            <select
                              value={assignPlanId}
                              onChange={(e) => setAssignPlanId(e.target.value)}
                              className={selectCls}
                            >
                              <option value="">Selecciona un plan…</option>
                              {availablePlans.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} — {formatCOP(p.price)} / {p.duration_days} días
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[var(--text-muted)] text-sm">Fecha de inicio</Label>
                            <p className="text-sm text-[var(--text-base)]">
                              Hoy — {new Date().toLocaleDateString("es-CO")}
                              <span className="ml-1.5 text-xs text-[var(--text-muted)]">(la membresía inicia al crear el socio)</span>
                            </p>
                          </div>
                          {assignPlanId && (
                            <div className="space-y-2">
                              <Label className="text-[var(--text-muted)] text-sm">Método de pago (opcional)</Label>
                              <select
                                value={assignPaymentMethod}
                                onChange={(e) => setAssignPaymentMethod(e.target.value)}
                                className={selectCls}
                              >
                                <option value="">Sin cobro por ahora</option>
                                <option value="cash">Efectivo</option>
                                <option value="transfer">Transferencia</option>
                                <option value="card">Tarjeta</option>
                              </select>
                              <p className="text-xs text-[var(--text-muted)]">Genera un pago pendiente por el valor del plan.</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[var(--text-muted)] text-sm">Notas</Label>
                      <Textarea
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Notas adicionales sobre el miembro..."
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-4 mt-2 border-t border-[var(--border-base)]">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="text-[var(--text-muted)]">Cancelar</Button>
              {editing ? (
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Guardando..." : "Guardar cambios"}
                </Button>
              ) : (
                <div className="flex gap-2">
                  {step > 0 && (
                    <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                      Anterior
                    </Button>
                  )}
                  {step < 2 ? (
                    <Button type="button" onClick={goNext}>
                      Siguiente
                    </Button>
                  ) : (
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Creando..." : "Crear socio"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {missingIdCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--signal-warn-line)] bg-[var(--signal-warn-bg)] px-4 py-3">
          <AlertCircle className="h-4 w-4 text-[var(--signal-warn)] shrink-0" />
          <p className="text-sm text-ink flex-1 min-w-[200px]">
            <strong>{missingIdCount}</strong> miembro{missingIdCount !== 1 ? "s" : ""} sin cédula registrada: no podrá{missingIdCount !== 1 ? "n" : ""} entrar por documento.
          </p>
          <button
            onClick={() => setMissingIdOnly((v) => !v)}
            className={cn(
              "h-9 rounded-[var(--radius-md)] px-3 text-sm font-medium border transition-colors",
              missingIdOnly
                ? "border-ink bg-ink text-surface"
                : "border-[var(--signal-warn-line)] bg-panel text-ink hover:bg-muted"
            )}
          >
            {missingIdOnly ? "Ver todos" : "Ver pendientes"}
          </button>
        </div>
      )}

      <GlassCard className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              placeholder="Buscar por nombre, correo o cédula…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn("pl-9", inputCls)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "h-9 rounded-[var(--radius-md)] px-3 text-sm font-medium transition-colors",
                  statusFilter === s
                    ? "bg-primary-muted font-semibold text-primary-ink"
                    : "bg-muted text-ink-muted hover:text-ink"
                )}
              >
                {s === "" ? "Todos" : s === "active" ? "Activos" : "Inactivos"}
              </button>
            ))}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              aria-label="Filtrar por tipo de persona"
              className="h-9 rounded-[var(--radius-md)] px-3 text-sm font-medium bg-panel border border-line text-ink"
            >
              <option value="">Todo el mundo</option>
              <option value="member">Solo socios</option>
              <option value="visitor">Solo visitantes</option>
              <option value="staff">Solo equipo</option>
            </select>
            <button
              onClick={exportCSV}
              disabled={members.length === 0}
              title="Exportar a CSV"
              className="flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-medium bg-panel border border-line text-ink hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 text-[var(--signal-danger)] mb-4">
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
                <TableHead className="text-[var(--text-muted)]">Membresía</TableHead>
                <TableHead className="text-[var(--text-muted)]">Registro</TableHead>
                <TableHead className="text-[var(--text-muted)]">QR</TableHead>
                <TableHead className="text-[var(--text-muted)] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-[var(--border-base)]">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><div className="skeleton h-4 rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    {/* Con un filtro puesto, "crea tu primer miembro" es falso:
                        el gimnasio sí tiene socios, solo que ninguno encaja. */}
                    {search || statusFilter || typeFilter || missingIdOnly ? (
                      <EmptyState
                        title="Ningún socio coincide"
                        description={
                          search
                            ? `Nadie con «${search}» en nombre, correo o documento.`
                            : "Prueba con otro filtro o quítalos para ver a todos."
                        }
                        action={
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSearch("");
                              setStatusFilter("");
                              setTypeFilter("");
                              setMissingIdOnly(false);
                            }}
                          >
                            Quitar los filtros
                          </Button>
                        }
                      />
                    ) : (
                      <EmptyState
                        title="Sin socios todavía"
                        description="Registra al primero y podrás cobrarle, darle su carné y controlar su entrada."
                        action={
                          <Button onClick={openCreate}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nuevo socio
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => (
                  <TableRow
                    key={m.id}
                    className="group cursor-pointer"
                    onClick={() => router.push(`/members/${m.id}`)}
                  >
                    <TableCell className="text-[var(--text-base)] font-medium">
                      <div className="flex items-center gap-2">
                        {m.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photo_url} alt={m.full_name} className="size-9 shrink-0 rounded-[12px] object-cover" />
                        ) : (
                          <Avatar name={m.full_name} size={36} />
                        )}
                        {m.full_name}
                        {m.member_type === "visitor" && (
                          <span className="inline-flex h-5 items-center rounded-[var(--radius-sm)] bg-muted px-1.5 text-[11px] font-semibold text-ink-muted">
                            Visitante
                          </span>
                        )}
                        {m.member_type === "staff" && (
                          <span className="inline-flex h-5 items-center rounded-[var(--radius-sm)] bg-muted px-1.5 text-[11px] font-semibold text-ink-muted">
                            Equipo
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)]">{m.email ?? "—"}</TableCell>
                    <TableCell className="text-[var(--text-muted)]">{m.phone || "-"}</TableCell>
                    <TableCell className="text-[var(--text-muted)]">
                      {m.id_type && <span className="text-xs font-medium text-[var(--text-subtle)] mr-1">{m.id_type}</span>}
                      {m.id_number || "-"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {m.membership_status === "active" ? (
                        <div className="flex flex-col gap-0.5">
                          <StatusBadge status="active" label={m.membership_plan_name || "Activa"} />
                          {m.membership_end_date && (
                            <span className="num text-xs text-ink-muted">
                              Vence {formatDate(m.membership_end_date, "dd/MM/yyyy")}
                            </span>
                          )}
                        </div>
                      ) : m.membership_status === "expired" ? (
                        <div className="flex flex-col gap-0.5">
                          <StatusBadge status="expired" />
                          {m.membership_end_date && (
                            <span className="num text-xs text-ink-muted">
                              {formatDate(m.membership_end_date, "dd/MM/yyyy")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs">Sin membresía</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)] text-sm">
                      {formatDate(m.created_at, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      {m.qr_code ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-[var(--text-muted)] hover:text-[var(--color-primary-ink)]"
                          onClick={(e) => { e.stopPropagation(); setQrMember(m); }}
                          title="Ver QR"
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-ink-muted hover:text-ink"
                          aria-label={"Editar " + m.full_name}
                          onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-ink-muted hover:text-[var(--signal-danger)]"
                          aria-label={"Eliminar " + m.full_name}
                          onClick={(e) => { e.stopPropagation(); setDeleteId(m.id); }}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {(page > 0 || hasMore) && (
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-base)]">
            <p className="text-xs text-[var(--text-muted)]">
              Página {page + 1} · {members.length} resultado{members.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 0 || loading}
                onClick={() => { const p = page - 1; setPage(p); fetchMembers(p); }}
                className="h-9 px-3 text-sm font-medium rounded-[var(--radius-md)] border border-line bg-panel text-ink hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Anterior
              </button>
              <button
                disabled={!hasMore || loading}
                onClick={() => { const p = page + 1; setPage(p); fetchMembers(p); }}
                className="h-9 px-3 text-sm font-medium rounded-[var(--radius-md)] border border-line bg-panel text-ink hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* QR Popover */}
      {qrMember && qrMember.qr_code && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={() => setQrMember(null)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-3 -right-3 z-10 bg-[var(--bg-card)] border border-[var(--border-base)] rounded-full h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-base)] shadow-md"
              onClick={() => setQrMember(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <QRCodeDisplay qrCode={qrMember.qr_code} memberName={qrMember.full_name} />
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={() => setDeleteId(null)}>
          <div
            className="bg-panel border border-line rounded-[var(--radius-xl)] p-6 max-w-sm w-full shadow-[var(--shadow-dialog)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[var(--text-base)] font-semibold mb-2">¿Eliminar miembro?</h3>
            <p className="text-[var(--text-muted)] text-sm mb-5">Se borran su historial de entradas, reservas y rutinas. No se puede deshacer, y si tiene pagos registrados no se podrá eliminar.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="h-10 px-4 text-sm font-medium rounded-[var(--radius-md)] border border-line text-ink hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { handleDelete(deleteId); }}
                className="h-10 px-4 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--signal-danger)] text-surface hover:opacity-90 transition-opacity"
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
