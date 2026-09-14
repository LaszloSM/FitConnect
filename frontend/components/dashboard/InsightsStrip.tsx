"use client";

import Link from "next/link";
import { TrendUpIcon as TrendingUp, TrendDownIcon as TrendingDown, WarningIcon as AlertTriangle, ArrowRightIcon as ArrowRight } from "@phosphor-icons/react";
import { Panel } from "./Panel";

type Tone = "positive" | "negative" | "warning";

interface Insight {
  tone: Tone;
  text: string;
  href?: string;
}

const TONE: Record<Tone, { icon: typeof TrendingUp; color: string }> = {
  positive: { icon: TrendingUp, color: "var(--signal-ok)" },
  negative: { icon: TrendingDown, color: "var(--signal-danger)" },
  warning: { icon: AlertTriangle, color: "var(--signal-warn)" },
};

/** Lo que el modelo del gimnasio detectó hoy. Sin lecturas, no ocupa espacio. */
export function InsightsStrip({ insights, className }: { insights: Insight[]; className?: string }) {
  if (insights.length === 0) return null;

  return (
    <Panel className={className} title="Para tener en cuenta" action={{ href: "/reports?tab=inteligencia", label: "Inteligencia" }}>
      <ul className="divide-y divide-line">
        {insights.map((ins, i) => {
          const { icon: Icon, color } = TONE[ins.tone];
          const body = (
            <>
              <Icon className="size-4 shrink-0" style={{ color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm text-ink">{ins.text}</span>
              {ins.href && <ArrowRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />}
            </>
          );
          return (
            <li key={i}>
              {ins.href ? (
                <Link href={ins.href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted">
                  {body}
                </Link>
              ) : (
                <div className="flex min-h-12 items-center gap-3 px-4 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
