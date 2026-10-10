import Link from "next/link";
import { BrandLockup } from "@/components/common/BrandLockup";
import { LEGAL } from "@/lib/legal";

const LINKS = [
  { href: "/terminos", label: "Términos" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/tratamiento-datos", label: "Tratamiento de datos" },
  { href: "/app", label: "App de socios" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/" aria-label="LSMFit, inicio">
            <BrandLockup height={22} />
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm text-ink-muted transition-colors hover:text-ink">
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 md:py-14">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Documentos legales" className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="transition-colors hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <a href={`mailto:${LEGAL.email}`} className="transition-colors hover:text-ink">
            {LEGAL.email}
          </a>
        </div>
      </footer>
    </div>
  );
}
