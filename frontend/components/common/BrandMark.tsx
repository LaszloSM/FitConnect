import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** Lado del cuadro en píxeles. */
  size?: number;
  className?: string;
}

/**
 * Slot del isotipo FitConnect.
 *
 * El logo está en rediseño: mientras llega, un monograma neutro que hereda los
 * tokens del tema. Cuando exista el definitivo, se reemplaza SOLO este archivo.
 */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-ink font-semibold text-surface select-none",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46), letterSpacing: "-0.04em" }}
    >
      F
    </span>
  );
}
