import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/common/BrandLockup";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Página no encontrada · LSMFit",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-5">
          <Link href="/" aria-label="LSMFit, inicio">
            <BrandLockup height={22} />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-16">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-primary-ink">Error 404</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3rem)] font-bold leading-[1.05] tracking-[-0.03em] [text-wrap:balance]">
          Esta página no existe
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          Puede que el enlace esté mal escrito o que la página se haya movido. Desde aquí puedes volver a lo que buscabas.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-md)] bg-primary px-6 font-semibold text-primary-contrast shadow-[var(--shadow-primary)] hover:bg-[var(--color-primary-hover)]"
          >
            Ir al inicio
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-md)] border border-line bg-panel px-6 font-semibold text-ink hover:bg-muted"
          >
            Entrar a mi gimnasio
          </Link>
        </div>
        <p className="mt-10 text-sm text-ink-muted">
          ¿Llegaste aquí desde un enlace nuestro? Avísanos a{" "}
          <a href={`mailto:${LEGAL.email}`} className="font-semibold text-primary-ink underline-offset-4 hover:underline">
            {LEGAL.email}
          </a>
          .
        </p>
      </main>
    </div>
  );
}
