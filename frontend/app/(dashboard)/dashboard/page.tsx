"use client";
export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { ExpiringPanel, AttentionPanels, OperationsStatus } from "@/components/dashboard/OperationsToday";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { OnboardingTour } from "@/components/dashboard/OnboardingTour";
import { InsightsStrip } from "@/components/dashboard/InsightsStrip";
import { LiveEntries, useLiveEntries } from "@/components/dashboard/LiveNowStrip";
import { Panel, PanelNote, PanelRow } from "@/components/dashboard/Panel";
import { useDashboardData } from "@/hooks/useDashboardData";
import { formatCOP, gymHour, todayInGym } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertCircle, Clock, Ticket, UserPlus, Zap } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

function greeting(): string {
  const h = gymHour();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

const KIND_LABEL: Record<string, string> = { membership: "Membresías", day_pass: "Pases", product: "Productos", other: "Otros" };
const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", wompi: "Wompi" };

function elapsed(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}

/** Una cifra de la franja superior. Si la fuente falló, dice "—" y no un 0. */
function Figure({
  label,
  value,
  detail,
  href,
  failed,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  failed?: boolean;
  tone?: "warn";
}) {
  const body = (
    <>
      <span className="text-sm text-ink-muted">{label}</span>
      <span
        className="truncate font-mono text-xl font-semibold tracking-[-0.02em] tabular-nums sm:text-2xl lg:text-[28px]"
        style={{ color: failed ? "var(--text-muted)" : tone === "warn" ? "var(--signal-warn)" : "var(--text-base)" }}
      >
        {failed ? "—" : value}
      </span>
      <span className="truncate text-xs" style={{ color: failed ? "var(--signal-warn)" : "var(--text-muted)" }}>
        {failed ? "No se pudo cargar" : detail}
      </span>
    </>
  );
  const cls = "flex min-w-0 flex-col gap-1.5 p-4 md:px-5";
  return href && !failed ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-muted")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** El esqueleto reproduce la rejilla real: al llegar los datos nada se mueve. */
function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando el panel">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton h-8 w-64" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-28" />
          ))}
        </div>
      </div>
      <div className="skeleton h-[104px] rounded-[var(--radius-lg)]" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="skeleton h-[460px] rounded-[var(--radius-lg)]" />
        <div className="space-y-4">
          <div className="skeleton h-72 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-44 rounded-[var(--radius-lg)]" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error } = useDashboardData();
  const { data: session, status } = useSession();
  const router = useRouter();
  const rol = session?.role;
  const entries = useLiveEntries(data.checkinsToday);

  // Un entrenador que llegue por marcador vería un panel lleno de "—".
  useEffect(() => {
    if (status === "authenticated" && rol === "trainer") router.replace("/entrenador");
  }, [status, rol, router]);

  if (loading || rol === "trainer") return <DashboardSkeleton />;

  if (error) {
    return (
      <EmptyState
        icon={<AlertCircle className="size-10" style={{ color: "var(--signal-danger)" }} />}
        title="No pudimos cargar el panel"
        description={`${error}. Revisa tu conexión y recarga la página.`}
      />
    );
  }

  const { kpis, cash, pendingTransfers, receivables, todayClasses, failed } = data;
  const receivableTotal = receivables.reduce((a, r) => a + Number(r.amount_due), 0);
  const pendingTotal = pendingTransfers.reduce((a, p) => a + Number(p.amount), 0);
  const methods = Object.entries(cash?.by_method ?? {}).filter(([, v]) => v > 0);
  const kinds = Object.entries(cash?.by_kind ?? {}).filter(([, v]) => v > 0);
  const allowedToday = entries.filter((e) => e.decision !== "denied").length;
  const fecha = format(todayInGym(), "EEEE d 'de' MMMM", { locale: es });

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        eyebrow={fecha.charAt(0).toUpperCase() + fecha.slice(1)}
        title={greeting()}
        action={
          <>
            <Link href="/payments?tab=pos" className={buttonVariants({ size: "lg" })}>
              <Zap /> Cobrar
            </Link>
            <Link href="/payments?tab=daypass" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Ticket /> Vender pase
            </Link>
            <Link href="/members" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <UserPlus /> Nuevo socio
            </Link>
          </>
        }
      />

      <OnboardingTour />
      <div data-tour="checklist">
        <OnboardingChecklist />
      </div>

      {/* Franja de cifras: una sola superficie con divisores, no cuatro tarjetas. */}
      <section
        aria-label="Cifras de hoy"
        data-tour="live-now"
        className="grid grid-cols-2 divide-line overflow-hidden rounded-[var(--radius-lg)] border border-line bg-panel max-md:[&>*:nth-child(-n+2)]:border-b max-md:[&>*:nth-child(odd)]:border-r md:grid-cols-4 md:divide-x"
      >
        <Figure
          label="Entradas hoy"
          value={String(allowedToday)}
          detail={`${kpis?.expiring_memberships_7d ?? 0} vencen esta semana`}
          href="/checkins"
        />
        <Figure
          label="Caja de hoy"
          value={formatCOP(cash?.total ?? 0)}
          detail={cash ? `${cash.count} cobro${cash.count === 1 ? "" : "s"}` : ""}
          href="/payments/cash"
          failed={failed.has("cash")}
        />
        <Figure
          label="Por confirmar"
          value={formatCOP(pendingTotal)}
          detail={`${pendingTransfers.length} transferencia${pendingTransfers.length === 1 ? "" : "s"}`}
          href="/payments?tab=receivables"
          failed={failed.has("pendingTransfers")}
          tone={pendingTransfers.length ? "warn" : undefined}
        />
        <Figure
          label="Por cobrar"
          value={formatCOP(receivableTotal)}
          detail={`${receivables.length} socio${receivables.length === 1 ? "" : "s"} con saldo`}
          href="/payments?tab=receivables"
          failed={failed.has("receivables")}
        />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Lo que pasa en la puerta y lo que hay que atender */}
        <div className="space-y-4">
          <LiveEntries entries={entries} />
          <AttentionPanels data={data.operations} />
          <InsightsStrip insights={data.insights} />
        </div>

        {/* Pendientes, plata y estado */}
        <div className="space-y-4">
          <ExpiringPanel data={failed.has("operations") ? null : data.operations} />

          <Panel title="Caja del día" action={{ href: "/payments/cash", label: "Ver caja" }}>
            {failed.has("cash") ? (
              <PanelNote tone="warn">No se pudo cargar.</PanelNote>
            ) : methods.length === 0 ? (
              <PanelNote>Aún no hay cobros hoy.</PanelNote>
            ) : (
              <dl className="space-y-2 px-4 py-3">
                {methods.map(([m, v]) => (
                  <div key={m} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-ink-muted">{METHOD_LABEL[m] ?? m}</dt>
                    <dd className="font-mono text-ink tabular-nums">{formatCOP(v)}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-line pt-2 text-sm">
                  <dt className="font-medium text-ink">Total</dt>
                  <dd className="font-mono font-semibold text-ink tabular-nums">{formatCOP(cash?.total ?? 0)}</dd>
                </div>
                {kinds.length > 1 && (
                  <p className="text-xs text-ink-muted">{kinds.map(([k, v]) => `${KIND_LABEL[k] ?? k} ${formatCOP(v)}`).join(" · ")}</p>
                )}
              </dl>
            )}
            {pendingTransfers.length > 0 && !failed.has("pendingTransfers") && (
              <div className="border-t border-line">
                <p className="px-4 pt-3 text-xs font-medium text-ink-muted">Transferencias por confirmar</p>
                <ul>
                  {pendingTransfers.slice(0, 4).map((p) => (
                    <PanelRow key={p.id} className="min-h-10 py-1.5">
                      <span className="w-20 shrink-0 truncate font-mono text-xs text-ink-muted">{p.transfer_reference ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.member_name ?? "Mostrador"}</span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-ink-muted tabular-nums">
                        <Clock className="size-3" aria-hidden="true" />
                        {elapsed(p.elapsed_minutes)}
                      </span>
                    </PanelRow>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <OperationsStatus
            shift={data.shift}
            lowStock={data.lowStock}
            machines={kpis ? { total: kpis.machines_total, down: kpis.machines_maintenance } : null}
          />

          {todayClasses.length > 0 && (
            <Panel title="Clases de hoy" count={todayClasses.length} action={{ href: "/classes/agenda", label: "Agenda" }}>
              <ul className="divide-y divide-line">
                {todayClasses.map((c) => (
                  <PanelRow key={String(c.id)}>
                    <span className="w-11 shrink-0 font-mono text-sm text-ink-muted tabular-nums">
                      {typeof c.start_time === "string" ? c.start_time.slice(0, 5) : "—"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{String(c.name)}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {[c.instructor, `${String(c.duration_minutes)} min`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </PanelRow>
                ))}
              </ul>
            </Panel>
          )}

          {data.birthdaysToday.length > 0 && (
            <p className="px-1 text-sm text-ink-muted">
              Cumple{data.birthdaysToday.length > 1 ? "n" : ""} hoy:{" "}
              <span className="text-ink">{data.birthdaysToday.map((b) => b.full_name).join(", ")}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
