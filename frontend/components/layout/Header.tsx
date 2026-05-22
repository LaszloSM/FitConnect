"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { GlassCard } from "@/components/common/GlassCard";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export function Header({ gymName }: { gymName?: string }) {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;

    const fetchNotifications = async () => {
      try {
        const client = apiClient(session.accessToken as string);
        const res = await client.get("/api/v1/notifications?unread_only=true&limit=5");
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

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 fixed top-0 right-0 left-64 z-10">
      <div className="flex flex-col">
        <h1 className="text-slate-800 font-semibold font-display">{gymName ?? "Mi Gym"}</h1>
        {session?.user?.name && (
          <p className="text-xs text-slate-500">Bienvenido, {session.user.name}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-500 hover:text-slate-800 relative"
            aria-label="Notificaciones"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </Button>
          {showDropdown && (
            <GlassCard className="absolute right-0 top-10 w-80 p-0 overflow-hidden">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <p className="text-slate-800 text-sm font-medium">Notificaciones</p>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-orange-500 text-xs hover:underline">
                    Marcar todo leído
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-4">Sin notificaciones</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 border-b border-slate-200 last:border-0 ${
                        !n.is_read ? "bg-orange-50" : ""
                      }`}
                    >
                      <p className="text-slate-800 text-xs font-medium">{n.title}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-500 hover:text-red-500"
          aria-label="Cerrar sesión"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
