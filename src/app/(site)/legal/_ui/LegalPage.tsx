import type { ReactNode } from "react";
import { JsonLd, breadcrumbLd } from "@/lib/seo";
import { DRAFT_NOTE, LAST_UPDATED_ISO, LAST_UPDATED_LABEL, NOT_LEGAL_ADVICE } from "./legal";
import s from "./prose.module.css";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** Breadcrumb trail (visible) + BreadcrumbList JSON-LD. */
export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className={s.crumbs}>
      <ol>
        {items.map((it, i) => (
          <li key={it.path}>
            {i === items.length - 1 ? <span aria-current="page">{it.name}</span> : <a href={it.path}>{it.name}</a>}
          </li>
        ))}
      </ol>
      <JsonLd data={breadcrumbLd(items)} />
    </nav>
  );
}

export function Toc({ items }: { items: { id: string; title: string; level?: 2 | 3 }[] }) {
  if (items.length < 2) return null;
  return (
    <nav aria-labelledby="toc-title" className={s.toc}>
      <p id="toc-title" className={s.tocTitle}>
        On this page
      </p>
      <ol>
        {items.map((it) => (
          <li key={it.id} className={it.level === 3 ? s.sub : undefined}>
            <a href={`#${it.id}`}>{it.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Layout for /legal/* pages: title, last-updated line, not-legal-advice note, draft flag, TOC. */
export function LegalPage({
  title,
  lede,
  path,
  sections,
  draft = true,
}: {
  title: string;
  lede: ReactNode;
  path: string;
  sections: LegalSection[];
  draft?: boolean;
}) {
  return (
    <main id="main" className={s.page}>
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Legal", path: "/legal" },
          { name: title, path },
        ]}
      />
      <header className={s.header}>
        <p className={s.eyebrow}>Legal</p>
        <h1 className={s.title}>{title}</h1>
        <p className={s.lede}>{lede}</p>
        <p className={s.meta}>
          <span>
            Last updated: <time dateTime={LAST_UPDATED_ISO}>{LAST_UPDATED_LABEL}</time>
          </span>
          {draft ? <span className={s.draft}>{DRAFT_NOTE}</span> : null}
        </p>
        <div className={s.notice} role="note">
          <p>{NOT_LEGAL_ADVICE}</p>
        </div>
      </header>
      <div className={s.layout}>
        <Toc items={sections.map(({ id, title: t }) => ({ id, title: t }))} />
        <div className={s.prose}>
          {sections.map((sec) => (
            <section key={sec.id} aria-labelledby={sec.id}>
              <h2 id={sec.id}>{sec.title}</h2>
              {sec.body}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
