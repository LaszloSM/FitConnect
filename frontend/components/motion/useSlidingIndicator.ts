"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

type Axis = "x" | "y" | "both";

/**
 * Mueve un indicador (pastilla o subrayado) hasta el elemento activo de un
 * contenedor, solo con `transform` (técnica de "Animated Background" de Motion
 * Primitives, MIT). La primera colocación no se anima: el indicador aparece en
 * su sitio y desde ahí se desliza.
 *
 * El indicador mide 1 px en el eje que se estira y se escala a su tamaño:
 * así nunca se anima `width`/`height`, que fuerzan layout. Con `axis: "both"`
 * (listas que cambian de columna a fila) se mueve en los dos ejes y el tamaño
 * se fija sin animar: una pastilla escalada deformaría sus esquinas.
 */
export function useSlidingIndicator<C extends HTMLElement, I extends HTMLElement>(
  containerRef: RefObject<C | null>,
  activeSelector: string,
  deps: unknown[],
  { axis = "x", stretch = true }: { axis?: Axis; stretch?: boolean } = {},
) {
  const indicatorRef = useRef<I | null>(null);
  const placedRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;

    const place = () => {
      const active = container.querySelector<HTMLElement>(activeSelector);
      if (!active) {
        indicator.style.opacity = "0";
        return;
      }
      const c = container.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      const x = a.left - c.left + container.scrollLeft;
      const y = a.top - c.top + container.scrollTop;
      if (!placedRef.current) indicator.style.transition = "none";
      if (axis === "both") {
        indicator.style.width = `${a.width}px`;
        indicator.style.height = `${a.height}px`;
        indicator.style.transform = `translate(${x}px, ${y}px)`;
      } else {
        const size = axis === "x" ? a.width : a.height;
        const move = axis === "x" ? `translateX(${x}px)` : `translateY(${y}px)`;
        const scale = stretch ? (axis === "x" ? ` scaleX(${size})` : ` scaleY(${size})`) : "";
        indicator.style.transform = move + scale;
      }
      indicator.style.opacity = "1";
      if (!placedRef.current) {
        placedRef.current = true;
        requestAnimationFrame(() => requestAnimationFrame(() => (indicator.style.transition = "")));
      }
    };

    place();
    const ro = new ResizeObserver(place);
    ro.observe(container);
    if (document.fonts?.ready) void document.fonts.ready.then(place);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return indicatorRef;
}
