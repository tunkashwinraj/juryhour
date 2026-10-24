import type { ElementType, ReactNode } from "react";
import { cx } from "./lib";

export type ContainerProps = {
  as?: ElementType;
  size?: "default" | "narrow";
  className?: string;
  children: ReactNode;
  id?: string;
};

/** Max 1200px (narrow: 760px), side gutters 16/24/32px, safe-area aware. */
export function Container({ as: Tag = "div", size = "default", className, children, id }: ContainerProps) {
  return (
    <Tag id={id} className={cx("ui-container", size === "narrow" && "ui-container--narrow", className)}>
      {children}
    </Tag>
  );
}

export type EyebrowProps = { as?: ElementType; className?: string; children: ReactNode; id?: string };

/** Mono small-caps label above a heading: "REAL PEOPLE · REAL VERDICT · SAME DAY". */
export function Eyebrow({ as: Tag = "p", className, children, id }: EyebrowProps) {
  return (
    <Tag id={id} className={cx("ui-eyebrow", className)}>
      {children}
    </Tag>
  );
}

export type SectionProps = {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  /** Heading level for `title`. Default 2. */
  headingLevel?: 1 | 2 | 3;
  /** "wash" gives the band a quiet fill; "rule" adds a hairline on top. */
  tone?: "plain" | "wash" | "rule";
  size?: "default" | "narrow";
  className?: string;
};

/** 1200px container + vertical rhythm + optional eyebrow/title/lede header (labelled by its title). */
export function Section({ id, eyebrow, title, lede, children, headingLevel = 2, tone = "plain", size = "default", className }: SectionProps) {
  const H = `h${headingLevel}` as "h1" | "h2" | "h3";
  const headingId = title && id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cx("ui-section", `ui-section--${tone}`, className)}>
      <div className={cx("ui-container", size === "narrow" && "ui-container--narrow")}>
        {eyebrow || title || lede ? (
          <header className="ui-section__head">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            {title ? (
              <H id={headingId} className="ui-section__title">
                {title}
              </H>
            ) : null}
            {lede ? <div className="ui-section__lede">{lede}</div> : null}
          </header>
        ) : null}
        {children}
      </div>
    </section>
  );
}
