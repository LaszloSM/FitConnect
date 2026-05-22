"use client";
import { GlassCard } from "@/components/common/GlassCard";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { NeonBadge } from "@/components/common/NeonBadge";
import { TrendingUp, TrendingDown } from "lucide-react";

const variantMap: Record<string, string> = {
  primary: "#F97316",
  success: "#22C55E",
  warning: "#F59E0B",
  danger:  "#EF4444",
  blue:    "#3B82F6",
  info:    "#3B82F6",
  gold:    "#F59E0B",
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
}: {
  title: string;
  value: number;
  subtitle?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: number;
  trendLabel?: string;
  color?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}) {
  const colorHex = variantMap[color] ?? variantMap.primary;

  return (
    <GlassCard onClick={onClick} className="p-5" glow={!!onClick}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-text-muted text-sm font-medium">{title}</p>
        {icon && <div className="text-text-subtle">{icon}</div>}
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="font-display font-bold text-text-base text-3xl leading-none" style={{ color: colorHex }}>
          <AnimatedNumber
            value={typeof value === "number" ? value : 0}
            prefix={prefix}
            suffix={suffix}
            decimals={decimals}
          />
        </p>
        {trend !== undefined && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${
              trend >= 0 ? "text-green-600" : "text-red-500"
            }`}
          >
            {trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
      {subtitle && <p className="text-text-subtle text-xs mt-2">{subtitle}</p>}
      {trendLabel && (
        <div className="mt-3">
          <NeonBadge label={trendLabel} variant={trend && trend >= 0 ? "success" : "danger"} />
        </div>
      )}
    </GlassCard>
  );
}
