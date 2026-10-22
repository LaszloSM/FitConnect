"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRef } from "react";
import { ListIcon as Menu } from "@phosphor-icons/react";
import { useSidebar } from "./SidebarContext";
import { staffMobile, trainerMobile, isActivePath } from "./nav";
import { useSlidingIndicator } from "@/components/motion/useSlidingIndicator";
import { cn } from "@/lib/utils";

/** Barra inferior en móvil: los cuatro destinos de la recepción + "Más". */
export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { setMobileOpen } = useSidebar();
  const items = session?.role === "trainer" ? trainerMobile : staffMobile;
  const list = useRef<HTMLUListElement>(null);
  // Una pastilla tenue detrás del ícono activo se desliza al cambiar de destino.
  const ind = useSlidingIndicator<HTMLUListElement, HTMLSpanElement>(list, 'a[aria-current="page"]:not([data-featured])', [pathname, items.length], {
    stretch: false,
  });

  return (
    <nav
      aria-label="Navegación rápida"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul ref={list} className="relative m-0 grid list-none grid-cols-5 p-0">
        <span ref={ind} aria-hidden="true" className="slide-ind left-0 top-0 flex h-16 w-1/5 items-start justify-center pt-2 opacity-0">
          <span className="h-8 w-14 rounded-full bg-raised" />
        </span>
        {items.map(({ href, label, icon: Icon, featured }) => {
          const active = isActivePath(pathname, href);
          if (featured) {
            return (
              <li key={href} className="relative">
                <Link
                  href={href}
                  data-featured
                  aria-current={active ? "page" : undefined}
                  className="flex h-16 flex-col items-center justify-end gap-0.5 pb-2 text-[11px] font-semibold text-ink transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/40"
                >
                  <span className="-mt-6 flex size-[52px] items-center justify-center rounded-full bg-action text-action-ink ring-[6px] ring-panel">
                    <Icon className="size-6" weight="bold" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          }
          return (
            <li key={href} className="relative">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/40",
                  active ? "font-semibold text-ink" : "font-medium text-ink-muted",
                )}
              >
                <Icon className="size-5" weight={active ? "fill" : "regular"} />
                {label}
              </Link>
            </li>
          );
        })}
        <li className="relative">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/40"
          >
            <Menu className="size-5" />
            Más
          </button>
        </li>
      </ul>
    </nav>
  );
}
