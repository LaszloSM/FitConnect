"use client";

import { useState } from "react";

/**
 * Marco de captura de producto para la landing.
 *
 * Muestra el screenshot real `/public/screenshots/{name}.png` si existe; si no,
 * cae a un marco con etiqueta para que la landing nunca se vea rota mientras se
 * capturan las imágenes reales del producto (pase de verificación con la app en vivo).
 */
export function ProductShot({
  name,
  alt,
  caption,
  className = "",
}: {
  name: string;
  alt: string;
  caption?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <figure
      className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] ${className}`}
    >
      {failed ? (
        <div className="aspect-[16/10] w-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.04] to-transparent">
          <span className="text-xs uppercase tracking-[0.18em] text-white/30">{alt}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/screenshots/${name}.png`}
          alt={alt}
          onError={() => setFailed(true)}
          className="block w-full h-auto"
        />
      )}
      {caption && (
        <figcaption className="px-4 py-2.5 text-xs text-white/40 border-t border-white/5">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
