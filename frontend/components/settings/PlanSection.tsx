"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { Check, Zap, Star, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface GymData {
  plan: string | null;
}

interface PlanConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  features: string[];
}

const PLANS: PlanConfig[] = [
  {
    key: "basic",
    label: "Basic",
    icon: Zap,
    color: "text-blue-500",
    features: [
      "Hasta 100 miembros",
      "Pagos y check-ins",
      "Clases y máquinas",
      "Reportes básicos",
    ],
  },
  {
    key: "advanced",
    label: "Advanced",
    icon: Star,
    color: "text-[var(--color-primary)]",
    features: [
      "Miembros ilimitados",
      "Todo lo de Basic",
      "Exportación de datos",
      "Soporte prioritario",
    ],
  },
  {
    key: "premium_ai",
    label: "Premium AI",
    icon: Crown,
    color: "text-purple-500",
    features: [
      "Todo lo de Advanced",
      "Análisis con IA",
      "Predicción de churn",
      "Recomendaciones automáticas",
    ],
  },
];

export default function PlanSection() {
  const { data: session } = useSession();
  const [gymData, setGymData] = useState<GymData | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/settings/gym").then((res) => {
      setGymData(res.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const currentPlan = gymData?.plan ?? null;

  return (
    <div className="space-y-4">
      {PLANS.map((plan) => {
        const Icon = plan.icon;
        const isActive = currentPlan === plan.key;

        return (
          <GlassCard
            key={plan.key}
            className={cn(
              "p-5 transition-all duration-200",
              isActive && "ring-2 ring-[var(--color-primary)]"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                    isActive
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                      : "bg-[var(--bg-base)] border border-[var(--border-base)]"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-[var(--color-primary-contrast)]" : plan.color)} aria-hidden="true" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[var(--text-base)] font-semibold">{plan.label}</p>
                    {isActive && (
                      <span className="px-2 py-0.5 bg-[var(--color-primary-muted)] dark:bg-[var(--color-primary)]/30 text-[var(--color-primary)] dark:text-[var(--color-primary)] text-xs rounded-full font-medium">
                        Activo
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <Check className="h-3 w-3 text-green-500 shrink-0" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {!isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  onClick={() => {
                    // Placeholder — upgrade flow would open here
                  }}
                >
                  Actualizar
                </Button>
              )}
            </div>
          </GlassCard>
        );
      })}

      <p className="text-[var(--text-muted)] text-xs text-center pt-2">
        Para cambiar de plan contacta a soporte o visita el portal de facturación.
      </p>
    </div>
  );
}
