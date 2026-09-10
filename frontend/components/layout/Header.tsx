"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, LogOut, Moon, Settings, Sun } from "lucide-react";
import { formatTimeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { useSidebar } from "@/components/layout/SidebarContext";
import { SIDEBAR_COLLAPSED_W, SIDEBAR_EXPANDED_W } from "@/lib/layout-constants";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

// Module-level constant — defined once, not re-created on every render
const dropdownVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.1 } },
};

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function Header() {
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const { collapsed } = useSidebar();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const effectiveCollapsed = mounted ? collapsed : false;
  // El tema vive en localStorage: el servidor no lo conoce. Si el icono se
  // pinta según el tema antes de montar, el HTML del servidor y el del cliente
  // no coinciden y React aborta la hidratación (#418) en TODAS las pantallas
  // para quien use modo oscuro.
  const esOscuro = mounted && resolvedTheme === "dark";

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [gymName, setGymName] = useState<string | null>(null);
  const [showBell, setShowBell] = useState(false);
  const [showUser, setShowUser] = useState(false);

  const bellRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Gym name for the breadcrumb (fetched once per session)
  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client
      .get("/api/v1/settings/gym")
      .then((res) => setGymName(res.data?.name ?? null))
      .catch(() => {});
  }, [session?.accessToken]);

  // Notification fetching
  useEffect(() => {
    if (!session?.accessToken) return;

    const fetchNotifications = async () => {
      try {
        const client = apiClient(session.accessToken as string);
        const res = await client.get(
          "/api/v1/notifications?unread_only=true&limit=5"
        );
        setNotifications(res.data);
      } catch {
        // notification failures should not crash the page
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [session?.accessToken]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.post("/api/v1/notifications/mark-all-read");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    }
  };

  // Click-outside for bell dropdown
  useEffect(() => {
    if (!showBell) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowBell(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showBell]);

  // Escape key for bell dropdown
  useEffect(() => {
    if (!showBell) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowBell(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showBell]);

  // Click-outside for user dropdown
  useEffect(() => {
    if (!showUser) return;
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUser(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUser]);

  // Escape key for user dropdown
  useEffect(() => {
    if (!showUser) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowUser(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showUser]);

  return (
    <motion.header
      animate={{ left: effectiveCollapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-0 right-0 h-16 z-20 flex items-center justify-between px-6"
      style={{
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border-base)",
      }}
    >
      {/* Left: gym identity — the page title lives in each page's PageHeader */}
      <nav aria-label="Ubicación" className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-[var(--text-base)] truncate max-w-[16rem]">
          {gymName ?? "FitConnect"}
        </span>
      </nav>

      {/* Right: global actions */}
      <div className="flex items-center gap-2">
        {/* Dark mode toggle */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          onClick={() => setTheme(esOscuro ? "light" : "dark")}
          className="text-[var(--text-muted)] hover:text-[var(--text-base)]"
        >
          <AnimatePresence mode="wait">
            {esOscuro ? (
              <motion.span
                key="dark"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <Sun className="h-5 w-5" />
              </motion.span>
            ) : (
              <motion.span
                key="light"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <Moon className="h-5 w-5" />
              </motion.span>
            )}
          </AnimatePresence>
        </Button>

        {/* Notification bell */}
        <div className="relative" ref={bellRef}>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notificaciones"
            aria-expanded={showBell}
            aria-haspopup="true"
            className="text-[var(--text-muted)] hover:text-[var(--text-base)] relative"
            onClick={() => setShowBell((v) => !v)}
          >
            <Bell className="h-5 w-5" />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  key="badge"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-1 -right-1 bg-[var(--color-primary)] text-[var(--color-primary-contrast)] text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                >
                  {unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>

          <AnimatePresence>
            {showBell && (
              <motion.div
                key="bell-panel"
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute right-0 top-12 w-80 rounded-xl overflow-hidden shadow-lg"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-base)",
                }}
              >
                {/* Header */}
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ borderBottom: "1px solid var(--border-base)" }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-base)" }}
                  >
                    Notificaciones
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-[var(--color-primary)] hover:underline"
                    >
                      Marcar leído
                    </button>
                  )}
                </div>

                {/* Items */}
                <div className="max-h-72 overflow-y-auto" aria-live="polite" aria-label="Lista de notificaciones">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <Bell
                        className="h-8 w-8"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Sin notificaciones
                      </p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className="px-4 py-3 flex gap-3"
                        style={{
                          borderBottom: "1px solid var(--border-base)",
                          background: n.is_read
                            ? "transparent"
                            : "var(--bg-base)",
                        }}
                      >
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]"
                          style={{ opacity: n.is_read ? 0.3 : 1 }}
                        />
                        <div className="min-w-0">
                          <p
                            className="text-xs font-medium truncate"
                            style={{ color: "var(--text-base)" }}
                          >
                            {n.title}
                          </p>
                          <p
                            className="text-xs mt-0.5 line-clamp-2"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {n.message}
                          </p>
                          <p className="text-[10px] mt-1 text-[var(--text-subtle)]">
                            {formatTimeAgo(n.created_at)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User avatar */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setShowUser((v) => !v)}
            aria-label="Cuenta"
            aria-expanded={showUser}
            aria-haspopup="true"
            className="h-8 w-8 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] text-xs font-bold flex items-center justify-center hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            {getInitials(session?.user?.name)}
          </button>

          <AnimatePresence>
            {showUser && (
              <motion.div
                key="user-panel"
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute right-0 top-12 w-56 rounded-xl overflow-hidden shadow-lg"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-base)",
                }}
              >
                {/* User info header */}
                <div
                  className="px-4 py-3"
                  style={{ borderBottom: "1px solid var(--border-base)" }}
                >
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--text-base)" }}
                  >
                    {session?.user?.name ?? "Usuario"}
                  </p>
                  <p
                    className="text-xs truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {session?.user?.email ?? ""}
                  </p>
                </div>

                {/* Settings link */}
                <Link
                  href="/settings"
                  onClick={() => setShowUser(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-base)] transition-colors"
                  style={{ color: "var(--text-base)" }}
                >
                  <Settings className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                  Configuración
                </Link>

                {/* Separator */}
                <div style={{ borderTop: "1px solid var(--border-base)" }} />

                {/* Sign out */}
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-base)] transition-colors text-red-500"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Cerrar sesión
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.header>
  );
}
