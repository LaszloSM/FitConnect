"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const SLIDES = [
  { id: "panel", label: "Hoy", path: "/dashboard", src: "/landing/panel.png", alt: "Panel del día: entradas, caja, transferencias por confirmar y membresías que vencen" },
  { id: "socios", label: "Socios", path: "/members", src: "/landing/socios.png", alt: "Lista de socios con estado de membresía, vencimiento y saldo" },
  { id: "cobro", label: "Cobro", path: "/payments", src: "/landing/cobro.png", alt: "Pantalla de cobro con búsqueda de socio y venta de productos" },
  { id: "asistencia", label: "Asistencia", path: "/reports?tab=asistencia", src: "/landing/asistencia.png", alt: "Entradas por día y mapa de calor por hora" },
  { id: "inteligencia", label: "Inteligencia", path: "/reports?tab=inteligencia", src: "/landing/inteligencia.png", alt: "Modelos del gimnasio comparados contra la regla simple" },
];
const EVERY_MS = 5500;

/**
 * Recorrido por pantallas reales del panel. Avanza solo, se pausa al pasar el
 * mouse o enfocar una pestaña, y con movimiento reducido no avanza ni anima.
 */
export function ProductTour() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = SLIDES[index];

  useEffect(() => {
    if (paused || reduce) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), EVERY_MS);
    return () => clearTimeout(t);
  }, [index, paused, reduce]);

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div role="tablist" aria-label="Pantallas del producto" className="mb-4 flex flex-wrap gap-2">
        {SLIDES.map((s, i) => {
          const on = i === index;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              aria-controls="tour-panel"
              onClick={() => setIndex(i)}
              className={`relative overflow-hidden rounded-[var(--radius-md)] px-3.5 py-2 text-sm font-medium transition-colors ${on ? "bg-panel text-ink shadow-[var(--shadow-card)]" : "text-ink-muted hover:text-ink"}`}
            >
              {s.label}
              {on && !reduce && !paused ? (
                <motion.span
                  key={`bar-${index}`}
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: EVERY_MS / 1000, ease: "linear" }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <figure id="tour-panel" role="tabpanel" aria-label={slide.label} className="overflow-hidden rounded-[var(--radius-xl)] bg-panel shadow-[var(--shadow-lg)] ring-1 ring-line/60">
        <div className="flex h-9 items-center gap-2 border-b border-line px-4" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[var(--border-base)]" />
          <span className="size-2.5 rounded-full bg-[var(--border-base)]" />
          <span className="size-2.5 rounded-full bg-[var(--border-base)]" />
        </div>
        <div className="relative aspect-[1440/900]">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={slide.id}
              className="absolute inset-0"
              initial={reduce ? false : { opacity: 0, scale: 1.01 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image src={slide.src} alt={slide.alt} fill preload={index === 0} className="object-cover object-top" sizes="(min-width: 1024px) 1100px, 100vw" />
            </motion.div>
          </AnimatePresence>
        </div>
      </figure>
    </div>
  );
}
