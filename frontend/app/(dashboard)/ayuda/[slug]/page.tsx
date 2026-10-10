"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { GlassCard } from "@/components/common/GlassCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ARTICLES, CATEGORIES, SUPPORT_EMAIL, articleBySlug } from "@/lib/help/articles";
import { ArrowLeftIcon as ArrowLeft, LightbulbIcon as Tip } from "@phosphor-icons/react";

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = articleBySlug(slug);

  if (!article) {
    return (
      <EmptyState
        title="No encontramos esa guía"
        description="Puede que haya cambiado de nombre. Vuelve al centro de ayuda y búscala."
        action={<Link href="/ayuda" className="text-sm font-medium text-primary-ink hover:underline">Ir al centro de ayuda</Link>}
      />
    );
  }

  const category = CATEGORIES.find((c) => c.key === article.category);
  const related = (article.related ?? []).map(articleBySlug).filter(Boolean);
  const siblings = ARTICLES.filter((a) => a.category === article.category && a.slug !== article.slug);
  const more = related.length ? related : siblings;

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href="/ayuda" className="inline-flex min-h-9 items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Centro de ayuda{category ? ` · ${category.title}` : ""}
      </Link>

      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{article.title}</h1>
        <p className="text-base text-ink-muted">{article.summary}</p>
      </header>

      {article.steps && (
        <GlassCard className="p-5">
          <ol className="space-y-4">
            {article.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-sm font-semibold text-primary-ink">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-[15px] leading-relaxed text-ink">{step}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
      )}

      {article.sections?.map((s) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">{s.title}</h2>
          {s.body.map((p, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-ink-muted">{p}</p>
          ))}
        </section>
      ))}

      {article.tips && (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-line bg-muted p-4">
          {article.tips.map((t) => (
            <p key={t} className="flex gap-2 text-sm text-ink">
              <Tip className="mt-0.5 size-4 shrink-0 text-primary-ink" weight="duotone" aria-hidden />
              <span>{t}</span>
            </p>
          ))}
        </div>
      )}

      {more.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">También te puede servir</h2>
          <ul className="space-y-1">
            {more.slice(0, 4).map((a) => (
              <li key={a!.slug}>
                <Link href={`/ayuda/${a!.slug}`} className="text-sm font-medium text-primary-ink hover:underline">
                  {a!.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="border-t border-line pt-4 text-sm text-ink-muted">
        ¿Sigues con dudas? Escríbenos a{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-ink hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    </article>
  );
}
