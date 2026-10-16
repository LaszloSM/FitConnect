"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useEffect, useState } from "react";

const SLIDES = [
  { id: "socios", label: "Socios", text: "Quién está al día, quién vence pronto y quién debe, con filtros y búsqueda por cédula.", src: "/landing/socios.webp", alt: "Lista de socios con estado de membresía, vencimiento y saldo" },
  { id: "ficha", label: "Ficha del socio", text: "Membresías, pagos, entradas, rutina y autorizaciones de una persona en una sola pantalla.", src: "/landing/ficha.webp", alt: "Ficha de un socio con su membresía, pagos y asistencia" },
  { id: "maquinas", label: "Máquinas", text: "Cada máquina con su mantenimiento al día o vencido, garantía e historial de daños.", src: "/landing/maquinas.webp", alt: "Inventario de máquinas con su estado de mantenimiento" },
  { id: "productos", label: "Productos", text: "Bebidas, suplementos y accesorios con su stock: se descuenta al vender en caja y te avisa cuando algo se está acabando.", src: "/landing/productos.webp", alt: "Inventario de productos con precio, stock y alertas de stock bajo" },
];
const EVERY_MS = 6000;

/**
 * Recorrido por más pantallas del panel. Avanza solo, se pausa con el mouse
 * encima o al enfocar una pestaña, se desliza con el dedo, y con movimiento
 * reducido no avanza ni anima.
 */
export function ProductTour() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = SLIDES[index];
  const go = (d: number) => setIndex((i) => (i + d + SLIDES.length) % SLIDES.length);

  useEffect(() => {
    if (paused || reduce) return;
    const t = setTimeout(() => go(1), EVERY_MS);
    return () => clearTimeout(t);
  }, [index, paused, reduce]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 60) go(info.offset.x < 0 ? 1 : -1);
  };

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div
        role="tablist"
        aria-label="Más pantallas del panel"
        className="-mx-5 mb-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {SLIDES.map((s, i) => {
          const on = i === index;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              aria-controls="tour-panel"
              onClick={() => setIndex(i)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              className={`relative min-h-11 shrink-0 overflow-hidden rounded-[var(--radius-md)] px-4 text-sm font-medium transition-colors ${on ? "bg-panel text-ink shadow-[var(--shadow-card)]" : "text-ink-muted hover:bg-muted hover:text-ink"}`}
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

      <p className="mb-5 min-h-[3em] max-w-2xl text-[15px] leading-relaxed text-ink-muted" aria-live="polite">
        {slide.text}
      </p>

      <figure id="tour-panel" role="tabpanel" aria-label={slide.label} className="overflow-hidden rounded-[var(--radius-xl)] bg-panel shadow-[var(--shadow-lg)] ring-1 ring-line/70">
        <motion.div
          className="relative aspect-[1440/900] touch-pan-y"
          drag={reduce ? false : "x"}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={onDragEnd}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={slide.id}
              className="absolute inset-0"
              initial={reduce ? false : { opacity: 0, scale: 1.015 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            >
              <Image src={slide.src} alt={slide.alt} fill draggable={false} className="pointer-events-none select-none object-cover object-top" sizes="(min-width: 1152px) 1100px, 100vw" />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </figure>
    </div>
  );
}
