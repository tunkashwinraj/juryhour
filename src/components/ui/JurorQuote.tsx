import type { ReactNode } from "react";
import { cx, jurorLabel } from "./lib";

export type JurorQuoteProps = {
  /** 6 → "Juror 06". */
  juror: number | string;
  children: ReactNode;
  /** Extra attribution after the label, e.g. "chose B". */
  cite?: ReactNode;
  className?: string;
};

export function JurorQuote({ juror, children, cite, className }: JurorQuoteProps) {
  return (
    <figure className={cx("ui-quote", className)}>
      <blockquote className="ui-quote__text">{children}</blockquote>
      <figcaption className="ui-quote__by">
        <span className="ui-quote__juror">{jurorLabel(juror)}</span>
        {cite ? <span className="ui-quote__cite">{cite}</span> : null}
      </figcaption>
    </figure>
  );
}
