"use client";
export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CakeIcon, CalendarBlankIcon, CashRegisterIcon, LockIcon, PackageIcon, PlusIcon, WarningCircleIcon, WrenchIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { OnboardingTour } from "@/components/dashboard/OnboardingTour";
import { useLiveEntries } from "@/components/dashboard/LiveNowStrip";
import { DayCard } from "@/components/dashboard/hoy/DayCard";
import { MoneyStrip } from "@/components/dashboard/hoy/MoneyStrip";
import { ExpiringWeek } from "@/components/dashboard/hoy/ExpiringWeek";
import { RiskBlock } from "@/components/dashboard/hoy/RiskBlock";
import { useDashboardData, type DashboardData } from "@/hooks/useDashboardData";
import { P, useCan } from "@/lib/permissions";
import { formatCOP, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** El esqueleto reproduce la rejilla real: al llegar los datos nada se mueve. */
function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando el panel">
      <div className="flex items-end justify-between gap-4">
        <div className="skeleton h-10 w-28" />
        <div className="flex gap-2">
          <div className="skeleton h-10 w-32" />
          <div className="skeleton h-10 w-28" />
        </div>
      </div>
      <div className="skeleton h-[340px] rounded-[var(--radius-lg)]" />
      <div className="skeleton h-[230px] rounded-[var(--radius-lg)]" />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="skeleton h-[420px] rounded-[var(--radius-lg)] lg:col-span-7" />
        <div className="skeleton h-[420px] rounded-[var(--radius-lg)] lg:col-span-5" />
      </div>
    </div>
  );
}

function StatusLine({ data }: { data: DashboardData }) {
  const { shift, kpis, lowStock, todayClasses, birthdaysToday } = data;
  const items: { key: string; icon: React.ReactNode; node: React.ReactNode; href?: string }[] = [];

  if (shift && shift.cash_shifts_enabled !== false) {
    items.push({
      key: "caja",
      icon: <LockIcon />,
      node: shift.open && shift.shift
        ? `Caja abierta desde las ${formatDateTime(shift.shift.opened_at, "HH:mm")}, base ${formatCOP(shift.shift.opening_amount)}`
        : "Caja sin turno abierto",
      href: "/payments/cash",
    });
  }
  if (kpis && kpis.machines_total > 0) {
    items.push({
      key: "maquinas",
      icon: <WrenchIcon />,
      node: kpis.machines_maintenance
        ? `${kpis.machines_maintenance} de ${kpis.machines_total} máquinas en mantenimiento`
        : `${kpis.machines_total} ${kpis.machines_total === 1 ? "máquina operando" : "máquinas operando"}`,
      href: "/machines",
    });
  }
  if (lowStock.length > 0) {
    items.push({
      key: "stock",
      icon: <PackageIcon />,
      node: `${lowStock.length} ${lowStock.length === 1 ? "producto" : "productos"} con stock bajo`,
      href: "/payments?tab=products",
    });
  }
  if (todayClasses.length > 0) {
    items.push({
      key: "clases",
      icon: <CalendarBlankIcon />,
      node: `${todayClasses.length} ${todayClasses.length === 1 ? "clase" : "clases"} hoy`,
      href: "/classes/agenda",
    });
  }
  if (birthdaysToday.length > 0) {
    items.push({
      key: "cumple",
      icon: <CakeIcon />,
      node: `Cumple hoy: ${birthdaysToday.map((b) => b.full_name).join(", ")}`,
    });
  }
  if (items.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-1.5 [&_svg]:size-[15px]">
          {it.icon}
          {it.href ? (
            <Link href={it.href} className="hover:text-ink hover:underline">
              {it.node}
            </Link>
          ) : (
            it.node
          )}
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { data, loading, error } = useDashboardData();
  const { can } = useCan();
  // Recepción cobra pero no ve la plata del día.
  const canMoney = can(P.PAYMENTS_READ);
  const canReports = can(P.REPORTS_READ);
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
        icon={<WarningCircleIcon className="size-10" style={{ color: "var(--signal-danger)" }} />}
        title="No pudimos cargar el panel"
        description={`${error}. Revisa tu conexión y recarga la página.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hoy"
        action={
          <>
            <Link href="/members" className={buttonVariants({ variant: "outline" })}>
              <PlusIcon weight="bold" /> Nuevo socio
            </Link>
            <Link href="/payments?tab=pos" className={buttonVariants()}>
              <CashRegisterIcon weight="bold" /> Cobrar
            </Link>
          </>
        }
      />

      <OnboardingTour />
      <div data-tour="checklist">
        <OnboardingChecklist />
      </div>

      <DayCard entries={entries} occupancy={data.occupancy} />

      <MoneyStrip data={data} canMoney={canMoney} canReports={canReports} />

      <div className="grid items-stretch gap-6 lg:grid-cols-12">
        <ExpiringWeek data={data} className={cn(canReports ? "lg:col-span-7" : "lg:col-span-12")} />
        {canReports && <RiskBlock data={data} className="lg:col-span-5" />}
      </div>

      <StatusLine data={data} />
    </div>
  );
}
