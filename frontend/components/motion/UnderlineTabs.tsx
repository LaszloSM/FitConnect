"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useSlidingIndicator } from "./useSlidingIndicator";

/** Pestañas de sección con un subrayado que se desliza a la pestaña elegida. */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly { key: T; label: React.ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const ind = useSlidingIndicator<HTMLDivElement, HTMLSpanElement>(list, '[role="tab"][aria-selected="true"]', [value]);

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      // Scroll propio en móvil: las pestañas nunca empujan el ancho de la página.
      className={cn("relative -mx-4 flex gap-1 overflow-x-auto border-b border-line-soft px-4 [scrollbar-width:none] md:mx-0 md:px-0", className)}
    >
      {tabs.map(({ key, label: text }) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => !active && onChange(key)}
            className={cn(
              "relative flex h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium outline-none transition-colors duration-150",
              "focus-visible:rounded-[var(--radius-sm)] focus-visible:ring-2 focus-visible:ring-action/40",
              active ? "text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {text}
          </button>
        );
      })}
      <span ref={ind} aria-hidden="true" className="slide-ind bottom-0 left-0 h-0.5 w-px bg-action opacity-0" />
    </div>
  );
}
