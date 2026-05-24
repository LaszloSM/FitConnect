"use client";
import { useId } from "react";
import { motion } from "framer-motion";
import { type Variants } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";

// ── Inline sparkline ───────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const gradId = useId();
  if (data.length < 2) return null;

  const W = 72;
  const H = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return [x, y] as [number, number];
  });

  const line = `M ${pts.map(([x, y]) => `${x} ${y}`).join(" L ")}`;
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Color map ──────────────────────────────────────────────────────────────
const colorMap = {
  primary: {
    icon: "bg-orange-100 dark:bg-orange-950/30 text-orange-500",
    spark: "oklch(0.70 0.20 47)",
    trend: {
      up: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
      down: "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    },
  },
  success: {
    icon: "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400",
    spark: "#22C55E",
    trend: {
      up: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
      down: "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    },
  },
  warning: {
    icon: "bg-amber-100 dark:bg-amber-950/30 text-amber-500",
    spark: "#F59E0B",
    trend: {
      up: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
      down: "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    },
  },
  danger: {
    icon: "bg-red-100 dark:bg-red-950/30 text-red-500",
    spark: "#EF4444",
    trend: {
      up: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
      down: "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    },
  },
  blue: {
    icon: "bg-blue-100 dark:bg-blue-950/30 text-blue-500",
    spark: "#3B82F6",
    trend: {
      up: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
      down: "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    },
  },
  info: {
    icon: "bg-blue-100 dark:bg-blue-950/30 text-blue-500",
    spark: "#3B82F6",
    trend: {
      up: "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400",
      down: "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    },
  },
} as const;

// ── Props ──────────────────────────────────────────────────────────────────
interface KPICardProps {
  title: string;
  value: number;
  subtitle?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: number;
  trendLabel?: string;
  color?: keyof typeof colorMap;
  onClick?: () => void;
  icon?: React.ReactNode;
  sparklineData?: number[];
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 280, damping: 28 },
  },
};

// ── Component ──────────────────────────────────────────────────────────────
export function KPICard({
  title,
  value,
  subtitle,
  prefix = "",
  suffix = "",
  decimals = 0,
  trend,
  trendLabel,
  color = "primary",
  onClick,
  icon,
  sparklineData,
}: KPICardProps) {
  const style = colorMap[color] ?? colorMap.primary;
  const hasSpark = sparklineData && sparklineData.length >= 2;

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className={[
        "surface-1 flex flex-col overflow-hidden",
        onClick
          ? "cursor-pointer hover:shadow-[var(--shadow-card-elevated)] transition-shadow duration-200"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
    >
      {/* Main content */}
      <div className="p-5 flex-1">
        {/* Header: label + icon */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] leading-none">
            {title}
          </p>
          {icon && (
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.icon}`}
            >
              {icon}
            </div>
          )}
        </div>

        {/* Value row + sparkline */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[1.75rem] font-bold font-mono text-[var(--text-base)] leading-none tabular-nums">
              <AnimatedNumber
                value={typeof value === "number" ? value : 0}
                prefix={prefix}
                suffix={suffix}
                decimals={decimals}
              />
            </div>
            {subtitle && (
              <p className="text-xs text-[var(--text-muted)] mt-1.5">{subtitle}</p>
            )}
          </div>

          {hasSpark && (
            <div className="shrink-0 opacity-80">
              <Sparkline data={sparklineData} color={style.spark} />
            </div>
          )}
        </div>
      </div>

      {/* Trend footer — only when trend data present */}
      {trend !== undefined && trend !== 0 && (
        <div className="px-5 py-2.5 border-t border-[var(--border-base)] bg-[var(--bg-muted)]/40 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
              trend > 0 ? style.trend.up : style.trend.down
            }`}
            aria-label={
              trendLabel ?? `${trend > 0 ? "Subió" : "Bajó"} ${Math.abs(trend)}%`
            }
          >
            {trend > 0 ? (
              <TrendingUp size={11} className="shrink-0" />
            ) : (
              <TrendingDown size={11} className="shrink-0" />
            )}
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
          {trendLabel && (
            <span className="text-[11px] text-[var(--text-muted)]">{trendLabel}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
