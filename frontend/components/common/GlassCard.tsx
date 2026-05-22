"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  glow?: boolean;
  elevated?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard({ children, className, onClick, glow = false, elevated = false }, ref) {
    return (
      <div
        ref={ref}
        onClick={onClick}
        className={cn(
          elevated ? "surface-2" : "surface-1",
          glow && "shadow-glow",
          onClick && "cursor-pointer hover:shadow-card-hover transition-shadow duration-200",
          className
        )}
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
