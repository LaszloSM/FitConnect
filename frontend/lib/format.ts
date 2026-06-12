import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const copCompactFormatter = new Intl.NumberFormat("es-CO", {
  notation: "compact",
  compactDisplay: "short",
});

export function formatCOP(amount: number | string): string {
  return copFormatter.format(Number(amount) || 0);
}

export function formatCOPCompact(amount: number | string): string {
  return copCompactFormatter.format(Number(amount) || 0);
}

export function formatDate(value: string | Date, pattern = "d MMM yyyy"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, pattern, { locale: es });
}

export function formatTimeAgo(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}
