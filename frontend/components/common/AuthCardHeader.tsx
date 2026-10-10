import Link from "next/link";
import { BrandLockup } from "@/components/common/BrandLockup";

export function AuthCardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8">
      <div className="mb-10 flex items-center justify-between lg:mb-6">
        {/* En escritorio la marca ya está en el panel lateral. */}
        <Link href="/" className="flex items-center gap-2.5 lg:hidden" aria-label="LSMFit, ir al inicio">
          <BrandLockup height={20} />
        </Link>
        <Link href="/" className="ml-auto text-sm text-ink-muted transition-colors hover:text-ink">
          Volver al inicio
        </Link>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
    </div>
  );
}

/** Aviso del formulario de auth: error, advertencia o confirmación. */
export function AuthNotice({ tone, children }: { tone: "danger" | "warn" | "ok"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className="rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
      style={{
        color: `var(--signal-${tone})`,
        background: `var(--signal-${tone}-bg)`,
        borderColor: `var(--signal-${tone}-line)`,
      }}
    >
      {children}
    </p>
  );
}
