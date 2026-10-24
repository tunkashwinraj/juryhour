import type { ReactNode } from "react";
import { cx } from "./lib";

export type BannerProps = {
  tone?: "info" | "warn" | "verdict";
  children: ReactNode;
  /** Set role="status" when the banner appears in response to an action. */
  role?: "status" | "alert" | "note";
  className?: string;
};

/** Inline notice, e.g. "Example report. Names and numbers are illustrative." */
export function Banner({ tone = "info", children, role, className }: BannerProps) {
  return (
    <div className={cx("ui-banner", `ui-banner--${tone}`, className)} role={role}>
      {children}
    </div>
  );
}
