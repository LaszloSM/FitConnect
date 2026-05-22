"use client";
import { forwardRef } from "react";

export const GlassCard = forwardRef(function GlassCard(
  { children, className = "", onClick, glow = false }: {
    children?: React.ReactNode;
    className?: string;
    onClick?: () => void;
    glow?: boolean;
  },
  ref: React.Ref<HTMLDivElement>
) {
  const glowClass = glow ? "ring-2 ring-orange-200" : "";
  const clickableClass = onClick
    ? "cursor-pointer hover:shadow-card-hover transition-shadow duration-200"
    : "";

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-xl shadow-card ${glowClass} ${clickableClass} ${className}`}
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
      {children}
    </div>
  );
});
