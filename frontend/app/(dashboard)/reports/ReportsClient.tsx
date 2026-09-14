"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CalendarCheckIcon } from "@phosphor-icons/react";
import { PeriodPicker, periodFor, type Period } from "@/components/reports/PeriodPicker";
import { ExportButtons, downloadBlob } from "@/components/reports/shared";
import { IngresosTab } from "@/components/reports/IngresosTab";
import { VentasTab, PasesTab } from "@/components/reports/VentasPasesTabs";
import { SociosTab, AsistenciaTab } from "@/components/reports/SociosAsistenciaTabs";
import { RetencionTab, InteligenciaTab } from "@/components/reports/RetencionInteligenciaTabs";

type TabKey = "ingresos" | "ventas" | "pases" | "socios" | "asistencia" | "retencion" | "inteligencia";

const TABS: { key: TabKey; label: string; period: boolean; export: boolean }[] = [
  { key: "ingresos", label: "Ingresos", period: true, export: true },
  { key: "ventas", label: "Ventas", period: true, export: true },
  { key: "pases", label: "Pases", period: true, export: true },
  { key: "socios", label: "Socios", period: true, export: true },
  { key: "asistencia", label: "Asistencia", period: true, export: true },
  { key: "retencion", label: "Retención", period: false, export: true },
  { key: "inteligencia", label: "Inteligencia", period: true, export: false },
];

export default function ReportsClient() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabKey>(
    requested && TABS.some((t) => t.key === requested) ? (requested as TabKey) : "ingresos"
  );
  const [period, setPeriod] = useState<Period>(() => periodFor("month"));
  const [closing, setClosing] = useState(false);

  const tab = TABS.find((t) => t.key === activeTab)!;

  const monthClose = async () => {
    if (!session?.accessToken) return;
    setClosing(true);
    try {
      const client = apiClient(session.accessToken as string);
      const { data } = await client.get("/api/v1/reports/cierre/export.pdf", { params: { from: period.from }, responseType: "blob" });
      downloadBlob(data as Blob, `cierre-${period.from.slice(0, 7)}.pdf`);
    } catch {
      toast.error("No se pudo generar el cierre de mes");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        module="reports"
        title="Informe"
        subtitle="Ingresos, ventas, socios, asistencia y retención por período. Con la marca de tu gym en PDF y Excel."
        action={
          <Button onClick={() => void monthClose()} isLoading={closing} title="PDF de una pieza con todo el mes del período elegido">
            <CalendarCheckIcon weight="bold" /> Cierre de mes
          </Button>
        }
      />

      <div
        role="tablist"
        aria-label="Secciones del informe"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0"
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "relative flex h-11 shrink-0 items-center whitespace-nowrap px-3 text-sm outline-none transition-colors duration-150",
              "after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full",
              "focus-visible:rounded-[var(--radius-sm)] focus-visible:ring-2 focus-visible:ring-primary/40",
              activeTab === key ? "font-semibold text-ink after:bg-primary" : "font-medium text-ink-muted hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {tab.period ? <PeriodPicker value={period} onChange={setPeriod} /> : <p className="text-xs text-[var(--text-muted)]">Últimos 6 meses</p>}
        {tab.export && <ExportButtons tab={tab.key} period={tab.period ? period : null} label={tab.label.toLowerCase()} />}
      </div>

      <div key={activeTab}>
        {activeTab === "ingresos" && <IngresosTab period={period} />}
        {activeTab === "ventas" && <VentasTab period={period} />}
        {activeTab === "pases" && <PasesTab period={period} />}
        {activeTab === "socios" && <SociosTab period={period} />}
        {activeTab === "asistencia" && <AsistenciaTab period={period} />}
        {activeTab === "retencion" && <RetencionTab />}
        {activeTab === "inteligencia" && <InteligenciaTab period={period} />}
      </div>
    </div>
  );
}
