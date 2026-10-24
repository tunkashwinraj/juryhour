import { cx } from "./lib";

export type CaseHeaderProps = {
  /** "0142" (a leading "Case " is accepted and dropped). */
  caseNo: string;
  tier: string;
  jurors: number;
  /** "3h 40m" → "delivered 3h 40m". */
  delivered?: string;
  className?: string;
};

/** Case-file strip for reports: Case 0142 · Verdict · 15 jurors · delivered 3h 40m. */
export function CaseHeader({ caseNo, tier, jurors, delivered, className }: CaseHeaderProps) {
  const no = caseNo.replace(/^case\s*/i, "");
  const items = [`Case ${no}`, tier, `${jurors} ${jurors === 1 ? "juror" : "jurors"}`];
  if (delivered) items.push(`delivered ${delivered}`);
  return (
    <p className={cx("ui-case", className)}>
      {items.map((t, i) => (
        <span key={i} className="ui-case__item">
          {i > 0 ? (
            <span className="ui-case__sep" aria-hidden="true">
              ·
            </span>
          ) : null}
          {t}
        </span>
      ))}
    </p>
  );
}
