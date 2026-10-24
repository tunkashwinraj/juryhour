import type { ReactNode } from "react";
import { cx } from "./lib";

export type CompareTableProps = {
  caption: string;
  /** Column headings after the row-label column. */
  columns: string[];
  rows: { label: string; cells: ReactNode[] }[];
  /** Index into `columns` to tint (usually JuryHour = 0). */
  highlightColumn?: number;
  footnote?: ReactNode;
  className?: string;
};

/** A real <table> (better cited by AI engines), scrollable on small screens with a sticky label column. */
export function CompareTable({ caption, columns, rows, highlightColumn, footnote, className }: CompareTableProps) {
  return (
    <figure className={cx("ui-compare", className)}>
      <div className="ui-compare__scroll" role="region" aria-label={caption} tabIndex={0}>
        <table className="ui-compare__table">
          <caption className="ui-compare__caption">{caption}</caption>
          <thead>
            <tr>
              <td className="ui-compare__corner" />
              {columns.map((c, i) => (
                <th key={i} scope="col" className={i === highlightColumn ? "ui-compare__hl" : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                <th scope="row">{r.label}</th>
                {columns.map((_, ci) => (
                  <td key={ci} className={ci === highlightColumn ? "ui-compare__hl" : undefined}>
                    {r.cells[ci] ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnote ? <figcaption className="ui-compare__foot">{footnote}</figcaption> : null}
    </figure>
  );
}
