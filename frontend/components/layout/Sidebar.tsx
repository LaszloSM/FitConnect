"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSidebar } from "./SidebarContext";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Calendar,
  Dumbbell,
  BarChart3,
  Settings,
  Zap,
  Activity,
  ChevronLeft,
  LogOut,
} from "lucide-react";

// ── Nav items ──────────────────────────────────────────────────────────────
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/members", label: "Miembros", icon: Users },
  { href: "/payments", label: "Pagos", icon: CreditCard },
  { href: "/checkins", label: "Check-ins", icon: Activity },
  { href: "/classes", label: "Clases", icon: Calendar },
  { href: "/machines", label: "Máquinas", icon: Dumbbell },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/settings", label: "Configuración", icon: Settings },
];

// ── Framer Motion variants ─────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 30 },
  },
};

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

  // Track mount to avoid hydration mismatch (collapsed state comes from localStorage)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // User info from session
  const userName = session?.user?.name ?? null;
  const userEmail = session?.user?.email ?? null;
  // next-auth doesn't type `role` by default; cast through unknown
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? null;
  const initials = getInitials(userName);
  const subline = userRole ?? userEmail ?? "";

  // Active detection helper
  function isActive(href: string) {
    return (
      pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(href + "/"))
    );
  }

  // Avoid hydration mismatch: render expanded on first paint, then snap
  const effectiveCollapsed = mounted ? collapsed : false;

  return (
    <motion.aside
      animate={{ width: effectiveCollapsed ? 64 : 256 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="fixed left-0 top-0 h-screen z-40 flex flex-col overflow-hidden
                 bg-[var(--bg-sidebar)] border-r border-[var(--border-base)]"
      style={{ willChange: "width" }}
    >
      {/* ── Logo area ───────────────────────────────────────────────────── */}
      <div
        className="relative flex items-center h-[72px] shrink-0
                   bg-[oklch(0.70_0.20_47)] border-b border-[oklch(0.63_0.21_47)]"
      >
        <div className="flex items-center gap-2 px-4 overflow-hidden min-w-0">
          <Zap className="h-6 w-6 text-white shrink-0" />
          <AnimatePresence initial={false}>
            {!effectiveCollapsed && (
              <motion.span
                key="logo-text"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="text-white font-bold text-lg font-display whitespace-nowrap overflow-hidden"
              >
                FitConnect
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Toggle button */}
        <button
          onClick={toggleCollapsed}
          aria-label={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute right-2 top-1/2 -translate-y-1/2
                     p-1 rounded-md text-white/80 hover:text-white
                     hover:bg-white/20 transition-colors duration-150
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-[oklch(0.70_0.20_47)]"
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
        <motion.ul
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-0.5 list-none m-0 p-0"
        >
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <motion.li key={href} variants={itemVariants}>
                <Tooltip label={label} show={effectiveCollapsed}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl
                               text-sm font-medium transition-colors duration-150
                               focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-[oklch(0.70_0.20_47)] focus-visible:ring-offset-1
                               w-full"
                    style={{
                      color: active
                        ? "#fff"
                        : "var(--text-muted)",
                    }}
                  >
                    {/* Active background pill via layoutId */}
                    {active && (
                      <motion.span
                        layoutId="activeNavPill"
                        className="absolute inset-0 rounded-xl bg-[oklch(0.70_0.20_47)]"
                        transition={{
                          type: "spring",
                          stiffness: 350,
                          damping: 30,
                        }}
                        style={{ zIndex: 0 }}
                      />
                    )}

                    {/* Hover background for inactive items */}
                    {!active && (
                      <motion.span
                        whileHover={{ opacity: 1 }}
                        initial={{ opacity: 0 }}
                        className="absolute inset-0 rounded-xl bg-[var(--bg-base)]"
                        style={{ zIndex: 0 }}
                        transition={{ duration: 0.15 }}
                      />
                    )}

                    {/* Hover slide effect on whole row */}
                    <motion.span
                      whileHover={!active ? { x: 4 } : {}}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="relative z-10 flex items-center gap-3 min-w-0 w-full"
                    >
                      <Icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: active ? "#fff" : "var(--text-muted)" }}
                      />
                      <AnimatePresence initial={false}>
                        {!effectiveCollapsed && (
                          <motion.span
                            key="nav-label"
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 300,
                              damping: 30,
                            }}
                            className="truncate overflow-hidden whitespace-nowrap"
                            style={{
                              color: active ? "#fff" : "var(--text-muted)",
                              fontWeight: active ? 600 : 500,
                            }}
                          >
                            {label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.span>
                  </Link>
                </Tooltip>
              </motion.li>
            );
          })}
        </motion.ul>
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
              {/* User row */}
              <div className="flex items-center gap-2 min-w-0">
                {/* Avatar */}
                <div
                  className="h-9 w-9 rounded-full bg-[oklch(0.70_0.20_47)] shrink-0
                             flex items-center justify-center"
                >
                  <span className="text-white text-xs font-bold">{initials}</span>
                </div>
                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--text-base)" }}
                  >
                    {userName ?? "Usuario"}
                  </p>
                  {subline && (
                    <p
                      className="text-xs truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {subline}
                    </p>
                  )}
                </div>
              </div>

              {/* Logout button */}
              <motion.button
                whileHover={{ x: 2 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg
                           text-xs font-medium text-danger
                           hover:bg-danger-light transition-colors duration-150
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.15_47)] focus-visible:ring-offset-1"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span>Cerrar sesión</span>
              </motion.button>
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
              {/* Avatar only */}
              <Tooltip label={userName ?? "Usuario"} show>
                <div
                  className="h-9 w-9 rounded-full bg-[oklch(0.70_0.20_47)]
                             flex items-center justify-center cursor-default"
                >
                  <span className="text-white text-xs font-bold">{initials}</span>
                </div>
              </Tooltip>
              {/* Logout icon only */}
              <Tooltip label="Cerrar sesión" show>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="p-1.5 rounded-lg text-danger hover:bg-danger-light
                             transition-colors duration-150
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.15_47)] focus-visible:ring-offset-1"
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
