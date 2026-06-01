"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NotificationPrefs {
  expiring_memberships: boolean;
  payment_alerts: boolean;
  new_members: boolean;
  low_attendance: boolean;
}

interface NotifItem {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
}

const NOTIF_ITEMS: NotifItem[] = [
  {
    key: "expiring_memberships",
    label: "Membresías por vencer",
    description: "Alertas cuando las membresías de miembros están próximas a vencer",
  },
  {
    key: "payment_alerts",
    label: "Alertas de pagos",
    description: "Notificaciones de pagos pendientes o vencidos",
  },
  {
    key: "new_members",
    label: "Nuevos miembros",
    description: "Aviso cuando se registra un nuevo socio",
  },
  {
    key: "low_attendance",
    label: "Baja asistencia",
    description: "Alerta cuando la asistencia diaria cae por debajo del promedio",
  },
];

function Toggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2",
        checked ? "bg-[var(--color-primary)]" : "bg-[var(--border-base)]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

export default function NotificationsSection() {
  const { data: session } = useSession();
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    expiring_memberships: true,
    payment_alerts: true,
    new_members: true,
    low_attendance: false,
  });
  const [saving, setSaving] = useState<keyof NotificationPrefs | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/settings/notifications").then((res) => {
      setPrefs(res.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleToggle = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!session?.accessToken || saving) return;
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setSaving(key);
    try {
      const client = apiClient(session.accessToken as string);
      await client.patch("/api/v1/settings/notifications", { [key]: value });
      toast.success("Preferencias actualizadas", { duration: 2000 });
    } catch (err: any) {
      setPrefs((prev) => ({ ...prev, [key]: !value }));
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error actualizando preferencias");
    } finally {
      setSaving(null);
    }
  };

  return (
    <GlassCard className="p-6">
      <p className="text-[var(--text-base)] font-semibold mb-1">Notificaciones</p>
      <p className="text-[var(--text-muted)] text-sm mb-5">
        Activa o desactiva cada tipo de alerta. Los cambios se guardan automáticamente.
      </p>

      <div className="space-y-1">
        {NOTIF_ITEMS.map((item, i) => (
          <div
            key={item.key}
            className={cn(
              "flex items-center justify-between py-3.5 px-1",
              i < NOTIF_ITEMS.length - 1 && "border-b border-[var(--border-base)]"
            )}
          >
            <div className="pr-8">
              <label
                htmlFor={`notif-${item.key}`}
                className="text-sm font-medium text-[var(--text-base)] cursor-pointer"
              >
                {item.label}
              </label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.description}</p>
            </div>
            <Toggle
              id={`notif-${item.key}`}
              checked={prefs[item.key]}
              onChange={(v) => handleToggle(item.key, v)}
              disabled={saving !== null}
            />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
