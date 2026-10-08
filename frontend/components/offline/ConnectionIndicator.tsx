"use client";

import Link from "next/link";
import { useOffline } from "./OfflineProvider";
import { CloudSlashIcon as CloudOff, ArrowsClockwiseIcon as Sync, WarningIcon as Warning } from "@phosphor-icons/react";

/**
 * En línea no se muestra nada. Sin conexión, sincronizando o con cosas por
 * revisar, una píldora que lleva al Mostrador.
 */
export function ConnectionIndicator() {
  const { online, syncing, pending, review } = useOffline();
  if (online && !syncing && pending === 0 && review.length === 0) return null;

  let tone: "warn" | "info" | "danger" = "info";
  let text: string;
  let Icon = Sync;
  if (!online) {
    tone = "warn";
    Icon = CloudOff;
    text = pending ? `Sin conexión · ${pending} por subir` : "Sin conexión";
  } else if (syncing || pending) {
    text = `Sincronizando${pending ? ` ${pending}` : ""}…`;
  } else {
    tone = "danger";
    Icon = Warning;
    text = `${review.length} por revisar`;
  }

  return (
    <Link
      href="/checkins"
      role="status"
      aria-live="polite"
      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border px-2.5 text-xs font-medium"
      style={{ color: `var(--signal-${tone})`, background: `var(--signal-${tone}-bg)`, borderColor: `var(--signal-${tone}-line)` }}
    >
      <Icon className={syncing ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
      {text}
    </Link>
  );
}
