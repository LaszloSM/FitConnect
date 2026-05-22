"use client";
import { forwardRef } from "react";

interface GlassCardProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  glow?: boolean;
  elevated?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard({ children, className = "", onClick, glow = false, elevated = false }, ref) {
    const surfaceClass = elevated ? "surface-2" : "surface-1";
    const glowClass = glow ? "ring-2 ring-orange-200" : "";
    const clickableClass = onClick
      ? "cursor-pointer hover:shadow-card-hover transition-shadow duration-200"
      : "";

    return (
      <div
        ref={ref}
        onClick={onClick}
        className={`${surfaceClass} ${glowClass} ${clickableClass} ${className}`}
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
  }
);
