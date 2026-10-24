import type { CSSProperties } from "react";
import { InViewTrigger } from "./InViewTrigger";
import { cx } from "./lib";

export type TimerBarProps = {
  /** Duration of one fill (the 5-second exposure). */
  seconds: number;
  /** Accessible description, e.g. "Each version is shown for 5 seconds". */
  label: string;
  className?: string;
};

/**
 * Thin bar that fills once over `seconds` when first seen. Plays once (no loop), so it never needs a
 * pause control; under reduced motion it renders full and still.
 */
export function TimerBar({ seconds, label, className }: TimerBarProps) {
  const s = Math.max(1, Math.round(seconds));
  return (
    <div className={cx("ui-timer", className)} role="img" aria-label={label} style={{ "--dur": `${s}s` } as CSSProperties}>
      <div className="ui-timer__track" aria-hidden="true">
        <div className="ui-timer__fill" />
      </div>
      <div className="ui-timer__ticks" aria-hidden="true">
        <span>0s</span>
        <span>{s}s</span>
      </div>
      <InViewTrigger />
    </div>
  );
}
