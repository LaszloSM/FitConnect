"use client";

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
        className="mb-0"
        title="Caja y pagos"
        subtitle="Cobra renovaciones, pases del día y productos, y confirma las transferencias."
        action={
          <Link href="/payments/cash" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Wallet /> Turno de caja
          </Link>
        }
      />

      {/* Pestañas con scroll propio en móvil: nunca empujan el ancho de la página. */}
      <div
        role="tablist"
        aria-label="Secciones de caja y pagos"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn(
                "relative flex h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium outline-none transition-colors duration-150",
                "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full",
                "focus-visible:rounded-[var(--radius-sm)] focus-visible:ring-2 focus-visible:ring-primary/40",
                active ? "text-ink after:bg-primary" : "text-ink-muted hover:text-ink"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

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
