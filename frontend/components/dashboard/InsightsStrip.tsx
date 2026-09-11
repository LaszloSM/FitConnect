"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import { apiClient } from "@/lib/api";
import { TrendingUp, TrendingDown, AlertTriangle, Sparkles, ArrowRight } from "lucide-react";

type Tone = "positive" | "negative" | "warning";

interface Insight {
  tone: Tone;
  text: string;
  href?: string;
}

const TONE: Record<Tone, { icon: typeof TrendingUp; cls: string }> = {
  positive: { icon: TrendingUp, cls: "text-emerald-600 dark:text-emerald-400" },
  negative: { icon: TrendingDown, cls: "text-red-500" },
  warning: { icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400" },
};

export function InsightsStrip() {
  const { data: session } = useSession();
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client
      .get<{ insights: Insight[] }>("/api/v1/dashboard/insights")
      .then((res) => setInsights(res.data.insights))
      .catch(() => {});
  }, [session?.accessToken]);

  if (insights.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-[var(--text-muted)]">
        <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary-ink)]" />
        Lo que deberías saber hoy
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {insights.map((ins, i) => {
          const { icon: Icon, cls } = TONE[ins.tone];
          const body = (
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-base)] bg-[var(--bg-card)] px-3.5 py-3 hover:border-[var(--color-primary)]/40 transition-colors group h-full">
              <Icon className={`h-4 w-4 shrink-0 ${cls}`} />
              <p className="text-sm text-[var(--text-base)] flex-1 min-w-0">{ins.text}</p>
              {ins.href && (
                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--color-primary-ink)] group-hover:translate-x-0.5 transition-all shrink-0" />
              )}
            </div>
          );
          return ins.href ? (
            <Link key={i} href={ins.href}>{body}</Link>
          ) : (
            <div key={i}>{body}</div>
          );
        })}
      </div>
    </motion.div>
  );
}
