"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Cifra cuyos dígitos ruedan al cambiar (idea de "Sliding Number" de Motion
 * Primitives, MIT). Cada dígito es una columna 0-9 pintada por CSS
 * (`.roll-digit`), así el texto que leen el lector de pantalla y las pruebas es
 * solo el valor real. La primera vez aparece quieto: rueda cuando cambia.
 */
export function RollingNumber({ value, className }: { value: string; className?: string }) {
  const chars = [...value];
  // Si cambia la forma (más dígitos, otro separador) las columnas se rehacen; si
  // no, las mismas columnas se desplazan y los dígitos ruedan.
  const shape = chars.map((c) => (/\d/.test(c) ? "d" : c)).join("");

  const root = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const cols = root.current?.querySelectorAll<HTMLElement>(".roll-digit > span");
    if (!cols) return;
    let k = 0;
    for (const c of value) {
      if (!/\d/.test(c)) continue;
      const col = cols[k++];
      if (col) col.style.transform = `translateY(${-1.05 * Number(c)}em)`;
    }
  }, [value]);

  return (
    <span className={cn("roll", className)} ref={root}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex" key={shape}>
        {chars.map((c, i) =>
          /\d/.test(c) ? (
            <span className="roll-digit" key={i}>
              <span />
            </span>
          ) : (
            <span className="roll-char" key={i}>{c}</span>
          ),
        )}
      </span>
    </span>
  );
}
