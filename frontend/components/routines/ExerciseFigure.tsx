"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ExerciseMediaSource {
  images?: string[];
  video_url?: string | null;
  video_source?: string | null;
  video_author?: string | null;
  video_license?: string | null;
}

const SIZES = { sm: "h-14 w-14", md: "h-24 w-24", lg: "h-64 w-64" } as const;

/**
 * El movimiento del ejercicio, con cadena de respaldo:
 * video del gym → video del catálogo → las dos fotos en fundido.
 *
 * Las fotos son solo inicio y fin: alternarlas con corte seco se ve como dos
 * diapositivas. Con fundido largo y un acercamiento mínimo el ojo lee una
 * transición continua, que es lo más cerca del movimiento real que se puede
 * llegar con dos fotogramas.
 */
export function ExerciseFigure({
  images = [],
  videoUrl,
  alt,
  className,
  intervalMs = 1400,
  size = "md",
  playable = false,
}: {
  images?: string[];
  videoUrl?: string | null;
  alt: string;
  className?: string;
  intervalMs?: number;
  size?: keyof typeof SIZES;
  /** Muestra controles (pausa y velocidad). Solo tiene sentido en la vista grande. */
  playable?: boolean;
}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  // Un códec que el navegador no abre (p.ej. HEVC) dejaría un cuadro negro:
  // si el video falla, se cae a las fotos sin que nadie lo note.
  const [videoBroken, setVideoBroken] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dims = SIZES[size] ?? SIZES.md;
  const video = videoBroken ? null : videoUrl;

  useEffect(() => setVideoBroken(false), [videoUrl]);

  useEffect(() => {
    if (video || images.length < 2 || !playing) return;
    const t = setInterval(() => setI((x) => (x + 1) % images.length), intervalMs / speed);
    return () => clearInterval(t);
  }, [video, images.length, intervalMs, playing, speed]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    if (playing) void v.play().catch(() => {});
    else v.pause();
  }, [playing, speed, video]);

  if (video) {
    return (
      <div className={cn("relative overflow-hidden rounded-xl bg-black", dims, className)}>
        <video
          ref={videoRef}
          src={video}
          poster={images[0]}
          onError={() => setVideoBroken(true)}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-label={alt}
          className="h-full w-full object-contain"
        />
        {playable && <Controls playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className={cn("rounded-xl bg-[var(--bg-muted)] flex items-center justify-center text-[var(--text-muted)] text-[10px]", dims, className)}>
        Sin imagen
      </div>
    );
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
          style={{ transitionDuration: `${Math.round((intervalMs * 0.7) / speed)}ms` }}
          className={cn(
            "absolute inset-0 h-full w-full object-contain transition-all ease-in-out",
            idx === i ? "opacity-100 scale-100" : "opacity-0 scale-[1.04]"
          )}
        />
      ))}
      {playable && images.length > 1 && (
        <Controls playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />
      )}
    </div>
  );
}

function Controls({
  playing, setPlaying, speed, setSpeed,
}: {
  playing: boolean; setPlaying: (v: boolean) => void; speed: number; setSpeed: (v: number) => void;
}) {
  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 backdrop-blur">
      <button
        type="button"
        onClick={() => setPlaying(!playing)}
        className="text-white text-xs px-2 py-0.5 rounded-full hover:bg-white/20"
      >
        {playing ? "Pausa" : "Seguir"}
      </button>
      {[0.5, 1, 1.5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setSpeed(s)}
          className={cn(
            "text-xs px-1.5 py-0.5 rounded-full",
            speed === s ? "bg-[#D4FF00] text-black font-semibold" : "text-white/70 hover:bg-white/20"
          )}
        >
          {s}×
        </button>
      ))}
    </div>
  );
}

/** Búsqueda del ejercicio en YouTube: cobertura total sin hospedar nada. */
export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`como hacer ${name} tecnica`)}`;
}
