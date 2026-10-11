import { BrandLockup } from "@/components/common/BrandLockup";

// Vista real del producto en lugar de un eslogan: quien entra ve lo que va a
// operar. Datos de ejemplo, marcados como tal para lectores de pantalla.
const ENTRADAS = [
  { hora: "06:41", nombre: "Felipe Cárdenas", plan: "Plan anual", ok: true },
  { hora: "06:35", nombre: "Valentina Gómez", plan: "Mensual", ok: true },
  { hora: "06:29", nombre: "Andrés Restrepo", plan: "Venció hace 2 días", ok: false },
  { hora: "06:22", nombre: "Daniela Morales", plan: "Trimestral", ok: true },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-surface">
      <aside className="hidden w-[46%] max-w-[600px] flex-col justify-between border-r border-line bg-sidebar p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <BrandLockup height={22} />
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
              Controla quién entra, cobra con recibo y cuadra la caja cada noche.
            </h1>
            <p className="max-w-md text-base text-ink-muted">
              El software de gestión para gimnasios colombianos: cédula, COP y Wompi.
            </p>
          </div>

          <figure
            aria-label="Ejemplo de las entradas del día en LSMFit"
            className="card overflow-hidden"
          >
            <figcaption className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-medium text-ink">Entradas en vivo</span>
              <span className="font-mono text-xs text-ink-muted tabular-nums">23 dentro ahora</span>
            </figcaption>
            <ul className="divide-y divide-line">
              {ENTRADAS.map((e) => (
                <li key={e.hora} className="flex items-center gap-4 px-4 py-3 text-sm">
                  <span className="font-mono text-ink-muted tabular-nums">{e.hora}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{e.nombre}</span>
                    <span className="block truncate text-xs text-ink-muted">{e.plan}</span>
                  </span>
                  <span
                    className="inline-flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 text-xs font-medium"
                    style={
                      e.ok
                        ? { color: "var(--signal-ok)", background: "var(--signal-ok-bg)", borderColor: "var(--signal-ok-line)" }
                        : { color: "var(--signal-danger)", background: "var(--signal-danger-bg)", borderColor: "var(--signal-danger-line)" }
                    }
                  >
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                    {e.ok ? "Permitido" : "Vencido"}
                  </span>
                </li>
              ))}
            </ul>
          </figure>
        </div>

        <p className="text-xs text-ink-subtle">© {new Date().getFullYear()} LSMFit</p>
      </aside>

      <main className="flex flex-1 items-start justify-center px-5 py-10 sm:items-center sm:px-8">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
