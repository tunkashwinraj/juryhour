import type { ReactNode } from "react";
import { cx } from "./lib";

/** "VERDICT: B WINS 12–3". Used once on the home page and on the sample report. Nowhere else. */
export function VerdictStamp({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("ui-stamp", className)}>
      <span className="ui-stamp__inner">{children}</span>
    </p>
  );
}
