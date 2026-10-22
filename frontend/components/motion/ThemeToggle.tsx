"use client";

import { useRef } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { MoonIcon as Moon, SunIcon as Sun } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Cambia el tema con un revelado circular que nace del botón (View Transitions;
 * misma técnica que "Animated Theme Toggler" de Magic UI, MIT). Donde el
 * navegador no la soporta, o con movimiento reducido, el cambio es inmediato.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const ref = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);

  function toggle() {
    const next = dark ? "light" : "dark";
    const apply = () => setTheme(next);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const btn = ref.current;
    if (busy.current || reduce || !btn || typeof document.startViewTransition !== "function") {
      apply();
      return;
    }
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const radius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
    // Porcentajes, no px: Chrome escala mal los px del pseudo-elemento en pantallas con zoom.
    const at = `${(x / w) * 100}% ${(y / h) * 100}%`;
    const end = `${(radius / (Math.hypot(w, h) / Math.SQRT2)) * 100}%`;

    busy.current = true;
    document.documentElement.dataset.themeVt = "on";
    const t = document.startViewTransition(() => {
      flushSync(apply);
      // next-themes pone la clase en un efecto: se fuerza aquí para que la captura salga con el tema nuevo.
      document.documentElement.classList.toggle("dark", next === "dark");
    });
    t.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0% at ${at})`, `circle(${end} at ${at})`] },
          { duration: 480, easing: "cubic-bezier(0.77, 0, 0.175, 1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {});
    t.finished.finally(() => {
      busy.current = false;
      delete document.documentElement.dataset.themeVt;
    });
  }

  return (
    <button
      ref={ref}
      type="button"
      // El tema vive en localStorage: el servidor no lo conoce y el texto puede diferir al hidratar.
      suppressHydrationWarning
      onClick={toggle}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={cn(
        "relative flex size-10 items-center justify-center rounded-full text-ink-muted transition-[color,background-color,transform] duration-150 hover:bg-raised hover:text-ink active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40",
        className,
      )}
    >
      {/* Los íconos siguen la clase `.dark`, no el estado: se ven bien desde el primer pintado. */}
      <Moon className="absolute size-[18px] transition-[opacity,transform] duration-300 ease-[var(--ease-out)] dark:-rotate-45 dark:scale-50 dark:opacity-0" />
      <Sun className="absolute size-[18px] rotate-45 scale-50 opacity-0 transition-[opacity,transform] duration-300 ease-[var(--ease-out)] dark:rotate-0 dark:scale-100 dark:opacity-100" />
    </button>
  );
}
