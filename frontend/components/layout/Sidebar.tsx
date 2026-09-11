"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSidebar } from "./SidebarContext";
import { SIDEBAR_COLLAPSED_W, SIDEBAR_EXPANDED_W } from "@/lib/layout-constants";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Calendar,
  Dumbbell,
  BarChart3,
  Settings,
  Activity,
  ChevronLeft,
  LogOut,
  Tag,
  ScrollText,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { BrandMark } from "@/components/common/BrandMark";

// ── Nav structure — grouped by purpose so modules feel organized, not cloned ──
type NavItem = { href: string; label: string; icon: typeof Users; ownerOnly?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/members", label: "Miembros", icon: Users },
      { href: "/checkins", label: "Check-ins", icon: Activity },
      { href: "/classes", label: "Clases", icon: Calendar },
      { href: "/routines", label: "Rutinas", icon: Dumbbell },
      { href: "/messages", label: "Mensajes", icon: MessageSquare },
    ],
  },
  {
    label: "Negocio",
    items: [
      { href: "/payments", label: "Pagos", icon: CreditCard },
      { href: "/plans", label: "Planes", icon: Tag },
      { href: "/machines", label: "Máquinas", icon: Dumbbell },
      { href: "/reports", label: "Reportes", icon: BarChart3 },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/audit", label: "Auditoría", icon: ScrollText, ownerOnly: true },
      { href: "/settings", label: "Configuración", icon: Settings },
      { href: "/ayuda", label: "Ayuda", icon: HelpCircle },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ── Tooltip wrapper for collapsed mode ────────────────────────────────────
function Tooltip({
  label,
  children,
  show,
}: {
  label: string;
  children: React.ReactNode;
  show: boolean;
}) {
  const [visible, setVisible] = useState(false);

  if (!show) return <>{children}</>;

  return (
    <div
      className="relative flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50
                       bg-[var(--text-base)] text-[var(--bg-sidebar)]
                       text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap
                       pointer-events-none shadow-card"
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Sidebar component ─────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { collapsed, toggle: toggleCollapsed } = useSidebar();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const userName = session?.user?.name ?? null;
  const userEmail = session?.user?.email ?? null;
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? null;
  const initials = getInitials(userName);
  const subline = userRole ?? userEmail ?? "";

  function isActive(href: string) {
    return (
      pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(href + "/"))
    );
  }

  const effectiveCollapsed = mounted ? collapsed : false;

  return (
    <motion.aside
      animate={{ width: effectiveCollapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="fixed left-0 top-0 h-screen z-40 flex flex-col overflow-hidden
                 bg-[var(--bg-sidebar)] border-r border-[var(--border-base)]"
      style={{ willChange: "width" }}
    >
      {/* ── Brand ───────────────────────────────────────────────────────── */}
      <div className="relative flex items-center h-16 shrink-0 px-3 border-b border-[var(--border-base)]">
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
          <BrandMark size={32} />
          <AnimatePresence initial={false}>
            {!effectiveCollapsed && (
              <motion.span
                key="logo-text"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="text-[var(--text-base)] font-extrabold text-lg tracking-tight whitespace-nowrap overflow-hidden"
              >
                FitConnect
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={toggleCollapsed}
          aria-label={effectiveCollapsed ? "Expandir menú" : "Colapsar menú"}
          className="absolute right-2 top-1/2 -translate-y-1/2
                     p-1 rounded-md text-[var(--text-subtle)] hover:text-[var(--text-base)]
                     hover:bg-[var(--bg-muted)] transition-colors duration-150
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <motion.div
            animate={{ rotate: effectiveCollapsed ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.div>
        </button>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2" aria-label="Navegación principal">
        <div className="flex flex-col gap-4">
          {navGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <AnimatePresence initial={false}>
                {!effectiveCollapsed && (
                  <motion.span
                    key={`label-${group.label}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-subtle)]"
                  >
                    {group.label}
                  </motion.span>
                )}
              </AnimatePresence>

              <ul className="flex flex-col gap-0.5 list-none m-0 p-0">
                {group.items
                  .filter((item) => !item.ownerOnly || userRole === "owner")
                  .map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <li key={href}>
                      <Tooltip label={label} show={effectiveCollapsed}>
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg
                                     text-sm font-medium transition-colors duration-150
                                     focus-visible:outline-none focus-visible:ring-2
                                     focus-visible:ring-[var(--color-primary)] w-full"
                          style={{
                            color: active ? "var(--color-primary)" : "var(--text-muted)",
                          }}
                        >
                          {active && (
                            <motion.span
                              layoutId="activeNavPill"
                              className="absolute inset-0 rounded-lg bg-[var(--color-primary-muted)]"
                              transition={{ type: "spring", stiffness: 350, damping: 30 }}
                              style={{ zIndex: 0 }}
                            />
                          )}
                          <span className="relative z-10 flex items-center gap-3 min-w-0 w-full">
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                            <AnimatePresence initial={false}>
                              {!effectiveCollapsed && (
                                <motion.span
                                  key="nav-label"
                                  initial={{ opacity: 0, width: 0 }}
                                  animate={{ opacity: 1, width: "auto" }}
                                  exit={{ opacity: 0, width: 0 }}
                                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                  className="truncate overflow-hidden whitespace-nowrap"
                                  style={{ fontWeight: active ? 600 : 500 }}
                                >
                                  {label}
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </span>
                        </Link>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* ── User footer ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[var(--border-base)]">
        <AnimatePresence initial={false}>
          {!effectiveCollapsed ? (
            <motion.div
              key="footer-expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-3 space-y-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-9 w-9 rounded-full bg-[var(--color-primary)] shrink-0 flex items-center justify-center">
                  <span className="text-[var(--color-primary-contrast)] text-xs font-bold">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text-base)" }}>
                    {userName ?? "Usuario"}
                  </p>
                  {subline && (
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {subline}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg
                           text-xs font-medium text-red-500
                           hover:bg-red-500/10 transition-colors duration-150
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span>Cerrar sesión</span>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="footer-collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-2 flex flex-col items-center gap-2"
            >
              <Tooltip label={userName ?? "Usuario"} show>
                <div className="h-9 w-9 rounded-full bg-[var(--color-primary)] flex items-center justify-center cursor-default">
                  <span className="text-[var(--color-primary-contrast)] text-xs font-bold">{initials}</span>
                </div>
              </Tooltip>
              <Tooltip label="Cerrar sesión" show>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10
                             transition-colors duration-150
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
