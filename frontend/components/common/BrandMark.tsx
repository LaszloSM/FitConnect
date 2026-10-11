import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** Ancho en píxeles; el alto sale de la proporción del isotipo (~1.53:1). */
  size?: number;
  className?: string;
}

const VIEWBOX = "-0.8 -0.8 57.6 37.6";
const RATIO = 37.6 / 57.6;
export const ISO_PATH = "M18.0 0A18.0 18.0 0 0 0 18.0 36.0L21.525 36.0L26.075 29.0L18.0 29.0A11.0 11.0 0 0 1 18.0 7.0L25.525 7.0L30.075 0ZM38.0 36.0A18.0 18.0 0 0 0 38.0 0L34.475 0L29.925 7.0L38.0 7.0A11.0 11.0 0 0 1 38.0 29.0L30.475 29.0L25.925 36.0Z";

/**
 * Isotipo LSMFit: dos "C" cortadas en diagonal, simétricas por rotación, con
 * un nodo en el centro. Lo genera `docs/brand/lsmfit.py`.
 *
 * Una sola tinta en `currentColor`: el naranja del logo sobre las superficies
 * del producto y blanco sobre las superficies oscuras fijas (kiosko, pantalla).
 * El trazo fino del mismo color redondea las esquinas como en el dibujo.
 */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      viewBox={VIEWBOX}
      width={size}
      height={Math.round(size * RATIO)}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0 text-logo", className)}
    >
      <path d={ISO_PATH} fill="currentColor" stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round" />
      <circle cx="28.0" cy="18.0" r="7.3" fill="currentColor" />
    </svg>
  );
}
