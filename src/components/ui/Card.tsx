import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "./lib";

export type CardProps = {
  as?: ElementType;
  /** plain = hairline on surface; raised = a touch of lift for the one object that matters. */
  tone?: "plain" | "raised";
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

/** Use only for genuinely separate objects (pricing tiers, report excerpts, juror quotes). */
export function Card({ as: Tag = "div", tone = "plain", className, children, ...rest }: CardProps) {
  return (
    <Tag className={cx("ui-card", `ui-card--${tone}`, className)} {...rest}>
      {children}
    </Tag>
  );
}
