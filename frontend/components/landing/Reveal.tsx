"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const variants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Aparece al entrar en pantalla (una vez). Siempre se renderiza igual en el
 * servidor y en el cliente; con movimiento reducido lo muestra quieto la regla
 * `[data-reveal]` de globals.css (cambiar el árbol según `useReducedMotion`
 * dejaba el contenido con la opacidad 0 que venía del servidor).
 */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      data-reveal=""
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
