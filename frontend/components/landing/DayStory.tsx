"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckIcon as Check } from "@phosphor-icons/react";

export interface Moment {
  hora: string;
  titulo: string;
  texto: string;
  detalle: string[];
  img: string;
  alt: string;
}

function Frame({ m, priority = false }: { m: Moment; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] bg-panel shadow-[var(--shadow-lg)] ring-1 ring-line/70">
      <Image src={m.img} alt={m.alt} width={1440} height={900} loading={priority ? "eager" : "lazy"} sizes="(min-width: 1024px) 640px, 100vw" className="block h-auto w-full" />
    </div>
  );
}

/**
 * Un día en el gimnasio contado con scroll: en escritorio el texto avanza y la
 * pantalla queda fija a la derecha, cambiando cuando el momento llega al centro
 * de la ventana. En el celular cada momento lleva su pantalla debajo.
 */
export function DayStory({ moments }: { moments: Moment[] }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const m = moments[active];
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
      <ol>
        {moments.map((x, i) => (
          <li
            key={x.hora}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-index={i}
            className="border-t border-line py-10 first:border-0 first:pt-0 lg:flex lg:min-h-[78vh] lg:flex-col lg:justify-center lg:border-0 lg:py-0"
          >
            <div className={`space-y-4 transition-opacity duration-300 ${i === active ? "lg:opacity-100" : "lg:opacity-40"}`}>
              <p className="num text-[15px] font-semibold text-primary-ink">{x.hora}</p>
              <h3 className="font-display text-[28px] font-bold leading-tight tracking-[-0.02em] [text-wrap:balance] sm:text-[32px]">{x.titulo}</h3>
              <p className="max-w-[46ch] text-[17px] leading-relaxed text-ink-muted">{x.texto}</p>
              <ul className="space-y-2 pt-1">
                {x.detalle.map((d) => (
                  <li key={d} className="flex items-start gap-2.5 text-[15px] text-ink-muted">
                    <Check className="mt-1 size-4 shrink-0 text-primary-ink" weight="bold" aria-hidden /> {d}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-8 lg:hidden">
              <Frame m={x} />
            </div>
          </li>
        ))}
      </ol>

      <div className="hidden lg:block">
        <div className="sticky top-[calc(50vh-210px)]">
          <div className="relative aspect-[1440/900]">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={m.img}
                className="absolute inset-0"
                initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduce ? undefined : { opacity: 0, y: -16, filter: "blur(4px)" }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              >
                <Frame m={m} priority />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-5 flex justify-center gap-1.5" aria-hidden="true">
            {moments.map((x, i) => (
              <span key={x.hora} className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${i === active ? "w-6 bg-primary" : "w-1.5 bg-[var(--border-base)]"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
