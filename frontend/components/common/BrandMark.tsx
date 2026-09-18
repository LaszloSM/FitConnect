import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** Ancho en píxeles; el alto sale de la proporción del isotipo (~1.55:1). */
  size?: number;
  className?: string;
}

/**
 * Isotipo FitConnect: dos arcos enfrentados unidos por un nodo central.
 *
 * Una sola tinta en `currentColor`, así que hereda el color del contexto: coral
 * sobre las superficies del producto, blanco sobre las superficies oscuras
 * fijas (kiosko, pantalla del salón). La proporción es apaisada; dentro de un
 * contenedor cuadrado se centra y deja aire arriba y abajo.
 */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 11 64 42"
      width={size}
      height={Math.round((size * 42) / 64)}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0 text-primary", className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round">
        <path d="M25.94 47.22 A16 16 0 1 1 25.94 16.78" />
        <path d="M38.06 47.22 A16 16 0 1 0 38.06 16.78" />
      </g>
      <circle cx="32" cy="32" r="5.5" fill="currentColor" />
    </svg>
  );
}
