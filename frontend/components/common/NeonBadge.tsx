"use client";

const variants: Record<string, string> = {
  primary: "bg-orange-50 text-orange-600 border-orange-200",
  accent:  "bg-amber-50 text-amber-600 border-amber-200",
  gold:    "bg-amber-50 text-amber-600 border-amber-200",
  blue:    "bg-blue-50 text-blue-600 border-blue-200",
  info:    "bg-blue-50 text-blue-600 border-blue-200",
  success: "bg-green-50 text-green-600 border-green-200",
  danger:  "bg-red-50 text-red-600 border-red-200",
  warning: "bg-amber-50 text-amber-600 border-amber-200",
  muted:   "bg-slate-100 text-slate-500 border-slate-200",
};

export function NeonBadge({ label, variant = "primary" }: { label: string; variant?: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${variants[variant] ?? variants.muted}`}
    >
      {label}
    </span>
  );
}

export { NeonBadge as StatusBadge };
