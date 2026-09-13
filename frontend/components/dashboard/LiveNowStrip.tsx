"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { useReceptionEvents } from "@/hooks/useReceptionEvents";
import { StatusBadge } from "@/components/ui/status-badge";
import { Panel, PanelNote, PanelRow } from "./Panel";

export interface TodayEntry {
  id: string;
  member_name: string | null;
  decision: string | null;
  created_at: string;
}

/**
 * Entradas en vivo: los datos iniciales llegan desde la única espera del panel
 * y aquí se mantiene el flujo por SSE. Se muestra la hora absoluta: "hace
 * alrededor de 8 horas" repetido en cada fila no deja ordenar la mañana.
 */
export function useLiveEntries(initialEntries: TodayEntry[]) {
  const [entries, setEntries] = useState<TodayEntry[]>(initialEntries);

  // El valor de `useState` solo cuenta en el primer render.
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  useReceptionEvents((event) => {
    if (event.type !== "checkin") return;
    setEntries((prev) => [
      { id: `${event.member_id}-${event.at}`, member_name: event.member_name, decision: event.decision, created_at: event.at },
      ...prev,
    ]);
  });

  return entries;
}

const DECISION: Record<string, { status: string; label: string }> = {
  allowed: { status: "allowed", label: "Permitido" },
  override: { status: "override", label: "Autorizado" },
  denied: { status: "denied", label: "Denegado" },
};

export function LiveEntries({ entries, className }: { entries: TodayEntry[]; className?: string }) {
  const shown = entries.slice(0, 8);
  return (
    <Panel
      className={className}
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
          Entradas en vivo
        </span>
      }
      count={entries.length}
      action={{ href: "/checkins", label: "Ver todas" }}
    >
      {shown.length === 0 ? (
        <PanelNote>Nadie ha entrado todavía hoy. Las entradas del kiosko aparecen aquí al instante.</PanelNote>
      ) : (
        <ul className="divide-y divide-line" aria-live="polite">
          {shown.map((e) => {
            const d = DECISION[e.decision ?? "allowed"] ?? DECISION.allowed;
            return (
              <PanelRow key={e.id}>
                <span className="w-11 shrink-0 font-mono text-sm text-ink-muted tabular-nums">
                  {formatDateTime(e.created_at, "HH:mm")}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {e.member_name ?? "Socio sin nombre"}
                </span>
                <StatusBadge status={d.status} label={d.label} />
              </PanelRow>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
