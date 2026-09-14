"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { CheckIcon as Check, ArrowRightIcon as ArrowRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

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
  { key: "has_plan", label: "Crea tu primer plan", hint: "Nombre, precio y duración de la membresía", href: "/plans" },
  { key: "has_member", label: "Registra tu primer socio", hint: "Cédula, cuestionario de salud y membresía", href: "/members" },
];

/** Primeros pasos de un gimnasio nuevo. Se va solo cuando están hechos. */
export function OnboardingChecklist() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiClient(session.accessToken as string)
      .get<OnboardingStatus>("/api/v1/onboarding/status")
      .then((res) => setStatus(res.data))
      .catch(() => {});
  }, [session?.accessToken]);

  if (!status || status.done || dismissed) return null;

  const hechos = STEPS.filter((s) => status[s.key]).length;

  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-panel">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">Pon tu gimnasio en marcha</h2>
          <p className="text-xs text-ink-muted">
            <span className="font-mono tabular-nums">{hechos} de {STEPS.length}</span> pasos listos
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("fitconnect:start-tour"))}
          className="text-sm font-medium text-primary-ink hover:underline"
        >
          Ver recorrido
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="text-sm text-ink-muted hover:text-ink">
          Ocultar
        </button>
      </header>
      <ol className="divide-y divide-line">
        {STEPS.map((step, i) => {
          const done = status[step.key];
          return (
            <li key={step.key}>
              <Link href={step.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs tabular-nums",
                    done ? "border-primary bg-primary text-primary-contrast" : "border-line text-ink-muted"
                  )}
                >
                  {done ? <Check className="size-3.5" weight="bold" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", done ? "text-ink-muted line-through" : "font-medium text-ink")}>
                    {step.label}
                  </span>
                  {!done && <span className="block text-xs text-ink-muted">{step.hint}</span>}
                </span>
                {!done && <ArrowRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
