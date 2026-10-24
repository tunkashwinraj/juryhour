import type { CSSProperties } from "react";
import { InViewTrigger } from "./InViewTrigger";
import { cx, tallyGroups } from "./lib";

export type TallyProps = {
  /** Number of marks (15 for a Proof jury). */
  total: number;
  /** Marks filled for the winner. */
  filled: number;
  /** Accessible description, e.g. "12 of 15 jurors chose B". */
  label: string;
  /** Fill the marks one by one when first seen (skipped under prefers-reduced-motion). */
  animate?: boolean;
  /** Winner color. Default "verdict" (stamp red); "signal" (green) for positive results. */
  tone?: "verdict" | "signal" | "ink";
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** The signature graphic: tally marks grouped in fives, winner filled, the rest outlined. */
export function Tally({ total, filled, label, animate = false, tone = "verdict", size = "md", className }: TallyProps) {
  const groups = tallyGroups(total, filled);
  let i = 0;
  return (
    <div
      role="img"
      aria-label={label}
      className={cx("ui-tally", `ui-tally--${tone}`, `ui-tally--${size}`, className)}
      data-animate={animate ? "" : undefined}
    >
      {groups.map((g, gi) => (
        <span className="ui-tally__group" key={gi} aria-hidden="true">
          {g.map((on) => {
            const idx = i++;
            return (
              <span
                key={idx}
                className={on ? "ui-tally__mark ui-tally__mark--on" : "ui-tally__mark"}
                style={{ "--i": idx } as CSSProperties}
              />
            );
          })}
        </span>
      ))}
      {animate ? <InViewTrigger /> : null}
    </div>
  );
}
