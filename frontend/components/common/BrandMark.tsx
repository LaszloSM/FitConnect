"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** Pixel size of the square mark. */
  size?: number;
  className?: string;
}

/**
 * Isotipo FitConnect.
 *
 * Usa TU logo raster `/public/logo-mark.png` si existe; si no, cae al
 * isotipo vectorial `/public/fitconnect-mark.svg`.
 *
 * Para que se vea TAL CUAL tu logo: recorta solo el cuadrito verde con el "FC"
 * (sin el texto "FitConnect" debajo) y guárdalo como
 * `frontend/public/logo-mark.png` (fondo transparente, ~256x256).
 */
export function BrandMark({ size = 32, className }: BrandMarkProps) {
  const [src, setSrc] = useState("/logo-mark.png");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      onError={() => { if (src !== "/fitconnect-mark.svg") setSrc("/fitconnect-mark.svg"); }}
      alt="FitConnect"
      width={size}
      height={size}
      className={cn("rounded-lg object-contain shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}
