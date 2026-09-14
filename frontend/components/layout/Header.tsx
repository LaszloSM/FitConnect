"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { BellIcon as Bell, SignOutIcon as LogOut, ListIcon as Menu, MoonIcon as Moon, GearSixIcon as Settings, SunIcon as Sun } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatDateTime, formatTimeAgo, todayInGym } from "@/lib/format";
import { apiClient } from "@/lib/api";
import { useSidebar } from "@/components/layout/SidebarContext";
import { BrandMark } from "@/components/common/BrandMark";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const iconButton =
  "relative flex size-10 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const popover =
  "absolute right-0 top-12 z-50 origin-top-right overflow-hidden rounded-[var(--radius-xl)] bg-panel shadow-[var(--shadow-dialog)] animate-[scaleIn_150ms_var(--ease-out)]";

/** Cierra un menú al hacer clic afuera o con Escape. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLDivElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

export function Header() {
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const { setMobileOpen } = useSidebar();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // El tema vive en localStorage: pintarlo antes de montar rompe la hidratación.
  const esOscuro = mounted && resolvedTheme === "dark";

  // Fecha del gym (Bogotá), no la del navegador; solo se levanta la inicial.
  const fecha = format(todayInGym(), "EEEE d 'de' MMMM", { locale: es });
  const hoy = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  // La hora del gimnasio en vivo: el panel habla de "a esta hora".
  const [hora, setHora] = useState("");
  useEffect(() => {
    const tick = () => setHora(formatDateTime(new Date(), "HH:mm"));
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [gymName, setGymName] = useState<string | null>(null);
  const [showBell, setShowBell] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  useDismiss(showBell, bellRef, () => setShowBell(false));
  useDismiss(showUser, userRef, () => setShowUser(false));

  useEffect(() => {
    if (!session?.accessToken) return;
    apiClient(session.accessToken as string)
      .get("/api/v1/settings/gym")
      .then((res) => setGymName(res.data?.name ?? null))
      .catch(() => {});
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) return;
    const fetchNotifications = async () => {
      try {
        const res = await apiClient(session.accessToken as string).get(
          "/api/v1/notifications?unread_only=true&limit=5"
        );
        setNotifications(res.data);
      } catch {
        // las notificaciones no pueden tumbar la pantalla
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
      await apiClient(session.accessToken as string).post("/api/v1/notifications/mark-all-read");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    }
  };

  return (
    <header className="fixed right-0 top-0 z-20 flex h-14 items-center gap-2 bg-surface px-3 left-0 lg:left-[var(--sidebar-w)] md:px-6 lg:px-8 transition-[left] duration-200 ease-[var(--ease-out)]">
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        className={cn(iconButton, "hidden md:flex lg:hidden")}
      >
        <Menu className="size-5" />
      </button>
      <span className="md:hidden">
        <BrandMark size={26} />
      </span>

      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className="truncate text-[15px] font-semibold text-ink">{gymName ?? "FitConnect"}</span>
      </div>

      <span className="hidden whitespace-nowrap pr-2 text-sm text-ink-muted sm:inline">
        {mounted ? hoy : ""}
        {mounted && hora && (
          <>
            , <span className="num text-ink">{hora}</span>
          </>
        )}
      </span>

      <button
        aria-label={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        onClick={() => setTheme(esOscuro ? "light" : "dark")}
        className={iconButton}
      >
        {esOscuro ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </button>

      <div className="relative" ref={bellRef}>
        <button
          aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones"}
          aria-expanded={showBell}
          aria-haspopup="true"
          className={iconButton}
          onClick={() => setShowBell((v) => !v)}
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-semibold leading-none text-primary-contrast tabular-nums">
              {unreadCount}
            </span>
          )}
        </button>

        {showBell && (
          <div className={cn(popover, "w-[min(20rem,calc(100vw-1.5rem))]")}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-semibold text-ink">Notificaciones</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-sm text-primary-ink hover:underline">
                  Marcar todo como leído
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto" aria-live="polite">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">No tienes avisos pendientes.</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={cn("flex gap-3 border-b border-line px-4 py-3 last:border-b-0", !n.is_read && "bg-surface")}>
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full bg-primary", n.is_read && "opacity-30")} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{n.message}</p>
                      <p className="mt-1 text-xs text-ink-subtle">{formatTimeAgo(n.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="relative" ref={userRef}>
        <button
          onClick={() => setShowUser((v) => !v)}
          aria-label="Cuenta"
          aria-expanded={showUser}
          aria-haspopup="true"
          className="flex size-10 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-primary-muted text-xs font-bold text-primary-ink">
            {getInitials(session?.user?.name)}
          </span>
        </button>

        {showUser && (
          <div className={cn(popover, "w-60")}>
            <div className="border-b border-line px-4 py-3">
              <p className="truncate text-sm font-medium text-ink">{session?.user?.name ?? "Usuario"}</p>
              <p className="truncate text-sm text-ink-muted">{session?.user?.email ?? ""}</p>
            </div>
            <Link
              href="/settings"
              onClick={() => setShowUser(false)}
              className="flex h-11 items-center gap-3 px-4 text-sm text-ink hover:bg-muted"
            >
              <Settings className="size-4 shrink-0 text-ink-muted" />
              Configuración
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex h-11 w-full items-center gap-3 border-t border-line px-4 text-sm text-[var(--signal-danger)] hover:bg-muted"
            >
              <LogOut className="size-4 shrink-0" />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
