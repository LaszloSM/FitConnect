const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export const money = (n: number) => cop.format(n);

/** Fechas puras ("2026-10-08") son días de calendario: no se convierten de zona. */
export function day(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

/** Instantes del backend: UTC sin zona. Se muestran en hora de Bogotá. */
export function moment(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
}

export const STATUS_LABEL: Record<string, string> = {
  trialing: "En prueba",
  active: "Activo",
  comp: "Cortesía",
  past_due: "Pago pendiente",
  read_only: "Solo lectura",
  suspended: "Suspendido",
};

export const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "info"> = {
  trialing: "info",
  active: "ok",
  comp: "ok",
  past_due: "warn",
  read_only: "danger",
  suspended: "danger",
};
