import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Sección del panel: superficie con línea y un encabezado de una fila
 * (título, conteo opcional y una acción). Todas las secciones del panel usan
 * esta misma forma para que la página se lea como un solo objeto.
 */
export function Panel({
  title,
  count,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  count?: number;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-[var(--radius-lg)] border border-line bg-panel", className)}>
      <header className="flex h-12 items-center gap-2 border-b border-line px-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {count !== undefined && (
          <span className="font-mono text-xs text-ink-muted tabular-nums">{count}</span>
        )}
        {action && (
          <Link href={action.href} className="ml-auto text-sm font-medium text-primary-ink hover:underline">
            {action.label}
          </Link>
        )}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Fila de una lista del panel: nombre + detalle a la izquierda, acción a la derecha. */
export function PanelRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <li className={cn("flex min-h-12 items-center gap-3 px-4 py-2", className)}>{children}</li>;
}

/** Texto de vacío o fallo dentro de una sección. */
export function PanelNote({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" }) {
  return (
    <p
      className="px-4 py-4 text-sm"
      style={{ color: tone === "warn" ? "var(--signal-warn)" : "var(--text-muted)" }}
    >
      {children}
    </p>
  );
}
