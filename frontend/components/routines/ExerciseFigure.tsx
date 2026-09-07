"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** El "muñequito": alterna las imágenes inicio/fin del ejercicio para mostrar
 * el movimiento. Con una sola imagen la muestra fija. */
export function ExerciseFigure({ images, alt, className, intervalMs = 900, size = "md" }: {
  images: string[];
  alt: string;
  className?: string;
  intervalMs?: number;
  size?: "sm" | "md" | "lg";
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % images.length), intervalMs);
    return () => clearInterval(t);
  }, [images.length, intervalMs]);
  const dims = size === "sm" ? "h-14 w-14" : size === "lg" ? "h-64 w-64" : "h-24 w-24";
  if (images.length === 0) {
    return <div className={cn("rounded-xl bg-[var(--bg-muted)] flex items-center justify-center text-[var(--text-muted)] text-[10px]", dims, className)}>Sin imagen</div>;
  }
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-white", dims, className)}>
      {images.map((src, idx) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={alt}
          loading="lazy"
          className={cn("absolute inset-0 h-full w-full object-contain transition-opacity duration-300", idx === i ? "opacity-100" : "opacity-0")}
        />
      ))}
    </div>
  );
}
