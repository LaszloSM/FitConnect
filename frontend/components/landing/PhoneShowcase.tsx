"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const SCREENS = [
  { id: "inicio", title: "Su membresía, de un vistazo", text: "Días que le quedan, entradas de la ticketera, avisos del gimnasio y cuánta gente entró hace poco.", src: "/landing/app-inicio.webp" },
  { id: "qr", title: "QR que cambia cada 30 segundos", text: "Entra por el lector o el torniquete. El celular lo genera aunque no tenga datos, y una captura de pantalla no sirve para prestarlo.", src: "/landing/app-qr.webp" },
  { id: "clases", title: "Reserva su cupo", text: "Ve las clases de la semana, reserva o queda en lista de espera, y sube solo cuando alguien cancela.", src: "/landing/app-clases.webp" },
  { id: "comer", title: "Entreno y comidas", text: "Registra series, pesos y comidas, también sin señal. Sus datos personales no los ve el gimnasio.", src: "/landing/app-comer.webp" },
  { id: "plan", title: "Asistente con base científica", text: "Arma planes de entreno y de comidas que quedan como agenda. Orientación general, con guardas de salud.", src: "/landing/app-plan.webp" },
];

/** La app del socio en un celular, con pantallas reales que se recorren solas. */
export function PhoneShowcase() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || reduce) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % SCREENS.length), 4500);
    return () => clearTimeout(t);
  }, [index, paused, reduce]);

  const s = SCREENS[index];
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,34rem)_auto] lg:justify-center lg:gap-24" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <ol className="order-2 space-y-2 lg:order-1">
        {SCREENS.map((x, i) => {
          const on = i === index;
          return (
            <li key={x.id}>
              <button
                onClick={() => setIndex(i)}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                aria-pressed={on}
                className={`w-full rounded-[var(--radius-lg)] p-4 text-left transition-colors ${on ? "bg-panel shadow-[var(--shadow-card)]" : "hover:bg-muted"}`}
              >
                <span className={`block font-semibold ${on ? "text-ink" : "text-ink-muted"}`}>{x.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-muted">{x.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="order-1 mx-auto w-[250px] shrink-0 rounded-[44px] sm:w-[270px] lg:order-2 bg-[#1F1814] p-3 shadow-[var(--shadow-lg)]">
        <div className="relative aspect-[585/1266] overflow-hidden rounded-[34px] bg-surface">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={s.id}
              className="absolute inset-0"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image src={s.src} alt={`App de FitConnect: ${s.title.toLowerCase()}`} fill className="object-cover object-top" sizes="270px" />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
