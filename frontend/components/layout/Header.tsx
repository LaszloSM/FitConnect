"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  const sessionData = useSession(); const session = sessionData?.data;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const fetchNotifications = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/notifications?unread_only=true&limit=5");
      setNotifications(res.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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
    <header className="h-16 bg-[#0F0F1A] border-b border-[#1E1E35] flex items-center justify-between px-6 fixed top-0 right-0 left-64 z-10">
      <div className="flex flex-col">
        <h1 className="text-white font-semibold font-display">{gymName ?? "Mi Gym"}</h1>
        {session?.user?.name && (
          <p className="text-xs text-[#94A3B8]">Welcome, {session.user.name}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="text-[#94A3B8] hover:text-white relative"
            aria-label="Notificaciones"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </Button>
          {showDropdown && (
            <GlassCard className="absolute right-0 top-10 w-80 p-0 overflow-hidden">
              <div className="p-3 border-b border-border-dark flex items-center justify-between">
                <p className="text-white text-sm font-medium">Notificaciones</p>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-primary text-xs hover:underline">
                    Marcar todo leido
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-muted text-xs text-center py-4">Sin notificaciones</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 border-b border-border-dark last:border-0 ${
                        !n.is_read ? "bg-primary/5" : ""
                      }`}
                    >
                      <p className="text-white text-xs font-medium">{n.title}</p>
                      <p className="text-muted text-xs mt-0.5">{n.message}</p>
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
          className="text-[#94A3B8] hover:text-danger"
          aria-label="Cerrar sesion"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}


