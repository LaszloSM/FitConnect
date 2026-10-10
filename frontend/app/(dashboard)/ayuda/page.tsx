"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/common/PageHeader";
import { GlassCard } from "@/components/common/GlassCard";
import { Input } from "@/components/ui/input";
import {
  ARTICLES,
  CATEGORIES,
  FAQS,
  SUPPORT_EMAIL,
  searchHelp,
  type HelpCategoryKey,
  type HelpFaq,
} from "@/lib/help/articles";
import {
  CaretDownIcon as ChevronDown,
  CaretRightIcon as ChevronRight,
  LifebuoyIcon as LifeBuoy,
  MagnifyingGlassIcon as Search,
} from "@phosphor-icons/react";

function Faq({ q, a }: HelpFaq) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="text-sm font-medium text-ink">{q}</span>
        <ChevronDown className={`size-4 shrink-0 text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-4 text-sm leading-relaxed text-ink-muted">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ArticleLink({ slug, title, summary }: { slug: string; title: string; summary: string }) {
  return (
    <Link
      href={`/ayuda/${slug}`}
      className="group flex items-start justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-[13px] text-ink-muted">{summary}</span>
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export default function AyudaPage() {
  const [query, setQuery] = useState("");
  const [faqCategory, setFaqCategory] = useState<HelpCategoryKey | "all">("all");
  const results = useMemo(() => searchHelp(query), [query]);
  const searching = query.trim().length > 1;
  const faqs = faqCategory === "all" ? FAQS : FAQS.filter((f) => f.category === faqCategory);
  const faqCategories = CATEGORIES.filter((c) => FAQS.some((f) => f.category === c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centro de ayuda"
        subtitle="Guías paso a paso y respuestas para el día a día de tu gimnasio"
        icon={<LifeBuoy className="h-5 w-5" />}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="¿Qué necesitas? Ej.: cerrar la caja, importar socios, sin internet"
          aria-label="Buscar en la ayuda"
          className="h-12 pl-11 text-base"
        />
      </div>

      {searching ? (
        <GlassCard className="space-y-4 p-5">
          {results.articles.length === 0 && results.faqs.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No encontramos nada con «{query}». Prueba con otras palabras o escríbenos a{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-ink hover:underline">{SUPPORT_EMAIL}</a>.
            </p>
          ) : (
            <>
              {results.articles.length > 0 && (
                <div>
                  <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Guías</p>
                  {results.articles.map((a) => <ArticleLink key={a.slug} {...a} />)}
                </div>
              )}
              {results.faqs.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Preguntas</p>
                  {results.faqs.map((f) => <Faq key={f.q} {...f} />)}
                </div>
              )}
            </>
          )}
        </GlassCard>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CATEGORIES.map((c) => {
              const items = ARTICLES.filter((a) => a.category === c.key);
              if (!items.length) return null;
              return (
                <GlassCard key={c.key} className="space-y-1 p-4">
                  <div className="px-3 pb-1">
                    <h2 className="text-base font-semibold text-ink">{c.title}</h2>
                    <p className="text-[13px] text-ink-muted">{c.description}</p>
                  </div>
                  {items.map((a) => <ArticleLink key={a.slug} {...a} />)}
                </GlassCard>
              );
            })}
          </div>

          <GlassCard className="p-5">
            <h2 className="mb-3 text-base font-semibold text-ink">Preguntas frecuentes</h2>
            <div className="mb-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar preguntas">
              {[{ key: "all" as const, title: "Todas" }, ...faqCategories].map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={faqCategory === c.key}
                  onClick={() => setFaqCategory(c.key)}
                  className={`min-h-8 rounded-[var(--radius-sm)] border px-2.5 text-[13px] font-medium transition-colors ${
                    faqCategory === c.key ? "border-ink bg-ink text-surface" : "border-line bg-panel text-ink hover:bg-muted"
                  }`}
                >
                  {c.title}
                </button>
              ))}
            </div>
            <div>
              {faqs.map((f) => <Faq key={f.q} {...f} />)}
            </div>
          </GlassCard>
        </>
      )}

      <GlassCard className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-ink">¿No encontraste lo que buscabas?</h2>
          <p className="mt-0.5 text-sm text-ink-muted">Escríbenos y te respondemos lo antes posible.</p>
        </div>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)] transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          {SUPPORT_EMAIL}
        </a>
      </GlassCard>
    </div>
  );
}
