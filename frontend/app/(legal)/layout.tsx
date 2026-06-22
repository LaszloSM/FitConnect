import Link from "next/link";
import { BrandMark } from "@/components/common/BrandMark";

const LINKS = [
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos" },
  { href: "/tratamiento-datos", label: "Tratamiento de datos" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-base)]">
      <header className="border-b border-[var(--border-base)]">
        <div className="mx-auto max-w-3xl px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <span className="font-display font-semibold">FitConnect</span>
          </Link>
          <Link href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors">
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">{children}</main>

      <footer className="border-t border-[var(--border-base)]">
        <div className="mx-auto max-w-3xl px-5 py-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--text-muted)]">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-[var(--text-base)] transition-colors">
              {l.label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
