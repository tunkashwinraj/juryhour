import type { ReactNode } from "react";
import { cx } from "./lib";

export type FAQItem = {
  q: string;
  a: ReactNode;
  /** Plain-text answer for FAQPage JSON-LD (faqLd in @/lib/seo). */
  aText: string;
};

export type FAQProps = { items: FAQItem[]; headingLevel?: 2 | 3; className?: string };

/** Native <details> disclosures: keyboard and screen-reader friendly with no JS. */
export function FAQ({ items, headingLevel = 3, className }: FAQProps) {
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <div className={cx("ui-faq", className)}>
      {items.map((it, i) => (
        <details key={i} className="ui-faq__item">
          <summary className="ui-faq__q">
            <H className="ui-faq__h">{it.q}</H>
            <span className="ui-faq__icon" aria-hidden="true" />
          </summary>
          <div className="ui-faq__a">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
