"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { cn } from "@/lib/utils";
import { PosTab } from "./PosTab";
import { HistoryTab } from "./HistoryTab";
import { ReceivablesTab } from "./ReceivablesTab";
import { ProductsTab } from "./ProductsTab";
import { DayPassTab } from "./DayPassTab";
import { HandCoins, History, Package, Ticket, Wallet, Zap } from "lucide-react";

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
    initialTab && ["pos", "daypass", "history", "receivables", "products"].includes(initialTab) ? (initialTab as Tab) : "pos"
  );
  const [posMember, setPosMember] = useState<string | undefined>(initialMember);
  // Cambia cuando el POS registra un cobro, para que el historial se refresque
  const [refreshSignal, setRefreshSignal] = useState(0);

  const collectFrom = (memberId: string) => {
    setPosMember(memberId);
    setTab("pos");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <PageHeader
        module="payments"
        title="Caja y pagos"
        subtitle="Cobra renovaciones, pases del día y productos; concilia transferencias"
        action={
          <Link
            href="/payments/cash"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-base)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-base)] transition-colors"
          >
            <Wallet className="h-4 w-4" />
            Turno de caja
          </Link>
        }
      />

      <div className="flex gap-1 rounded-xl border border-[var(--border-base)] bg-[var(--bg-card)] p-1 w-fit max-w-full overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-ui",
              tab === key
                ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-base)]"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "pos" && (
        <PosTab
          preselectedMember={posMember}
          onCharged={() => setRefreshSignal((n) => n + 1)}
        />
      )}
      {tab === "daypass" && <DayPassTab onSold={() => setRefreshSignal((n) => n + 1)} />}
      {tab === "history" && <HistoryTab refreshSignal={refreshSignal} />}
      {tab === "receivables" && <ReceivablesTab onCollect={collectFrom} />}
      {tab === "products" && <ProductsTab />}
    </motion.div>
  );
}
