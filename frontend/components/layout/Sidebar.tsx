"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { CaretDoubleLeftIcon as ChevronsLeft, SignOutIcon as LogOut, XIcon as X } from "@phosphor-icons/react";
import { useSidebar } from "./SidebarContext";
import { staffGroups, trainerGroups, isActivePath } from "./nav";
import { BrandMark } from "@/components/common/BrandMark";
import { BrandLockup } from "@/components/common/BrandLockup";
import { useSlidingIndicator } from "@/components/motion/useSlidingIndicator";
import { rolLegible, useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { signOutClean } from "@/lib/offline/logout";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Contenido del menú. En escritorio cerrado es un riel de íconos en una
 * píldora; abierto muestra los nombres. En el cajón del celular siempre va
 * abierto. Una píldora marca la sección actual y se desliza al cambiar; otra,
 * tenue, sigue al cursor (técnica "Animated Background" de Motion Primitives).
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

  const nav = useRef<HTMLDivElement>(null);
  const active = useSlidingIndicator<HTMLDivElement, HTMLSpanElement>(nav, 'a[aria-current="page"]', [pathname, collapsed, groups.length], {
    axis: "y",
    stretch: false,
  });
  const hover = useRef<HTMLSpanElement>(null);
  const warmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Los nombres del riel tardan en salir la primera vez; después, mientras el
  // cursor siga en el riel, salen al instante (regla de tooltips de Emil Kowalski).
  function onEnterItem(e: React.PointerEvent<HTMLAnchorElement>) {
    if (e.pointerType !== "mouse") return;
    const h = hover.current;
    const box = nav.current;
    if (!h || !box) return;
    const a = e.currentTarget.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    h.style.transform = `translateY(${a.top - c.top}px)`;
    h.style.opacity = e.currentTarget.getAttribute("aria-current") ? "0" : "1";
    if (warmTimer.current) clearTimeout(warmTimer.current);
    warmTimer.current = setTimeout(() => box.setAttribute("data-warm", ""), 400);
  }
  function onLeaveNav() {
    if (hover.current) hover.current.style.opacity = "0";
    if (warmTimer.current) clearTimeout(warmTimer.current);
    warmTimer.current = setTimeout(() => nav.current?.removeAttribute("data-warm"), 300);
  }
  useEffect(() => () => {
    if (warmTimer.current) clearTimeout(warmTimer.current);
  }, []);

  return (
    <div className={cn("flex h-full flex-col", collapsed ? "items-center px-3 py-4" : "px-3 py-4")}>
      <div className={cn("flex h-12 shrink-0 items-center", collapsed ? "justify-center" : "gap-2.5 px-3")}>
        {collapsed ? <BrandMark size={34} /> : <BrandLockup height={22} />}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="ml-auto flex size-10 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav aria-label="Navegación principal" className={cn("mt-4 min-h-0 flex-1", collapsed && "flex flex-col items-center")}>
        <div
          ref={nav}
          onPointerLeave={onLeaveNav}
          className={cn(
            "relative max-h-full overflow-y-auto overflow-x-visible bg-panel shadow-[var(--shadow-card)] [scrollbar-width:none]",
            collapsed ? "w-14 rounded-full p-1.5" : "rounded-[var(--radius-xl)] p-2",
          )}
        >
          <span ref={hover} aria-hidden="true" className={cn("slide-ind left-1.5 top-0 h-11 bg-raised opacity-0", collapsed ? "w-11 rounded-full" : "right-2 left-2 rounded-full")} />
          <span ref={active} aria-hidden="true" className={cn("slide-ind left-1.5 top-0 h-11 bg-action opacity-0", collapsed ? "w-11 rounded-full" : "right-2 left-2 rounded-full")} />
          {groups.map((group, gi) => {
            const items = group.items.filter((item) => !item.needs || can(item.needs));
            if (items.length === 0) return null;
            return (
              <div key={group.label || gi} className={cn(gi > 0 && (collapsed ? "mt-1.5 border-t border-line-soft pt-1.5" : "mt-3"))}>
                {group.label && !collapsed && <span className="block px-3 pb-1 text-xs font-medium text-ink-subtle">{group.label}</span>}
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {items.map(({ href, label, icon: Icon }) => {
                    const isActive = isActivePath(pathname, href);
                    return (
                      <li key={href} className="relative">
                        <Link
                          href={href}
                          aria-current={isActive ? "page" : undefined}
                          aria-label={collapsed ? label : undefined}
                          onPointerEnter={onEnterItem}
                          className={cn(
                            "group/item relative z-[1] flex h-11 items-center rounded-full text-sm transition-colors duration-200",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40",
                            collapsed ? "w-11 justify-center" : "gap-3 px-3",
                            isActive ? "font-semibold text-action-ink" : "font-medium text-ink-muted hover:text-ink",
                          )}
                        >
                          <Icon className="size-[19px] shrink-0" weight={isActive ? "fill" : "regular"} />
                          {!collapsed && <span className="truncate">{label}</span>}
                          {collapsed && (
                            <span
                              aria-hidden="true"
                              className={cn(
                                "pointer-events-none fixed z-50 ml-[3.75rem] whitespace-nowrap rounded-lg bg-action px-2.5 py-1 text-[12.5px] font-medium text-action-ink",
                                "scale-[0.97] opacity-0 transition-[opacity,transform] duration-[125ms] ease-out",
                                "group-hover/item:scale-100 group-hover/item:opacity-100 group-hover/item:delay-300",
                                "[[data-warm]_&]:!delay-0 [[data-warm]_&]:!duration-0",
                              )}
                            >
                              {label}
                            </span>
                          )}
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

      <div className={cn("mt-4 flex shrink-0 flex-col gap-1", collapsed ? "items-center" : "")}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 rounded-full px-2 py-1.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-muted text-xs font-bold text-primary-ink">
              {getInitials(userName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{userName ?? "Usuario"}</p>
              {subline && <p className="truncate text-xs text-ink-muted">{subline}</p>}
            </div>
            <button
              onClick={() => void signOutClean("/login")}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-[var(--signal-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
        {!onClose && (
          <button
            onClick={toggle}
            aria-label={collapsed ? "Mostrar nombres del menú" : "Ocultar nombres del menú"}
            title={collapsed ? "Mostrar nombres" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-full text-xs text-ink-subtle transition-colors hover:bg-raised hover:text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40",
              collapsed ? "w-10 justify-center" : "px-3",
            )}
          >
            <ChevronsLeft className={cn("size-4 shrink-0 transition-transform duration-200", collapsed && "rotate-180")} />
            {!collapsed && <span>Ocultar nombres</span>}
          </button>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, setMobileOpen]);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col lg:flex">
        <SidebarBody collapsed={collapsed} />
      </aside>

      {/* Cajón del celular y la tablet */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={cn("absolute inset-0 bg-ink/40 transition-opacity duration-200", mobileOpen ? "opacity-100" : "opacity-0")}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          className={cn(
            "absolute inset-y-0 left-0 w-[min(20rem,85vw)] bg-surface shadow-[var(--shadow-lg)]",
            "transition-transform duration-300 ease-[var(--ease-drawer)]",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {mobileOpen && <SidebarBody collapsed={false} onClose={() => setMobileOpen(false)} />}
        </aside>
      </div>
    </>
  );
}
