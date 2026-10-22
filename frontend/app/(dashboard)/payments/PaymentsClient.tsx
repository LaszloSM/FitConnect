"use client";

import { UnderlineTabs } from "@/components/motion/UnderlineTabs";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PosTab } from "./PosTab";
import { HistoryTab } from "./HistoryTab";
import { ReceivablesTab } from "./ReceivablesTab";
import { ProductsTab } from "./ProductsTab";
import { DayPassTab } from "./DayPassTab";
import { HandCoinsIcon as HandCoins, ClockCounterClockwiseIcon as History, PackageIcon as Package, TicketIcon as Ticket, WalletIcon as Wallet, LightningIcon as Zap } from "@phosphor-icons/react";

type Tab = "pos" | "daypass" | "history" | "receivables" | "products";

const TABS: { key: Tab; label: string; icon: typeof Zap }[] = [
  { key: "pos", label: "Cobrar", icon: Zap },
  { key: "daypass", label: "Pase del día", icon: Ticket },
  { key: "history", label: "Historial", icon: History },
  { key: "receivables", label: "Por cobrar", icon: HandCoins },
  { key: "products", label: "Productos", icon: Package },
];

export default function PaymentsClient() {
  const searchParams = useSearchParams();
  const initialMember = searchParams.get("member") ?? undefined;
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    initialTab && TABS.some((t) => t.key === initialTab) ? (initialTab as Tab) : "pos"
  );
  const [posMember, setPosMember] = useState<string | undefined>(initialMember);
  // Cambia cuando el POS registra un cobro, para que el historial se refresque
  const [refreshSignal, setRefreshSignal] = useState(0);

  const collectFrom = (memberId: string) => {
    setPosMember(memberId);
    setTab("pos");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja"
        subtitle="Cobra renovaciones, pases del día y productos, y confirma las transferencias."
        action={
          <Link href="/payments/cash" className={buttonVariants({ variant: "outline" })}>
            <Wallet /> Turno de caja
          </Link>
        }
      />

      <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} label="Secciones de caja y pagos" />

      {tab === "pos" && (
        <PosTab preselectedMember={posMember} onCharged={() => setRefreshSignal((n) => n + 1)} />
      )}
      {tab === "daypass" && <DayPassTab onSold={() => setRefreshSignal((n) => n + 1)} />}
      {tab === "history" && <HistoryTab refreshSignal={refreshSignal} />}
      {tab === "receivables" && <ReceivablesTab onCollect={collectFrom} />}
      {tab === "products" && <ProductsTab />}
    </div>
  );
}
