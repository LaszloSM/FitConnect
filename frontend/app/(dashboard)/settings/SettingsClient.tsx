"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/common/PageHeader";
import { cn } from "@/lib/utils";
import { UserIcon as User, BuildingsIcon as Building2, CreditCardIcon as CreditCard, PaletteIcon as Palette, SlidersHorizontalIcon as SlidersHorizontal, PlugIcon as Plug, DevicesIcon as MonitorSmartphone, BankIcon as Landmark, UsersIcon as Users, TicketIcon as Ticket, ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react";
import { P, useCan, type Permission } from "@/lib/permissions";

// Imports estáticos a propósito. Con `next/dynamic` y sin fallback, un chunk que
// no llegaba (típico tras un despliegue: el navegador conserva el HTML viejo y
// pide chunks que ya no existen) dejaba el área de contenido en NEGRO para
// siempre, sin error visible. Configuración era la única pantalla con carga
// perezosa y la única que se quedaba en blanco.
import ProfileSection from "@/components/settings/ProfileSection";
import GymSection from "@/components/settings/GymSection";
import OperationsSection from "@/components/settings/OperationsSection";
import BillingSection from "@/components/settings/BillingSection";
import IntegrationsSection from "@/components/settings/IntegrationsSection";
import PlanSection from "@/components/settings/PlanSection";
import AppearanceSection from "@/components/settings/AppearanceSection";
import KioskSection from "@/components/settings/KioskSection";
import TeamSection from "@/components/settings/TeamSection";
import DayPassSection from "@/components/settings/DayPassSection";
import SecuritySection from "@/components/settings/SecuritySection";

type TabKey = "profile" | "security" | "gym" | "operations" | "billing" | "daypass" | "kiosk" | "integrations" | "team" | "plan" | "appearance";
const TAB_KEYS: TabKey[] = ["profile", "security", "gym", "operations", "billing", "daypass", "kiosk", "integrations", "team", "plan", "appearance"];

interface Tab {
  key: TabKey;
  label: string;
  icon: React.ElementType;
  /** Capacidad que exige la pestaña. Recepción veía seis que le respondían 403. */
  needs?: Permission;
}

const TABS: Tab[] = [
  // Perfil y Apariencia son de la propia cuenta: no exigen nada.
  { key: "profile",       label: "Perfil",          icon: User },
  { key: "security",      label: "Seguridad",       icon: ShieldCheck },
  { key: "gym",           label: "Gimnasio",         icon: Building2,           needs: P.SETTINGS_PROFILE },
  { key: "operations",    label: "Operación",        icon: SlidersHorizontal,   needs: P.SETTINGS_WRITE },
  { key: "billing",       label: "Recaudo",          icon: Landmark,            needs: P.SETTINGS_READ },
  { key: "daypass",       label: "Pases",            icon: Ticket,              needs: P.DAY_PASSES_WRITE },
  { key: "kiosk",         label: "Dispositivos",     icon: MonitorSmartphone,   needs: P.KIOSK_MANAGE },
  { key: "integrations",  label: "Integraciones",    icon: Plug,                needs: P.SETTINGS_SECRETS },
  { key: "team",          label: "Equipo",           icon: Users,               needs: P.USERS_READ },
  { key: "plan",          label: "Plan",             icon: CreditCard,          needs: P.SETTINGS_READ },
  { key: "appearance",    label: "Apariencia",       icon: Palette },
];

const SECTION_MAP: Record<TabKey, React.ComponentType> = {
  profile:       ProfileSection,
  security:      SecuritySection,
  gym:           GymSection,
  operations:    OperationsSection,
  billing:       BillingSection,
  daypass:       DayPassSection,
  kiosk:         KioskSection,
  integrations:  IntegrationsSection,
  team:          TeamSection,
  plan:          PlanSection,
  appearance:    AppearanceSection,
};

export default function SettingsClient() {
  const { can, ready } = useCan();
  const visibleTabs = TABS.filter((tab) => !tab.needs || can(tab.needs));
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const [wantedTab, setWantedTab] = useState<TabKey>(
    requested && TAB_KEYS.includes(requested as TabKey) ? (requested as TabKey) : "profile"
  );

  // Llegar por URL a una pestaña que no le corresponde devolvía una pantalla de
  // errores. Se resuelve en el render, no con un efecto que corrige el estado
  // después: eso encadena un render de más y deja ver la pestaña un instante.
  const activeTab: TabKey =
    !ready || visibleTabs.some((t) => t.key === wantedTab) ? wantedTab : "profile";

  const ActiveSection = SECTION_MAP[activeTab];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
      className="space-y-6"
    >
      <PageHeader module="settings" title="Ajustes" subtitle="Tu gimnasio, tu equipo y tu cuenta." />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar tabs */}
        <nav
          className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:w-52 shrink-0"
          aria-label="Secciones de configuración"
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setWantedTab(tab.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-muted text-ink"
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
