import type { ReactNode } from "react";
import { cx, formatPrice } from "./lib";

export type PriceCardProps = {
  name: string;
  /** null → "Quote". */
  price: number | null;
  /** Shown before the price, e.g. "from". */
  priceNote?: ReactNode;
  /** Struck-through regular price, rendered as "normally $149". */
  compareAt?: number | null;
  jurors?: number | null;
  summary: string;
  bullets: string[];
  badge?: ReactNode;
  emphasized?: boolean;
  cta: ReactNode;
  footnote?: ReactNode;
  /** Heading level of the tier name. Default 3. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
};

export function PriceCard({
  name,
  price,
  priceNote,
  compareAt,
  jurors,
  summary,
  bullets,
  badge,
  emphasized = false,
  cta,
  footnote,
  headingLevel = 3,
  className,
}: PriceCardProps) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const showCompare = compareAt != null && price != null && compareAt > price;
  return (
    <article className={cx("ui-price", emphasized && "ui-price--em", className)}>
      <div className="ui-price__head">
        <H className="ui-price__name">{name}</H>
        {badge ? <div className="ui-price__badge">{badge}</div> : null}
      </div>
      <p className="ui-price__amount">
        {priceNote ? <span className="ui-price__note">{priceNote} </span> : null}
        <span className="ui-price__value">{price == null ? "Quote" : formatPrice(price)}</span>
        {showCompare ? (
          <span className="ui-price__compare">
            {" "}
            normally <s>{formatPrice(compareAt)}</s>
          </span>
        ) : null}
      </p>
      {jurors != null ? (
        <p className="ui-price__jurors">
          {jurors} real {jurors === 1 ? "person" : "people"}
        </p>
      ) : null}
      <p className="ui-price__summary">{summary}</p>
      {bullets.length > 0 ? (
        <ul className="ui-price__list">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      <div className="ui-price__cta">{cta}</div>
      {footnote ? <p className="ui-price__foot">{footnote}</p> : null}
    </article>
  );
}
