"use client";

import Link from "next/link";
import { formatCOP } from "@/lib/format";
import type { OperationsData, ShiftInfo } from "@/hooks/useDashboardData";
import { ChatCircleIcon as MessageCircle } from "@phosphor-icons/react";
import { Panel, PanelNote, PanelRow } from "./Panel";

const DENIAL_LABELS: Record<string, string> = {
  expired: "Membresía vencida",
  frozen: "Membresía congelada",
  no_membership: "Sin membresía",
  no_entries: "Sin entradas",
};

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const rowAction =
  "inline-flex h-8 shrink-0 items-center rounded-[var(--radius-md)] border border-line px-3 text-sm font-medium text-ink transition-colors hover:bg-muted";

/** Vencen esta semana: la lista con la acción de cobro, que es la tarea del día. */
export function ExpiringPanel({ data, className }: { data: OperationsData | null; className?: string }) {
  const items = data?.expiring_this_week ?? [];
  return (
    <Panel className={className} title="Vencen esta semana" count={data ? items.length : undefined}
      action={items.length > 6 ? { href: "/payments?tab=receivables", label: "Ver todas" } : undefined}>
      {!data ? (
        <PanelNote tone="warn">No se pudo cargar.</PanelNote>
      ) : items.length === 0 ? (
        <PanelNote>Ninguna membresía vence en los próximos 7 días.</PanelNote>
      ) : (
        <ul className="divide-y divide-line">
          {items.slice(0, 6).map((item) => (
            <PanelRow key={item.membership_id}>
              <div className="min-w-0 flex-1">
                <Link href={`/members/${item.member_id}`} className="block truncate text-sm font-medium text-ink hover:text-primary-ink">
                  {item.member_name}
                </Link>
                <p className="truncate text-xs text-ink-muted">
                  {item.plan_name} · {item.days_left === 0 ? "vence hoy" : `vence en ${item.days_left} día${item.days_left !== 1 ? "s" : ""}`}
                </p>
              </div>
              <Link href={`/payments?member=${item.member_id}`} className={rowAction}>
                Cobrar
              </Link>
            </PanelRow>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Morosos en gracia y denegados: solo aparecen cuando hay algo que atender. */
export function AttentionPanels({ data, className }: { data: OperationsData | null; className?: string }) {
  if (!data) return null;
  const { in_grace, denied_today } = data;
  return (
    <>
      {in_grace.length > 0 && (
        <Panel className={className} title="En período de gracia" count={in_grace.length}>
          <ul className="divide-y divide-line">
            {in_grace.slice(0, 6).map((item) => {
              const wa = waLink(item.phone, `Hola ${item.member_name}, tu membresía venció hace ${item.days_overdue} día(s). ¿La renovamos?`);
              return (
                <PanelRow key={item.membership_id}>
                  <div className="min-w-0 flex-1">
                    <Link href={`/members/${item.member_id}`} className="block truncate text-sm font-medium text-ink hover:text-primary-ink">
                      {item.member_name}
                    </Link>
                    <p className="text-xs" style={{ color: "var(--signal-warn)" }}>
                      Venció hace {item.days_overdue} día{item.days_overdue !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className={rowAction} aria-label={`Escribir a ${item.member_name} por WhatsApp`}>
                      <MessageCircle className="mr-1.5 size-4" /> WhatsApp
                    </a>
                  )}
                  <Link href={`/payments?member=${item.member_id}`} className={rowAction}>
                    Cobrar
                  </Link>
                </PanelRow>
              );
            })}
          </ul>
        </Panel>
      )}

      {denied_today.length > 0 && (
        <Panel className={className} title="No pudieron entrar hoy" count={denied_today.length}>
          <ul className="divide-y divide-line">
            {denied_today.slice(0, 6).map((item) => (
              <PanelRow key={item.checkin_id}>
                <Link href={`/members/${item.member_id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-primary-ink">
                  {item.member_name}
                </Link>
                <span className="shrink-0 text-xs" style={{ color: "var(--signal-danger)" }}>
                  {item.reason ? DENIAL_LABELS[item.reason] ?? item.reason : "Denegado"}
                </span>
              </PanelRow>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

interface LowStockProduct {
  id: string;
  name: string;
  stock: number;
  low_stock_threshold: number;
}

function StatusLine({ ok, title, detail, href, cta }: { ok: boolean; title: string; detail: string; href: string; cta: string }) {
  return (
    <PanelRow>
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ background: ok ? "var(--signal-ok)" : "var(--signal-warn)" }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="truncate text-xs text-ink-muted">{detail}</p>
      </div>
      <Link href={href} className="shrink-0 text-sm font-medium text-primary-ink hover:underline">
        {cta}
      </Link>
    </PanelRow>
  );
}

/** Estado operativo: turno de caja, inventario y equipos, una línea cada uno. */
export function OperationsStatus({
  shift,
  lowStock,
  machines,
  className,
}: {
  shift: ShiftInfo | null;
  lowStock: LowStockProduct[];
  machines: { total: number; down: number } | null;
  className?: string;
}) {
  const cajaLista = !!shift?.open || shift?.cash_shifts_enabled === false;
  return (
    <Panel className={className} title="Estado del gimnasio">
      <ul className="divide-y divide-line">
        <StatusLine
          ok={cajaLista}
          title={shift?.open ? "Turno de caja abierto" : shift?.cash_shifts_enabled === false ? "Caja sin turnos" : "Caja cerrada"}
          detail={
            shift?.open
              ? `Base ${formatCOP(shift.shift?.opening_amount ?? 0)}`
              : shift?.cash_shifts_enabled === false
              ? "Se cobra en efectivo sin abrir turno"
              : "Abre el turno para recibir efectivo"
          }
          href="/payments/cash"
          cta={cajaLista ? "Ver caja" : "Abrir turno"}
        />
        <StatusLine
          ok={lowStock.length === 0}
          title={lowStock.length > 0 ? `${lowStock.length} producto${lowStock.length !== 1 ? "s" : ""} con stock bajo` : "Inventario al día"}
          detail={lowStock.length > 0 ? lowStock.slice(0, 3).map((p) => `${p.name} (${p.stock})`).join(", ") : "Ningún producto por debajo del mínimo"}
          href="/payments?tab=products"
          cta="Productos"
        />
        {machines && machines.total > 0 && (
          <StatusLine
            ok={machines.down === 0}
            title={machines.down > 0 ? `${machines.down} equipo${machines.down !== 1 ? "s" : ""} fuera de servicio` : "Equipos operativos"}
            detail={`${machines.total - machines.down} de ${machines.total} funcionando`}
            href="/machines"
            cta="Máquinas"
          />
        )}
      </ul>
    </Panel>
  );
}
