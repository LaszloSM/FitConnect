"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { ChevronsLeft, LogOut, X } from "lucide-react";
import { useSidebar } from "./SidebarContext";
import { staffGroups, trainerGroups, isActivePath } from "./nav";
import { BrandMark } from "@/components/common/BrandMark";
import { rolLegible, useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Contenido del menú. Se usa en dos contenedores: el sidebar fijo de escritorio
 * (colapsable a iconos) y el drawer de móvil/tablet (siempre expandido).
 */
function SidebarBody({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { toggle } = useSidebar();
  const { can } = useCan();

  // El rol vive en `session.role`, no en `session.user`.
  const userRole = session?.role ?? null;
  const groups = userRole === "trainer" ? trainerGroups : staffGroups;
  const userName = session?.user?.name ?? null;
  const subline = rolLegible(userRole) || session?.user?.email || "";

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center gap-2.5 px-4", collapsed && "justify-center px-0")}>
        <BrandMark size={26} />
        {!collapsed && (
          <span className="text-[15px] font-semibold tracking-tight text-ink">FitConnect</span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="ml-auto flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 pt-2" aria-label="Navegación principal">
        <div className="flex flex-col gap-5">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.needs || can(item.needs));
            if (items.length === 0) return null;
            return (
              <div key={group.label} className="flex flex-col gap-0.5">
                {collapsed ? (
                  <div className="mx-3 mb-1 h-px bg-line" aria-hidden="true" />
                ) : (
                  <span className="px-3 pb-1 text-xs font-medium text-ink-subtle">{group.label}</span>
                )}
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {items.map(({ href, label, icon: Icon }) => {
                    const active = isActivePath(pathname, href);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          title={collapsed ? label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            collapsed && "justify-center px-0",
                            active
                              ? "bg-primary-muted font-medium text-primary-ink"
                              : "text-ink-muted hover:bg-muted hover:text-ink"
                          )}
                        >
                          <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                          {!collapsed && <span className="truncate">{label}</span>}
                          {collapsed && <span className="sr-only">{label}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        <div className={cn("flex items-center gap-2.5 rounded-md px-2 py-2", collapsed && "justify-center px-0")}>
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-ink"
            title={collapsed ? (userName ?? "Usuario") : undefined}
          >
            {getInitials(userName)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{userName ?? "Usuario"}</p>
              {subline && <p className="truncate text-xs text-ink-muted">{subline}</p>}
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-muted hover:text-[var(--signal-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
        {!onClose && (
          <button
            onClick={toggle}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            className={cn(
              "mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-xs text-ink-subtle hover:bg-muted hover:text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              collapsed && "justify-center px-0"
            )}
          >
            <ChevronsLeft className={cn("size-4 shrink-0 transition-transform duration-200", collapsed && "rotate-180")} />
            {!collapsed && <span>Colapsar</span>}
          </button>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const effectiveCollapsed = mounted ? collapsed : false;

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, setMobileOpen]);

  return (
    <>
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-sidebar transition-[width] duration-200 ease-[var(--ease-out)] lg:flex"
      >
        <SidebarBody collapsed={effectiveCollapsed} />
      </aside>

      {/* Drawer móvil / tablet */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-ink/40 transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          className={cn(
            "absolute inset-y-0 left-0 w-[min(20rem,85vw)] border-r border-line bg-sidebar shadow-[var(--shadow-lg)]",
            "transition-transform duration-300 ease-[var(--ease-out)]",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {mobileOpen && <SidebarBody collapsed={false} onClose={() => setMobileOpen(false)} />}
        </aside>
      </div>
    </>
  );
}
