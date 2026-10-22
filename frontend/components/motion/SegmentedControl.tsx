"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/**
 * Selector de pocas opciones (período, vista). Debajo va la fila normal; encima,
 * una copia con el estilo activo recortada con `clip-path` a la opción elegida.
 * Al cambiar, el recorte se desliza y el color cambia sin que se crucen dos
 * estados (técnica de pestañas con clip-path de Emil Kowalski).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "md",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const row = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const r = row.current;
    const o = overlay.current;
    if (!r || !o) return;
    const place = () => {
      const b = r.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
      if (!b) {
        // Valor fuera de las opciones (un rango a mano): nada marcado.
        o.style.clipPath = "inset(0 100% 0 0)";
        return;
      }
      // Medidas subpíxel: con offsetLeft (entero) asomaba 1 px de la opción vecina.
      const rr = r.getBoundingClientRect();
      const bb = b.getBoundingClientRect();
      const left = bb.left - rr.left;
      const right = rr.right - bb.right;
      if (!placed.current) o.style.transition = "none";
      o.style.clipPath = `inset(0 ${right}px 0 ${left}px round 999px)`;
      if (!placed.current) {
        placed.current = true;
        requestAnimationFrame(() => requestAnimationFrame(() => (o.style.transition = "")));
      }
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(r);
    return () => ro.disconnect();
  }, [value]);

  const item = cn(
    "flex items-center justify-center whitespace-nowrap rounded-full font-medium",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm",
  );

  return (
    <div role="radiogroup" aria-label={label} className={cn("relative inline-grid rounded-full border border-line-soft bg-panel p-1", className)}>
      <div ref={row} className="relative grid auto-cols-fr grid-flow-col">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            data-value={o.value}
            onClick={() => o.value !== value && onChange(o.value)}
            className={cn(item, "text-ink-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40")}
          >
            {o.label}
          </button>
        ))}
        <div
          ref={overlay}
          aria-hidden="true"
          style={{ clipPath: "inset(0 100% 0 0)" }}
          className="pointer-events-none absolute inset-0 grid auto-cols-fr grid-flow-col transition-[clip-path] duration-[280ms] ease-[var(--ease-out)] motion-reduce:transition-none"
        >
          {options.map((o) => (
            <span key={o.value} className={cn(item, "bg-action text-action-ink")}>
              {o.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
