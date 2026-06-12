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

/** El backend guarda timestamps UTC sin sufijo de zona ("2026-06-12T02:10:00").
 * Parsearlos directo los corre 5h (Bogotá): si no traen zona, son UTC. */
export function parseUTC(value: string | Date): Date {
  if (value instanceof Date) return value;
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(value);
  const isDateTime = value.includes("T");
  return new Date(isDateTime && !hasZone ? value + "Z" : value);
}

export function formatDate(value: string | Date, pattern = "d MMM yyyy"): string {
  const date = parseUTC(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, pattern, { locale: es });
}

export function formatTimeAgo(value: string | Date): string {
  const date = parseUTC(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}
