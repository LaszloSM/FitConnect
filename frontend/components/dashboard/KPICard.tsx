"use client";
import { motion } from "framer-motion";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KPICardProps {
  title: string;
  value: number;
  subtitle?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: number;
  trendLabel?: string;
  color?: "primary" | "success" | "warning" | "danger" | "blue" | "info";
  onClick?: () => void;
  icon?: React.ReactNode;
}

const iconCircleStyles: Record<string, { bg: string; text: string }> = {
  primary: { bg: "bg-orange-100 dark:bg-orange-950/30", text: "text-orange-500" },
  success: { bg: "bg-green-100 dark:bg-green-950/30",  text: "text-green-600 dark:text-green-400" },
  warning: { bg: "bg-amber-100 dark:bg-amber-950/30",  text: "text-amber-500" },
  danger:  { bg: "bg-red-100 dark:bg-red-950/30",      text: "text-red-500" },
  blue:    { bg: "bg-blue-100 dark:bg-blue-950/30",    text: "text-blue-500" },
  info:    { bg: "bg-blue-100 dark:bg-blue-950/30",    text: "text-blue-500" },
};

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
}: KPICardProps) {
  const circleStyle = iconCircleStyles[color] ?? iconCircleStyles.primary;

  return (
    <motion.div
      className={`surface-1 flex flex-col gap-1 p-5 ${onClick ? "cursor-pointer hover:shadow-card-hover transition-shadow duration-200" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
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
      {/* Top row: title + icon */}
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {title}
        </p>
        {icon && (
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${circleStyle.bg} ${circleStyle.text}`}
          >
            {icon}
          </div>
        )}
      </div>

      {/* Value row: number + trend */}
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-3xl font-bold font-mono text-[var(--text-base)] leading-none">
          <AnimatedNumber
            value={typeof value === "number" ? value : 0}
            prefix={prefix}
            suffix={suffix}
            decimals={decimals}
          />
        </span>
        {trend !== undefined && trend !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              trend > 0 ? "text-green-600" : "text-red-500"
            }`}
            aria-label={trendLabel ?? `${trend > 0 ? "up" : "down"} ${Math.abs(trend)}%`}
          >
            {trend > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
      )}
    </motion.div>
  );
}
