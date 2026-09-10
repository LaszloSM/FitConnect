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

/** Zona del gym: todo lo que se muestra en el panel va en esta hora, no en la del
 * navegador, para que cuadre con los reportes del backend (que usan Bogotá).
 * Cuando haya gyms en otro huso, esto se alimenta de /settings/gym (`timezone`). */
export const GYM_TIMEZONE = "America/Bogota";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** El backend guarda timestamps UTC sin sufijo de zona ("2026-06-12T02:10:00").
 * Parsearlos directo los corre 5h (Bogotá): si no traen zona, son UTC. */
export function parseUTC(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (DATE_ONLY.test(value)) return parseDateOnly(value);
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(value);
  const isDateTime = value.includes("T");
  return new Date(isDateTime && !hasZone ? value + "Z" : value);
}

/** Fechas puras del backend ("2026-09-10": vencimientos, cumpleaños). `new Date`
 * las lee como medianoche UTC, que en Bogotá es el día ANTERIOR: un plan vigente
 * aparecía vencido. Se anclan al mediodía local, inmune al desfase. */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return value;
  const day = value.slice(0, 10);
  return new Date(`${day}T12:00:00`);
}

/** Hoy en la zona del gym, en formato "YYYY-MM-DD".
 * `new Date().toISOString().slice(0,10)` da la fecha UTC: después de las 7pm de
 * Bogotá devuelve MAÑANA, y así se guardaban membresías que arrancaban al día
 * siguiente. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: GYM_TIMEZONE }).format(new Date());
}

/** Días de calendario entre hoy (en el gym) y una fecha pura del backend.
 * Negativo = ya pasó. Se calcula con aritmética de calendario, no con instantes:
 * comparar `new Date(end_date)` contra `Date.now()` daba "vencido" un día antes en
 * cualquier navegador que no estuviera en Bogotá. */
export function daysUntil(dateOnly: string): number {
  const dia = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((dia(dateOnly) - dia(todayISO())) / 86_400_000);
}

/** Una membresía que vence HOY sigue vigente todo el día. */
export function isExpired(endDate: string): boolean {
  return daysUntil(endDate) < 0;
}

/** Un Date del selector de fechas → "YYYY-MM-DD" con SU día del calendario.
 * `toISOString()` pasa por UTC y puede devolver el día anterior o el siguiente. */
export function toISODate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function inGymZone(date: Date): Date {
  // Reinterpreta el instante en la zona del gym para que date-fns lo formatee ahí.
  return new Date(date.toLocaleString("en-US", { timeZone: GYM_TIMEZONE }));
}

export function formatDate(value: string | Date, pattern = "d MMM yyyy"): string {
  // Una fecha pura ya es un día del calendario, no un instante: convertirla de zona
  // la correría un día en navegadores lejos de Bogotá. Solo los instantes se mueven.
  const esFechaPura = typeof value === "string" && DATE_ONLY.test(value);
  const date = parseUTC(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(esFechaPura ? date : inGymZone(date), pattern, { locale: es });
}

/** Fecha y hora en la zona del gym: un cobro de las 8pm dice 8pm. */
export function formatDateTime(value: string | Date, pattern = "d MMM yyyy, HH:mm"): string {
  return formatDate(value, pattern);
}

export function formatTimeAgo(value: string | Date): string {
  const date = parseUTC(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}
