import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";
import { cx } from "./lib";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
  /** Shorthand for aria-invalid. */
  invalid?: boolean;
};

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
  invalid?: boolean;
};

/** Styled native <input>. `ref` is forwarded (React 19 ref-as-prop). */
export function Input({ className, invalid, ref, type = "text", "aria-invalid": ariaInvalid, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      ref={ref}
      type={type}
      className={cx("ui-input", className)}
      aria-invalid={invalid ? true : ariaInvalid}
    />
  );
}

/** Styled native <textarea>. */
export function Textarea({ className, invalid, ref, rows = 5, "aria-invalid": ariaInvalid, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      ref={ref}
      rows={rows}
      className={cx("ui-input", "ui-textarea", className)}
      aria-invalid={invalid ? true : ariaInvalid}
    />
  );
}
