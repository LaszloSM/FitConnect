"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ListIcon as Menu } from "@phosphor-icons/react";
import { useSidebar } from "./SidebarContext";
import { staffMobile, trainerMobile, isActivePath } from "./nav";
import { cn } from "@/lib/utils";

/** Barra inferior en móvil: los cuatro destinos de la recepción + "Más". */
export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { setMobileOpen } = useSidebar();
  const items = session?.role === "trainer" ? trainerMobile : staffMobile;

  return (
    <nav
      aria-label="Navegación rápida"
      className="fixed inset-x-0 bottom-0 z-30 bg-panel pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--border-base),0_-12px_30px_-18px_oklch(0.4_0.06_40/0.3)] md:hidden"
    >
      <ul className="m-0 grid list-none grid-cols-5 p-0">
        {items.map(({ href, label, icon: Icon, featured }) => {
          const active = isActivePath(pathname, href);
          if (featured) {
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="flex h-14 flex-col items-center justify-end gap-0.5 pb-1.5 text-[11px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span className="-mt-5 flex size-12 items-center justify-center rounded-[var(--radius-lg)] bg-primary text-primary-contrast shadow-[var(--shadow-primary)]">
                    <Icon className="size-6" weight="bold" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          }
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  active ? "text-primary-ink" : "text-ink-muted"
                )}
              >
                <Icon className="size-5" weight={active ? "bold" : "regular"} />
                {label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <Menu className="size-5" />
            Más
          </button>
        </li>
      </ul>
    </nav>
  );
}
