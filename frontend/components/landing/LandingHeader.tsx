"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ListIcon as Menu, XIcon as Close } from "@phosphor-icons/react";
import { BrandLockup } from "@/components/common/BrandLockup";

export const NAV = [
  { href: "#producto", label: "Producto" },
  { href: "#inteligencia", label: "Inteligencia" },
  { href: "#app", label: "App" },
  { href: "#precios", label: "Precios" },
  { href: "#preguntas", label: "Preguntas" },
];

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onResize = () => window.innerWidth >= 768 && setOpen(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/92 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="LSMFit, inicio" className="flex min-h-11 items-center" onClick={() => setOpen(false)}>
          <BrandLockup height={24} />
        </Link>

        <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Secciones">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-[var(--radius-sm)] px-3 py-2 text-ink-muted transition-colors hover:bg-muted hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-muted">
            Ingresar
          </Link>
          <Link
            href="/register"
            className="rounded-[var(--radius-md)] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-contrast shadow-[var(--shadow-primary)] transition-transform duration-150 active:scale-[0.97]"
          >
            Prueba 30 días gratis
          </Link>
        </div>

        <button
          type="button"
          className="-mr-2 inline-flex size-12 items-center justify-center rounded-[var(--radius-md)] text-ink transition-colors hover:bg-muted md:hidden"
          aria-expanded={open}
          aria-controls="menu-movil"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <Close className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="menu-movil"
            className="border-t border-line bg-surface md:hidden"
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <nav aria-label="Secciones" className="mx-auto max-w-6xl px-5 py-3">
              <ul>
                {NAV.map((n) => (
                  <li key={n.href} className="border-b border-line last:border-0">
                    <a href={n.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center text-base font-medium text-ink">
                      {n.label}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 pb-2 pt-4">
                <Link
                  href="/register"
                  className="flex h-12 items-center justify-center rounded-[var(--radius-md)] bg-primary text-base font-semibold text-primary-contrast shadow-[var(--shadow-primary)]"
                >
                  Prueba 30 días gratis
                </Link>
                <Link href="/login" className="flex h-12 items-center justify-center rounded-[var(--radius-md)] border border-line bg-panel text-base font-medium text-ink">
                  Ingresar
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
