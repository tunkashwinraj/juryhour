import type { ReactNode } from "react";
import { cx } from "./lib";

export type BadgeTone = "neutral" | "verdict" | "signal" | "sandbox";

export function Badge({ tone = "neutral", children, className, title }: { tone?: BadgeTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cx("ui-badge", `ui-badge--${tone}`, className)} title={title}>
      {children}
    </span>
  );
}
