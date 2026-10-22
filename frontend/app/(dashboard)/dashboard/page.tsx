"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CakeIcon, CalendarBlankIcon, LockIcon, PackageIcon, WarningCircleIcon, WrenchIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/common/EmptyState";
import { SegmentedControl } from "@/components/motion/SegmentedControl";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { OnboardingTour } from "@/components/dashboard/OnboardingTour";
import { SecurityNudge } from "@/components/security/SecurityNudge";
import { useLiveEntries } from "@/components/dashboard/LiveNowStrip";
import { DayCard, dayStats } from "@/components/dashboard/hoy/DayCard";
import { CollectedCard, type Period } from "@/components/dashboard/hoy/CollectedCard";
import { TodayQuad } from "@/components/dashboard/hoy/TodayQuad";
import { RevenueMonths } from "@/components/dashboard/hoy/RevenueMonths";
import { RecentActivity } from "@/components/dashboard/hoy/RecentActivity";
import { ExpiringWeek } from "@/components/dashboard/hoy/ExpiringWeek";
import { RiskBlock } from "@/components/dashboard/hoy/RiskBlock";
import { useDashboardData, type DashboardData } from "@/hooks/useDashboardData";
import { P, useCan } from "@/lib/permissions";
import { formatCOP, formatDateTime, gymHour, todayInGym } from "@/lib/format";
import { cn } from "@/lib/utils";

/** El esqueleto reproduce la rejilla real: al llegar los datos nada se mueve. */
function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando el panel">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-4 w-80" />
        </div>
        <div className="skeleton hidden h-11 w-40 rounded-full md:block" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="skeleton h-[300px] rounded-[var(--radius-lg)]" />
        <div className="skeleton h-[300px] rounded-[var(--radius-lg)]" />
        <div className="skeleton h-[300px] rounded-[var(--radius-lg)]" />
      </div>
      <div className="skeleton h-[340px] rounded-[var(--radius-lg)]" />
    </div>
  );
}

/** Saludo según la hora del gimnasio (Bogotá), no la del navegador. */
function greeting(): string {
  const h = gymHour();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
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
  const [period, setPeriod] = useState<Period>("hoy");

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

  const stats = dayStats(entries, data.occupancy);
  const expiring = data.operations?.expiring_this_week ?? [];
  const firstName = (session?.user?.name ?? "").trim().split(/\s+/)[0];
  const monthName = format(todayInGym(), "MMMM", { locale: es });

  // El hallazgo del día va bajo el saludo: lo primero que pide acción.
  let finding: React.ReactNode = null;
  if (expiring.length > 0) {
    finding = (
      <>
        <b className="font-semibold text-ink">
          {expiring.length} {expiring.length === 1 ? "socio vence" : "socios vencen"} esta semana
        </b>
        . Cóbralos antes de que se vayan.
      </>
    );
  } else if (data.pendingTransfers.length > 0) {
    finding = (
      <>
        <b className="font-semibold text-ink">
          {data.pendingTransfers.length} {data.pendingTransfers.length === 1 ? "transferencia" : "transferencias"} por confirmar
        </b>{" "}
        por {formatCOP(data.pendingTransfers.reduce((a, p) => a + Number(p.amount), 0))}.
      </>
    );
  } else if (data.insights[0]) {
    finding = data.insights[0].text;
  }

  // En el celular la puerta va primero (organización B); en escritorio, lo cobrado (C).
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.025em] text-ink md:text-[32px]">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          {finding && <p className="mt-1.5 max-w-[70ch] text-[15px] text-ink-muted [text-wrap:pretty]">{finding}</p>}
        </div>
        {canMoney && (
          <SegmentedControl<Period>
            label="Período de lo cobrado"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "hoy", label: "Hoy" },
              { value: "mes", label: "Este mes" },
            ]}
            className="self-start md:self-auto"
          />
        )}
      </div>

      <OnboardingTour />
      <SecurityNudge />
      <div data-tour="checklist">
        <OnboardingChecklist />
      </div>

      <div className={cn("order-2 grid gap-4 md:order-none", canReports ? "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.15fr)]" : "lg:grid-cols-2")}>
        <CollectedCard data={data} period={period} canMoney={canMoney} canReports={canReports} monthName={monthName} />
        <TodayQuad data={data} entriesCount={stats.allowed.length} typicalSoFar={stats.typicalSoFar} canMoney={canMoney} />
        {canReports && <RevenueMonths data={data} />}
      </div>

      <div className="order-1 md:order-none">
        <DayCard entries={entries} occupancy={data.occupancy} />
      </div>

      <div id="vencen" className="order-3 grid scroll-mt-24 md:order-none items-stretch gap-4 lg:grid-cols-12">
        <ExpiringWeek data={data} className={cn(canReports ? "lg:col-span-7" : "lg:col-span-12")} />
        {canReports && <RiskBlock data={data} className="lg:col-span-5" />}
      </div>

      {canMoney && (
        <div className="order-4 md:order-none">
          <RecentActivity data={data} />
        </div>
      )}

      <div className="order-5 md:order-none">
        <StatusLine data={data} />
      </div>
    </div>
  );
}
