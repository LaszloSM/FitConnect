"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { GlassCard } from "@/components/common/GlassCard";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { OperationsToday } from "@/components/dashboard/OperationsToday";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { OnboardingTour } from "@/components/dashboard/OnboardingTour";
import { InsightsStrip } from "@/components/dashboard/InsightsStrip";
import { LiveNowStrip } from "@/components/dashboard/LiveNowStrip";
import { apiClient } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  BarChart3,
  Clock,
  Dumbbell,
  HandCoins,
  Landmark,
  Ticket,
  UserPlus,
  Wrench,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface CashToday {
  total: number;
  count: number;
  by_method: Record<string, number>;
  by_kind: Record<string, number>;
  pending_transfers: { count: number; amount: number };
}

interface PendingTransfer {
  id: string;
  transfer_reference: string | null;
  member_name: string | null;
  amount: number;
  elapsed_minutes: number;
}

interface Receivable {
  member_id: string;
  amount_due: number;
}

interface Kpis {
  expiring_memberships_7d: number;
  machines_total: number;
  machines_maintenance: number;
  machines_active: number;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

const WEEKDAY_MAP: Record<number, string> = { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb" };
const KIND_LABEL: Record<string, string> = { membership: "Membresías", day_pass: "Pases", product: "Productos", other: "Otros" };
const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", wompi: "Wompi" };

function elapsed(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}

const QUICK_ACTIONS = [
  { href: "/payments?tab=pos", label: "Cobrar", icon: Zap, tone: "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] hover:bg-[var(--color-primary-hover)]" },
  { href: "/payments?tab=daypass", label: "Vender pase", icon: Ticket, tone: "border border-[var(--border-base)] bg-[var(--bg-card)] text-[var(--text-base)] hover:bg-[var(--bg-muted)]" },
  { href: "/members", label: "Nuevo socio", icon: UserPlus, tone: "border border-[var(--border-base)] bg-[var(--bg-card)] text-[var(--text-base)] hover:bg-[var(--bg-muted)]" },
];

export default function DashboardPage() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const status = sessionData?.status;

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [cash, setCash] = useState<CashToday | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [todayClasses, setTodayClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  useEffect(() => {
    if (status !== "authenticated" || !session?.accessToken) {
      if (status === "unauthenticated") setLoading(false);
      return;
    }
    const client = apiClient(session.accessToken as string);
    client.post("/api/v1/reports/generate-expiry-notifications").catch(() => {});

    const todayWeekday = new Date().getDay();
    client.get("/api/v1/classes", { params: { is_active: true, limit: 50 } })
      .then((res) => {
        const gymWeekday = todayWeekday === 0 ? 6 : todayWeekday - 1;
        setTodayClasses((res.data as any[]).filter((c) => Array.isArray(c.weekdays) && c.weekdays.includes(gymWeekday)));
      })
      .catch(() => {});

    Promise.all([
      client.get("/api/v1/dashboard/kpis"),
      client.get("/api/v1/payments/cash"),
      client.get("/api/v1/payments/pending-transfers").catch(() => ({ data: [] })),
      client.get("/api/v1/payments/receivables").catch(() => ({ data: [] })),
    ])
      .then(([k, c, p, r]) => {
        setKpis(k.data.kpis);
        setCash(c.data.today);
        setPendingTransfers(p.data);
        setReceivables(r.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || "Error cargando el panel");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken, status]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-12 w-72 rounded-lg mb-6" />
        <div className="skeleton h-32 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-36 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return <EmptyState icon={<AlertCircle className="h-10 w-10 text-red-500" />} title="Error cargando datos" description={error} />;
  }

  const receivableTotal = receivables.reduce((a, r) => a + Number(r.amount_due), 0);
  const pendingTotal = pendingTransfers.reduce((a, p) => a + Number(p.amount), 0);
  const methods = Object.entries(cash?.by_method ?? {}).filter(([, v]) => v > 0);
  const kinds = Object.entries(cash?.by_kind ?? {}).filter(([, v]) => v > 0);
  const maintenance = kpis && kpis.machines_total > 0 && kpis.machines_maintenance > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}>
      <PageHeader
        module="dashboard"
        eyebrow={format(new Date(), "EEEE · d 'de' MMMM", { locale: es })}
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        subtitle="Lo que pasa hoy en tu gym. Para analizar períodos, ve a Reportes."
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            {QUICK_ACTIONS.map(({ href, label, icon: Icon, tone }) => (
              <Link key={href} href={href} className={cn("flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors", tone)}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </div>
        }
      />

      <OnboardingTour />
      <div data-tour="checklist"><OnboardingChecklist /></div>

      <div data-tour="live-now">
        <LiveNowStrip expiring7d={kpis?.expiring_memberships_7d ?? 0} />
      </div>

      {/* La plata de hoy: caja, por confirmar, por cobrar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <GlassCard className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-[var(--text-muted)]">
              <Banknote className="h-3.5 w-3.5 text-emerald-500" /> Caja de hoy
            </p>
            <Link href="/payments/cash" className="text-[11px] font-semibold text-[var(--color-primary-ink)] hover:underline">Ver caja</Link>
          </div>
          <p className="text-2xl font-extrabold text-[var(--text-base)] font-display">{formatCOP(cash?.total ?? 0)}</p>
          {methods.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Aún no hay cobros hoy.</p>
          ) : (
            <div className="space-y-1">
              {methods.map(([m, v]) => (
                <div key={m} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">{METHOD_LABEL[m] ?? m}</span>
                  <span className="font-mono text-[var(--text-base)]">{formatCOP(v)}</span>
                </div>
              ))}
              {kinds.length > 1 && (
                <p className="text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-base)]">
                  {kinds.map(([k, v]) => `${KIND_LABEL[k] ?? k} ${formatCOP(v)}`).join(" · ")}
                </p>
              )}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-[var(--text-muted)]">
              <Landmark className="h-3.5 w-3.5 text-amber-500" /> Por confirmar
            </p>
            <Link href="/payments?tab=receivables" className="text-[11px] font-semibold text-[var(--color-primary-ink)] hover:underline">Conciliar</Link>
          </div>
          <p className={cn("text-2xl font-extrabold font-display", pendingTransfers.length ? "text-amber-600 dark:text-amber-400" : "text-[var(--text-base)]")}>
            {formatCOP(pendingTotal)}
          </p>
          {pendingTransfers.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Ninguna transferencia pendiente.</p>
          ) : (
            <div className="space-y-1">
              {pendingTransfers.slice(0, 4).map((p) => (
                <Link key={p.id} href="/payments?tab=receivables" className="flex items-center justify-between text-xs group">
                  <span className="truncate text-[var(--text-base)] group-hover:text-[var(--color-primary-ink)]">
                    <span className="font-mono text-[var(--text-muted)] mr-1.5">{p.transfer_reference}</span>{p.member_name ?? "Mostrador"}
                  </span>
                  <span className="flex items-center gap-1 text-[var(--text-muted)] shrink-0"><Clock className="h-3 w-3" />{elapsed(p.elapsed_minutes)}</span>
                </Link>
              ))}
              {pendingTransfers.length > 4 && <p className="text-[10px] text-[var(--text-muted)]">y {pendingTransfers.length - 4} más</p>}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-[var(--text-muted)]">
              <HandCoins className="h-3.5 w-3.5 text-violet-500" /> Por cobrar
            </p>
            <Link href="/payments?tab=receivables" className="text-[11px] font-semibold text-[var(--color-primary-ink)] hover:underline">Ver cartera</Link>
          </div>
          <p className="text-2xl font-extrabold text-[var(--text-base)] font-display">{formatCOP(receivableTotal)}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {receivables.length === 0 ? "Nadie debe nada." : `${receivables.length} socio${receivables.length === 1 ? "" : "s"} con renovación vencida o saldo pendiente.`}
          </p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-4 items-start">
        <div>
          <OperationsToday />
        </div>
        <div className="space-y-4">
          {todayClasses.length > 0 && (
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Dumbbell className="h-4 w-4 text-[var(--accent-classes)]" />
                <h3 className="text-sm font-semibold text-[var(--text-base)]">Clases de hoy — {WEEKDAY_MAP[new Date().getDay()]}</h3>
              </div>
              <div className="space-y-1.5">
                {todayClasses.map((c: any) => (
                  <Link key={c.id} href="/classes" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)] hover:border-[var(--accent-classes)] transition-colors">
                    {c.color && <span className="h-6 w-1 rounded-full shrink-0" style={{ background: c.color }} aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--text-base)] truncate">{c.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{c.start_time ? c.start_time.slice(0, 5) : "—"} · {c.instructor}</p>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] border border-[var(--border-base)] rounded px-1.5 py-0.5 shrink-0">{c.duration_minutes}min</span>
                  </Link>
                ))}
              </div>
            </GlassCard>
          )}

          {maintenance && kpis && (
            <Link href="/machines" className="block">
              <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20 p-4 flex items-center gap-3 hover:border-red-300 transition-colors group">
                <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                  <Wrench className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">Equipos fuera de servicio</p>
                  <p className="text-xs text-red-700/80 dark:text-red-400/80 mt-0.5">{kpis.machines_maintenance} de {kpis.machines_total} en mantenimiento o dañados</p>
                </div>
                <ArrowRight className="h-4 w-4 text-red-600 dark:text-red-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          )}

          <InsightsStrip />

          <Link href="/reports" className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--border-base)] px-4 py-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-base)] hover:border-[var(--color-primary)]/50 transition-colors group">
            <BarChart3 className="h-4 w-4 text-[var(--color-primary-ink)]" />
            <span className="flex-1">Ingresos por período, ventas, asistencia y retención están en <strong className="text-[var(--text-base)]">Reportes</strong>.</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
