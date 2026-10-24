import { cx } from "./lib";

export type ScorecardRow = { label: string; a: string; b?: string | null; better?: "a" | "b" | null };

export type ScorecardProps = {
  rows: ScorecardRow[];
  /** Column headings. Default: "Original (A)" / "Challenger (B)". */
  labels?: { a: string; b: string };
  /** Visually hidden table caption. Default "Scorecard". */
  caption?: string;
  className?: string;
};

function BetterMark() {
  return (
    <span className="ui-scorecard__mark">
      <span aria-hidden="true">▲</span>
      <span className="ui-visually-hidden"> (better)</span>
    </span>
  );
}

/** Metric table. The better cell per row is set in --signal with a text marker (not color alone). */
export function Scorecard({ rows, labels = { a: "Original (A)", b: "Challenger (B)" }, caption = "Scorecard", className }: ScorecardProps) {
  const hasB = rows.some((r) => r.b !== undefined && r.b !== null);
  return (
    <div className={cx("ui-scorecard", className)}>
      <table className="ui-scorecard__table">
        <caption className="ui-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col" className="ui-num">
              {labels.a}
            </th>
            {hasB ? (
              <th scope="col" className="ui-num">
                {labels.b}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row">{r.label}</th>
              <td className={cx("ui-num", r.better === "a" && "ui-scorecard__better")}>
                {r.a}
                {r.better === "a" ? <BetterMark /> : null}
              </td>
              {hasB ? (
                <td className={cx("ui-num", r.better === "b" && "ui-scorecard__better")}>
                  {r.b ?? "–"}
                  {r.better === "b" ? <BetterMark /> : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
