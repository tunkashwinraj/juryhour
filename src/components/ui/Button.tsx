import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from "react";
import { cx } from "./lib";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders an <a> (next/link for same-site paths) instead of a <button>. */
  href?: string;
  /** Full width of its container. */
  full?: boolean;
  /** Only used with href. */
  target?: AnchorHTMLAttributes<HTMLAnchorElement>["target"];
  rel?: string;
  /** Only used with href. Defaults to next/link's own behavior. */
  prefetch?: boolean;
  ref?: Ref<HTMLButtonElement & HTMLAnchorElement>;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", full = false, extra?: string) {
  return cx("ui-btn", `ui-btn--${variant}`, `ui-btn--${size}`, full && "ui-btn--full", extra);
}

/** Primary = ink fill (not red). One per view. `link` looks like an inline text link. */
export function Button({
  variant = "primary",
  size = "md",
  href,
  full = false,
  className,
  target,
  rel,
  prefetch,
  type,
  ref,
  children,
  ...rest
}: ButtonProps) {
  const cls = buttonClass(variant, size, full, className);
  if (href !== undefined) {
    // Button-only attributes (disabled, form*, value, name) don't apply to links.
    const { disabled, form, formAction, formEncType, formMethod, formNoValidate, formTarget, name, value, ...anchorRest } = rest;
    void form; void formAction; void formEncType; void formMethod; void formNoValidate; void formTarget; void name; void value;
    const anchorProps = anchorRest as AnchorHTMLAttributes<HTMLAnchorElement>;
    const isExternal = /^(https?:|mailto:|tel:)/.test(href);
    if (disabled) {
      return (
        <a className={cls} aria-disabled="true" role="link" {...anchorProps} ref={ref}>
          {children}
        </a>
      );
    }
    if (isExternal || target === "_blank") {
      return (
        <a
          className={cls}
          href={href}
          target={target}
          rel={rel ?? (target === "_blank" ? "noopener noreferrer" : undefined)}
          {...anchorProps}
          ref={ref}
        >
          {children}
        </a>
      );
    }
    return (
      <Link className={cls} href={href} target={target} rel={rel} prefetch={prefetch} {...anchorProps} ref={ref}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} type={type ?? "button"} {...rest} ref={ref}>
      {children}
    </button>
  );
}
