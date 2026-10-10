import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL, LEGAL_PLACE, legalHolder } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Documento legal con índice: en pantallas anchas el índice queda fijo al lado. */
export function LegalDoc({
  title,
  intro,
  sections,
  version,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  version?: string;
}) {
  return (
    <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
      <nav aria-label="En esta página" className="mb-8 hidden lg:block">
        <div className="sticky top-8">
          <p className="mb-3 text-[13px] font-semibold text-ink">En esta página</p>
          <ol className="space-y-1.5 text-[13px]">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-ink-muted transition-colors hover:text-ink">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <article className="min-w-0">
        <header className="mb-8 space-y-2 border-b border-line pb-6">
          <h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.02em] [text-wrap:balance] md:text-[40px]">
            {title}
          </h1>
          <p className="text-sm text-ink-muted">
            {version ? `Versión ${version} · ` : ""}Última actualización: {LEGAL.updatedAt}
          </p>
        </header>

        <div className="space-y-4 text-[15px] leading-relaxed text-ink-muted">{intro}</div>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-8 pt-8">
            <h2 className="mb-3 font-display text-xl font-semibold text-ink">
              {i + 1}. {s.title}
            </h2>
            <div className="space-y-3 text-[15px] leading-relaxed text-ink-muted [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
              {s.body}
            </div>
          </section>
        ))}

        <footer className="mt-12 rounded-[var(--radius-lg)] bg-panel p-5 text-sm text-ink-muted shadow-[var(--shadow-card)]">
          <p className="font-semibold text-ink">Contacto</p>
          <p className="mt-1">
            {legalHolder()}. {LEGAL_PLACE}.{" "}
            <a href={`mailto:${LEGAL.email}`} className="font-medium text-primary-ink underline underline-offset-2">
              {LEGAL.email}
            </a>
          </p>
        </footer>
      </article>
    </div>
  );
}

export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary-ink underline underline-offset-2">
      {children}
    </Link>
  );
}

export function Mail() {
  return (
    <a href={`mailto:${LEGAL.email}`} className="font-medium text-primary-ink underline underline-offset-2">
      {LEGAL.email}
    </a>
  );
}
