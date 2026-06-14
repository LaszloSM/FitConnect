"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/common/PageHeader";
import { cn } from "@/lib/utils";
import { User, Building2, Bell, CreditCard, Palette, SlidersHorizontal, Plug, MonitorSmartphone, Landmark, MessageSquare } from "lucide-react";
import dynamic from "next/dynamic";

const ProfileSection      = dynamic(() => import("@/components/settings/ProfileSection"));
const GymSection          = dynamic(() => import("@/components/settings/GymSection"));
const OperationsSection   = dynamic(() => import("@/components/settings/OperationsSection"));
const BillingSection      = dynamic(() => import("@/components/settings/BillingSection"));
const IntegrationsSection = dynamic(() => import("@/components/settings/IntegrationsSection"));
const NotificationsSection = dynamic(() => import("@/components/settings/NotificationsSection"));
const PlanSection         = dynamic(() => import("@/components/settings/PlanSection"));
const AppearanceSection   = dynamic(() => import("@/components/settings/AppearanceSection"));
const KioskSection        = dynamic(() => import("@/components/settings/KioskSection"));
const MessagesSection     = dynamic(() => import("@/components/settings/MessagesSection"));

type TabKey = "profile" | "gym" | "operations" | "billing" | "kiosk" | "integrations" | "notifications" | "messages" | "plan" | "appearance";

interface Tab {
  key: TabKey;
  label: string;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { key: "profile",       label: "Perfil",          icon: User },
  { key: "gym",           label: "Gimnasio",         icon: Building2 },
  { key: "operations",    label: "Operación",        icon: SlidersHorizontal },
  { key: "billing",       label: "Recaudo",          icon: Landmark },
  { key: "kiosk",         label: "Kiosko",           icon: MonitorSmartphone },
  { key: "integrations",  label: "Integraciones",    icon: Plug },
  { key: "notifications", label: "Notificaciones",   icon: Bell },
  { key: "messages",      label: "Mensajes",         icon: MessageSquare },
  { key: "plan",          label: "Plan",             icon: CreditCard },
  { key: "appearance",    label: "Apariencia",       icon: Palette },
];

const SECTION_MAP: Record<TabKey, React.ComponentType> = {
  profile:       ProfileSection,
  gym:           GymSection,
  operations:    OperationsSection,
  billing:       BillingSection,
  kiosk:         KioskSection,
  integrations:  IntegrationsSection,
  notifications: NotificationsSection,
  messages:      MessagesSection,
  plan:          PlanSection,
  appearance:    AppearanceSection,
};

export default function SettingsClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  const ActiveSection = SECTION_MAP[activeTab];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <PageHeader module="settings" title="Configuración" subtitle="Ajustes del gym y tu cuenta" />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar tabs */}
        <nav
          className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:w-52 shrink-0"
          aria-label="Secciones de configuración"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-base)]"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content pane */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ type: "spring", stiffness: 300, damping: 30, duration: 0.2 }}
            >
              <ActiveSection />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
