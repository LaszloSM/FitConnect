"use client";

import { useEffect, useState } from "react";

import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { cn } from "@/lib/utils";
import { Sun, Moon, Monitor } from "lucide-react";

type ThemeOption = "light" | "dark" | "system";

interface ThemeChoice {
  key: ThemeOption;
  label: string;
  icon: React.ElementType;
  description: string;
}

const THEMES: ThemeChoice[] = [
  {
    key: "light",
    label: "Claro",
    icon: Sun,
    description: "Interfaz con fondo blanco y texto oscuro",
  },
  {
    key: "dark",
    label: "Oscuro",
    icon: Moon,
    description: "Interfaz con fondo oscuro, ideal para uso nocturno",
  },
  {
    key: "system",
    label: "Sistema",
    icon: Monitor,
    description: "Sigue la preferencia de tu sistema operativo",
  },
];

export default function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  // El tema solo se conoce en el cliente: marcar la opción activa antes de
  // montar rompe la hidratación (ver Header).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <GlassCard className="p-6">
      <p className="text-[var(--text-base)] font-semibold mb-1">Apariencia</p>
      <p className="text-[var(--text-muted)] text-sm mb-5">
        Elige cómo se ve FitConnect en tu dispositivo.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {THEMES.map((t) => {
          const Icon = t.icon;
          const isActive = mounted && theme === t.key;

          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTheme(t.key)}
              aria-pressed={isActive}
              className={cn(
                "relative flex flex-col items-center gap-3 p-4 rounded-xl border transition-all duration-200 text-center",
                isActive
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)] dark:bg-[var(--color-primary)]/20 shadow-sm"
                  : "border-[var(--border-base)] bg-[var(--bg-base)] hover:border-[var(--color-primary)]"
              )}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${t.key}-${isActive}`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    isActive
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                      : "bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-muted)]"
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </motion.div>
              </AnimatePresence>

              <div>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    isActive ? "text-[var(--color-primary-hover)] dark:text-[var(--color-primary-ink)]" : "text-[var(--text-base)]"
                  )}
                >
                  {t.label}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-snug">
                  {t.description}
                </p>
              </div>

              {isActive && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[var(--color-primary)]" />
              )}
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}
