"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="m-0 grid list-none grid-cols-5 p-0">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  active ? "text-primary-ink" : "text-ink-muted"
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
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
            <Menu className="size-5" strokeWidth={1.8} />
            Más
          </button>
        </li>
      </ul>
    </nav>
  );
}
