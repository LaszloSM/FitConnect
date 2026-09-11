"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { GlassCard } from "@/components/common/GlassCard";
import { apiClient } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { CalendarClock, AlertTriangle, ShieldX, Phone, Wallet, PackageOpen } from "lucide-react";

interface ExpiringItem {
  membership_id: string;
  member_id: string;
  member_name: string;
  phone: string | null;
  plan_name: string;
  end_date: string;
  days_left: number;
}

interface GraceItem {
  membership_id: string;
  member_id: string;
  member_name: string;
  phone: string | null;
  plan_name: string;
  end_date: string;
  days_overdue: number;
}

interface DeniedItem {
  checkin_id: string;
  member_id: string;
  member_name: string;
  reason: string | null;
  at: string;
}

interface OperationsData {
  expiring_this_week: ExpiringItem[];
  in_grace: GraceItem[];
  denied_today: DeniedItem[];
  grace_days: number;
}

const DENIAL_LABELS: Record<string, string> = {
  expired: "vencida",
  frozen: "congelada",
  no_membership: "sin membresía",
};

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

interface ShiftInfo {
  open: boolean;
  cash_shifts_enabled?: boolean;
  shift?: { id: string; opening_amount: number; opened_at: string } | null;
}

interface LowStockProduct {
  id: string;
  name: string;
  stock: number;
  low_stock_threshold: number;
}

export function OperationsToday() {
  const { data: session } = useSession();
  const [data, setData] = useState<OperationsData | null>(null);
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client.get("/api/v1/dashboard/operations").then((res) => setData(res.data)).catch(() => {});
    client.get("/api/v1/cash/shifts/current").then((res) => setShift(res.data)).catch(() => {});
    client.get("/api/v1/products", { params: { low_stock: true } }).then((res) => setLowStock(res.data)).catch(() => {});
  }, [session?.accessToken]);

  if (!data) return null;
  const { expiring_this_week, in_grace, denied_today } = data;

  return (
    <div className="space-y-4 mb-6">
      {/* Estado operativo: caja + stock */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <GlassCard className="p-4 flex items-center gap-3">
          <span
            className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
              shift?.open || shift?.cash_shifts_enabled === false
                ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600"
                : "bg-amber-100 dark:bg-amber-950/40 text-amber-600"
            }`}
          >
            <Wallet className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-base)]">
              {shift?.open
                ? "Turno de caja abierto"
                : shift?.cash_shifts_enabled === false
                ? "Caja sin turnos"
                : "Caja cerrada"}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {shift?.open
                ? `Base: ${formatCOP(shift.shift?.opening_amount ?? 0)}`
                : shift?.cash_shifts_enabled === false
                ? "Cobras en efectivo sin abrir turno"
                : "Abre el turno para cobrar en efectivo"}
            </p>
          </div>
          <Link
            href="/payments/cash"
            className="shrink-0 text-[11px] font-semibold text-[var(--color-primary-ink)] border border-[var(--border-base)] rounded-lg px-2 py-1 hover:bg-[var(--bg-base)] transition-colors"
          >
            {shift?.open || shift?.cash_shifts_enabled === false ? "Ver caja" : "Abrir turno"}
          </Link>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-3">
          <span
            className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
              lowStock.length > 0
                ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600"
                : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600"
            }`}
          >
            <PackageOpen className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-base)]">
              {lowStock.length > 0
                ? `${lowStock.length} producto${lowStock.length !== 1 ? "s" : ""} con stock bajo`
                : "Inventario al día"}
            </p>
            <p className="text-xs text-[var(--text-muted)] truncate">
              {lowStock.length > 0
                ? lowStock.slice(0, 3).map((p) => `${p.name} (${p.stock})`).join(", ")
                : "Ningún producto por debajo del mínimo"}
            </p>
          </div>
          <Link
            href="/payments"
            className="shrink-0 text-[11px] font-semibold text-[var(--color-primary-ink)] border border-[var(--border-base)] rounded-lg px-2 py-1 hover:bg-[var(--bg-base)] transition-colors"
          >
            Productos
          </Link>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Vencen esta semana */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-[var(--text-base)]">Vencen esta semana</h3>
          <span className="ml-auto text-xs text-[var(--text-muted)]">{expiring_this_week.length}</span>
        </div>
        {expiring_this_week.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-2">Nada vence en los próximos 7 días.</p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {expiring_this_week.slice(0, 8).map((item) => (
              <div key={item.membership_id} className="flex items-center gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/members/${item.member_id}`} className="text-[var(--text-base)] hover:text-[var(--color-primary-ink)] truncate block">
                    {item.member_name}
                  </Link>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {item.days_left === 0 ? "vence hoy" : `en ${item.days_left} día${item.days_left !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <Link
                  href={`/payments?member=${item.member_id}`}
                  className="shrink-0 text-[11px] font-semibold text-[var(--color-primary-ink)] border border-[var(--border-base)] rounded-lg px-2 py-1 hover:bg-[var(--bg-base)] transition-colors"
                >
                  Cobrar
                </Link>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Morosos en gracia */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-[var(--text-base)]">Morosos en gracia</h3>
          <span className="ml-auto text-xs text-[var(--text-muted)]">{in_grace.length}</span>
        </div>
        {in_grace.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-2">Sin morosos dentro del período de gracia.</p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {in_grace.slice(0, 8).map((item) => {
              const wa = waLink(item.phone, `Hola ${item.member_name}, tu membresía venció hace ${item.days_overdue} día(s). ¿Renovamos?`);
              return (
                <div key={item.membership_id} className="flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/members/${item.member_id}`} className="text-[var(--text-base)] hover:text-[var(--color-primary-ink)] truncate block">
                      {item.member_name}
                    </Link>
                    <p className="text-[11px] text-orange-500">venció hace {item.days_overdue} día{item.days_overdue !== 1 ? "s" : ""}</p>
                  </div>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="shrink-0 text-emerald-600 hover:text-emerald-700" title="Recordar por WhatsApp">
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Accesos denegados hoy */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldX className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-semibold text-[var(--text-base)]">Denegados hoy</h3>
          <span className="ml-auto text-xs text-[var(--text-muted)]">{denied_today.length}</span>
        </div>
        {denied_today.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-2">Ningún acceso denegado hoy.</p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {denied_today.slice(0, 8).map((item) => (
              <div key={item.checkin_id} className="flex items-center gap-2 text-sm">
                <Link href={`/members/${item.member_id}`} className="text-[var(--text-base)] hover:text-[var(--color-primary-ink)] truncate flex-1">
                  {item.member_name}
                </Link>
                <span className="shrink-0 text-[11px] text-red-500">
                  {item.reason ? DENIAL_LABELS[item.reason] ?? item.reason : "denegado"}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
      </div>
    </div>
  );
}
