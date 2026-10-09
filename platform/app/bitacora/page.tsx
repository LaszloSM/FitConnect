"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Notice } from "@/components/StatusPill";
import { api } from "@/lib/api";
import { moment } from "@/lib/format";
import { ACTION_LABEL } from "@/lib/types";

interface Entry {
  action: string;
  admin_email: string | null;
  tenant: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

const ALERT = new Set(["auth.login_failed", "auth.otp_failed", "auth.backup_code_used", "auth.mfa_reset_console"]);

export default function AuditPage() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Entry[]>("/tenants/-/audit?limit=300").then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <Shell>
      <h1 className="font-display text-[32px] font-bold tracking-tight md:text-[40px]">Bitácora</h1>
      <p className="mt-1 text-sm text-ink-muted">Cada ingreso y cada cambio hecho desde este panel. No se puede editar ni borrar.</p>
      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[13px] text-ink-muted">
              <th className="px-4 py-3 font-medium">Cuándo</th>
              <th className="px-4 py-3 font-medium">Quién</th>
              <th className="px-4 py-3 font-medium">Qué</th>
              <th className="px-4 py-3 font-medium">Gimnasio</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows === null && !error && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-muted">Cargando…</td></tr>
            )}
            {rows?.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{moment(r.created_at)}</td>
                <td className="px-4 py-2.5">{r.admin_email ?? "—"}</td>
                <td className="px-4 py-2.5" style={ALERT.has(r.action) ? { color: "var(--signal-danger)" } : undefined}>
                  {ACTION_LABEL[r.action] ?? r.action}
                </td>
                <td className="px-4 py-2.5">{r.tenant ?? "—"}</td>
                <td className="num px-4 py-2.5 text-ink-muted">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
