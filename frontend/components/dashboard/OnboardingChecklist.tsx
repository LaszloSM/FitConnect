"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/common/GlassCard";
import { apiClient } from "@/lib/api";
import { Check, Circle, ArrowRight, Rocket } from "lucide-react";

interface OnboardingStatus {
  has_plan: boolean;
  has_member: boolean;
  done: boolean;
}

interface Step {
  key: keyof Omit<OnboardingStatus, "done">;
  label: string;
  hint: string;
  href: string;
}

const STEPS: Step[] = [
  { key: "has_plan", label: "Crea tu primer plan", hint: "Define precios y duración", href: "/plans" },
  { key: "has_member", label: "Registra tu primer socio", hint: "Alta con cédula, salud y membresía", href: "/members" },
];

export function OnboardingChecklist() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client
      .get<OnboardingStatus>("/api/v1/onboarding/status")
      .then((res) => setStatus(res.data))
      .catch(() => {});
  }, [session?.accessToken]);

  // Se oculta cuando los pasos esenciales están completos (o si el dueño lo cierra)
  if (!status || status.done || dismissed) return null;

  const essentialDone = STEPS.filter((s) => status[s.key]).length;
  const pct = Math.round((essentialDone / STEPS.length) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <GlassCard className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-contrast)] flex items-center justify-center shrink-0">
              <Rocket className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-base)]">Pon tu gym en marcha</h3>
              <p className="text-xs text-[var(--text-muted)]">{essentialDone} de {STEPS.length} pasos esenciales</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("fitconnect:start-tour"))}
              className="text-xs font-medium text-[var(--color-primary-ink)] hover:underline"
            >
              Ver tutorial
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors"
            >
              Ocultar
            </button>
          </div>
        </div>

        <div className="h-1.5 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden mb-4">
          <motion.div
            className="h-full rounded-full bg-[var(--color-primary)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        <div className="space-y-1.5">
          {STEPS.map((step) => {
            const done = status[step.key];
            return (
              <Link
                key={step.key}
                href={step.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[var(--bg-muted)] transition-colors group"
              >
                {done ? (
                  <span className="h-5 w-5 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : (
                  <Circle className="h-5 w-5 text-[var(--text-muted)] shrink-0" strokeWidth={1.5} />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${done ? "text-[var(--text-muted)] line-through" : "text-[var(--text-base)] font-medium"}`}>
                    {step.label}
                  </p>
                  {!done && <p className="text-xs text-[var(--text-muted)]">{step.hint}</p>}
                </div>
                {!done && (
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--color-primary-ink)] group-hover:translate-x-0.5 transition-all shrink-0" />
                )}
              </Link>
            );
          })}
        </div>
      </GlassCard>
    </motion.div>
  );
}
