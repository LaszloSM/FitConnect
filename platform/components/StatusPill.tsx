import { STATUS_LABEL, STATUS_TONE } from "@/lib/format";

export function StatusPill({ status, daysLeft }: { status: string; daysLeft?: number | null }) {
  const tone = STATUS_TONE[status] ?? "info";
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border px-2 text-xs font-medium"
      style={{ color: `var(--signal-${tone})`, background: `var(--signal-${tone}-bg)`, borderColor: `var(--signal-${tone}-line)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status] ?? status}
      {daysLeft != null && <span className="num">· {daysLeft} d</span>}
    </span>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "warn" | "danger" | "info"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className="rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
      style={{ color: `var(--signal-${tone})`, background: `var(--signal-${tone}-bg)`, borderColor: `var(--signal-${tone}-line)` }}
    >
      {children}
    </p>
  );
}
