"use client";

import { BackspaceIcon as Delete } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export function NumericKeypad({
  onDigit,
  onClear,
  onBackspace,
  disabled,
}: {
  onDigit: (d: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-sm mx-auto">
      {KEYS.map((key) => {
        const isDigit = key !== "clear" && key !== "back";
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (key === "clear") onClear();
              else if (key === "back") onBackspace();
              else onDigit(key);
            }}
            className={cn(
              "h-16 sm:h-20 rounded-[var(--radius-xl)] font-mono text-2xl sm:text-3xl font-medium tabular-nums transition-transform duration-150 select-none",
              "active:scale-[0.97] disabled:opacity-40",
              isDigit
                ? "bg-white/10 text-white hover:bg-white/15 border border-white/10"
                : "bg-white/5 text-white/70 hover:bg-white/10 border border-white/5 font-sans text-base sm:text-lg"
            )}
          >
            {key === "clear" ? "Borrar" : key === "back" ? <Delete className="h-7 w-7 mx-auto" /> : key}
          </button>
        );
      })}
    </div>
  );
}
