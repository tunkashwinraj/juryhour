// Small building blocks shared by Workstream D's content pages (server components).
// UI primitives come from A (@/components/ui); SEO helpers from E (@/lib/seo).
import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow, FAQ, Section } from "@/components/ui";
import { JsonLd, breadcrumbLd, faqLd } from "@/lib/seo";
import type { Card } from "@/lib/types";
import type { FaqItem } from "../../../../../content/faq";
import s from "./kit.module.css";

export { s as kit };

export type Crumb = { name: string; path: string };

/** Visible breadcrumbs + BreadcrumbList JSON-LD. Home is added automatically. */
export function Crumbs({ items }: { items: Crumb[] }) {
  const all = [{ name: "Home", path: "/" }, ...items];
  return (
    <>
      <JsonLd data={breadcrumbLd(all)} />
      <nav aria-label="Breadcrumb" className={s.crumbs}>
        <ol>
          {all.map((c, i) =>
            i === all.length - 1 ? (
              <li key={c.path} aria-current="page">
                {c.name}
              </li>
            ) : (
              <li key={c.path}>
                <Link href={c.path}>{c.name}</Link>
              </li>
            ),
          )}
        </ol>
      </nav>
    </>
  );
}

/** Page opener: breadcrumbs, mono eyebrow, the page's only H1, a lede and optional actions. */
export function PageHero({
  crumbs,
  eyebrow,
  title,
  lede,
  children,
}: {
  crumbs: Crumb[];
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Section>
      <Crumbs items={crumbs} />
      <header className={s.hero}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1>{title}</h1>
        {lede ? <p className={s.lede}>{lede}</p> : null}
        {children ? <div className={s.actions}>{children}</div> : null}
      </header>
    </Section>
  );
}

/** FAQ list + FAQPage JSON-LD. */
export function FaqBlock({
  id = "faq",
  title,
  items,
  eyebrow,
}: {
  id?: string;
  title: string;
  items: FaqItem[];
  eyebrow?: string;
}) {
  return (
    <Section id={id} eyebrow={eyebrow} title={title}>
      <JsonLd data={faqLd(items.map((i) => ({ q: i.q, aText: i.aText })))} />
      <FAQ items={items} headingLevel={3} />
    </Section>
  );
}

/** A copy card (headline, subheadline, 3 bullets, CTA) as jurors see it, for examples. */
export function CopyCard({ card, label }: { card: Card; label: string }) {
  return (
    <figure className={s.copyCard} style={{ margin: 0 }}>
      <figcaption className={s.label}>{label}</figcaption>
      <p className={s.headline}>{card.headline}</p>
      <p>{card.subheadline}</p>
      <ul>
        {card.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <span className={s.cta}>[{card.cta}]</span>
    </figure>
  );
}

/** Numbered source list for sourced facts. */
export function Footnotes({
  items,
  intro,
}: {
  items: { n: number; label: string; url: string }[];
  intro?: ReactNode;
}) {
  return (
    <div className={s.notes} id="sources">
      {intro ? <p style={{ margin: 0 }}>{intro}</p> : null}
      <ol>
        {items.map((f) => (
          <li key={f.n} id={`src-${f.n}`}>
            {f.label}:{" "}
            <a href={f.url} rel="noopener noreferrer" target="_blank">
              {f.url}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Superscript links to footnotes, e.g. <Fn n={[1, 2]} />. */
export function Fn({ n }: { n: number[] }) {
  return (
    <sup className={s.fn}>
      {n.map((x, i) => (
        <span key={x}>
          {i > 0 ? "," : ""}
          <a href={`#src-${x}`} aria-label={`Source ${x}`}>
            {x}
          </a>
        </span>
      ))}
    </sup>
  );
}
