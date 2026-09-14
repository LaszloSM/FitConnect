"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ActivityIcon as Activity, BrainIcon as Brain, CalendarBlankIcon as Calendar, CalendarCheckIcon as CalendarCheck, SpinnerGapIcon as Loader2, PackageIcon as Package, TicketIcon as Ticket, TrendUpIcon as TrendingUp, UsersIcon as Users } from "@phosphor-icons/react";
import { PeriodPicker, periodFor, type Period } from "@/components/reports/PeriodPicker";
import { ExportButtons, downloadBlob } from "@/components/reports/shared";
import { IngresosTab } from "@/components/reports/IngresosTab";
import { VentasTab, PasesTab } from "@/components/reports/VentasPasesTabs";
import { SociosTab, AsistenciaTab } from "@/components/reports/SociosAsistenciaTabs";
import { RetencionTab, InteligenciaTab } from "@/components/reports/RetencionInteligenciaTabs";

type TabKey = "ingresos" | "ventas" | "pases" | "socios" | "asistencia" | "retencion" | "inteligencia";

const TABS: { key: TabKey; label: string; icon: typeof TrendingUp; period: boolean; export: boolean }[] = [
  { key: "ingresos", label: "Ingresos", icon: TrendingUp, period: true, export: true },
  { key: "ventas", label: "Ventas", icon: Package, period: true, export: true },
  { key: "pases", label: "Pases", icon: Ticket, period: true, export: true },
  { key: "socios", label: "Socios", icon: Users, period: true, export: true },
  { key: "asistencia", label: "Asistencia", icon: Activity, period: true, export: true },
  { key: "retencion", label: "Retención", icon: Calendar, period: false, export: true },
  { key: "inteligencia", label: "Inteligencia", icon: Brain, period: true, export: false },
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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }} className="space-y-5">
      <PageHeader
        module="reports"
        title="Informe"
        subtitle="Ingresos, ventas, socios, asistencia y retención por período. Con la marca de tu gym en PDF y Excel."
        action={
          <button
            type="button"
            onClick={() => void monthClose()}
            disabled={closing}
            className="flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-md)] bg-primary text-primary-contrast text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            title="PDF de una pieza con todo el mes del período elegido"
          >
            {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
            Cierre de mes
          </button>
        }
      />

      <div className="flex gap-1 flex-wrap border-b border-[var(--border-base)]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors relative",
              activeTab === key ? "text-ink" : "text-[var(--text-muted)] hover:text-[var(--text-base)]"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {activeTab === key && <motion.span layoutId="reports-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--text-base)]" />}
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
    </motion.div>
  );
}
