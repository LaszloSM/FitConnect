"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * El momento del hero: el panel real se asienta en perspectiva al cargar y el
 * mismo panel en el celular del dueño se desliza al lado. Al hacer scroll el
 * celular sube un poco más rápido que el portátil (parallax suave). Con
 * movimiento reducido todo queda quieto en su posición final.
 */
export function HeroShowcase() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const phoneY = useTransform(scrollYProgress, [0, 1], [40, -60]);
  const deskY = useTransform(scrollYProgress, [0, 1], [10, -10]);

  return (
    <div ref={ref} className="relative mx-auto max-w-6xl [perspective:1800px]">
      <motion.figure
        style={reduce ? undefined : { y: deskY }}
        initial={reduce ? false : { opacity: 0, rotateX: 12, y: 40 }}
        animate={{ opacity: 1, rotateX: 0, y: 0 }}
        transition={{ duration: 1.1, ease: EASE }}
        className="relative hidden origin-bottom overflow-hidden rounded-[var(--radius-xl)] bg-panel md:block shadow-[0_40px_80px_-32px_oklch(0.35_0.08_40/0.35),0_12px_28px_-12px_oklch(0.35_0.08_40/0.2)] ring-1 ring-line/70 md:mr-24"
      >
        <Image
          src="/landing/panel.webp"
          alt="El panel Hoy de LSMFit: entradas del día por hora, quién está entrando en vivo, lo cobrado y lo que vence esta semana"
          width={1440}
          height={900}
          preload
          sizes="(min-width: 1152px) 1060px, 100vw"
          className="block h-auto w-full"
        />
      </motion.figure>

      <motion.div
        style={reduce ? undefined : { y: phoneY }}
        className="mx-auto w-[min(270px,78vw)] md:absolute md:-bottom-10 md:right-0 md:mx-0 md:w-[200px] lg:w-[230px]"
      >
        <motion.figure
          initial={reduce ? false : { opacity: 0, x: 48, rotate: 4 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
          className="rounded-[38px] bg-[var(--kiosk-bg)] p-2.5 shadow-[0_30px_60px_-24px_oklch(0.3_0.08_40/0.45)]"
        >
          <div className="overflow-hidden rounded-[30px] bg-surface">
            <Image
              src="/landing/panel-movil.webp"
              alt="El panel Hoy en el celular del dueño: entradas, lo cobrado y quién está entrando"
              width={390}
              height={844}
              sizes="(min-width: 768px) 230px, 270px"
              className="block h-auto w-full"
            />
          </div>
        </motion.figure>
      </motion.div>
    </div>
  );
}
