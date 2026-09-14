"use client";

import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MoneyIcon as Banknote, CreditCardIcon as CreditCard, BankIcon as Landmark, DeviceMobileIcon as Smartphone } from "@phosphor-icons/react";
import type { DestinationAccount } from "./shared";

export type Method = "cash" | "transfer" | "card";

const METHODS: { key: Method; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Efectivo", icon: Banknote },
  { key: "transfer", label: "Transferencia", icon: Landmark },
  { key: "card", label: "Tarjeta", icon: CreditCard },
];

export interface MethodDetails {
  transfer_account_id: string | null;
  card_approval_code: string;
  card_terminal: string;
}

export const EMPTY_DETAILS: MethodDetails = { transfer_account_id: null, card_approval_code: "", card_terminal: "" };

/** Selector de método + detalle según método: cuenta destino (transferencia)
 * o voucher del datáfono (tarjeta). */
export function MethodPicker({
  value,
  onChange,
  accounts = [],
  details,
  onDetailsChange,
}: {
  value: Method;
  onChange: (m: Method) => void;
  accounts?: DestinationAccount[];
  details?: MethodDetails;
  onDetailsChange?: (d: MethodDetails) => void;
}) {
  const active = accounts.filter((a) => (a as { is_active?: boolean }).is_active !== false);
  const d = details ?? EMPTY_DETAILS;
  const set = (patch: Partial<MethodDetails>) => onDetailsChange?.({ ...d, ...patch });

  // La cuenta elegida puede desactivarse mientras el POS está abierto
  useEffect(() => {
    if (d.transfer_account_id && !active.some((a) => a.id === d.transfer_account_id)) {
      onDetailsChange?.({ ...d, transfer_account_id: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {METHODS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 py-2 text-xs font-medium transition-ui",
              value === key
                ? "border-primary bg-primary-muted text-ink"
                : "border-line text-ink-muted hover:border-primary/50 hover:text-ink"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {value === "transfer" && active.length > 1 && onDetailsChange && (
        <div className="flex gap-1.5 flex-wrap">
          {active.map((a) => {
            const selected = d.transfer_account_id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => set({ transfer_account_id: a.id })}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 text-xs transition-ui",
                  selected
                    ? "border-primary bg-primary-muted text-ink font-medium"
                    : "border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
                )}
              >
                {a.type === "nequi" || a.type === "daviplata" ? (
                  <Smartphone className="h-3 w-3" />
                ) : (
                  <Landmark className="h-3 w-3" />
                )}
                {a.label}
              </button>
            );
          })}
        </div>
      )}
      {value === "transfer" && active.length === 0 && (
        <p className="text-xs text-[var(--signal-warn)]">
          Sin cuentas de recaudo: agrégalas en Ajustes › Recaudo para cobrar por transferencia.
        </p>
      )}

      {value === "card" && onDetailsChange && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={d.card_approval_code}
            onChange={(e) => set({ card_approval_code: e.target.value })}
            placeholder="Nº aprobación voucher"
            className="text-sm"
          />
          <Input
            value={d.card_terminal}
            onChange={(e) => set({ card_terminal: e.target.value })}
            placeholder="Datáfono (opcional)"
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}
