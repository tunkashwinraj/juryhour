import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export type FieldProps = {
  /** id of the control inside; label, hint and error are wired to it. */
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
};

type ControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" };

/**
 * Label + control + hint + error. If the single child is an element, it receives `id`,
 * `aria-describedby` (hint + error) and `aria-invalid` automatically. The error slot is a polite
 * live region that is always rendered, so new errors are announced.
 */
export function Field({ id, label, hint, error, children, className }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const describedBy = [hintId, hasError ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  let control: ReactNode = children;
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  if (isValidElement(only)) {
    const el = only as ReactElement<ControlProps>;
    const existing = el.props["aria-describedby"];
    control = cloneElement(el, {
      id: el.props.id ?? id,
      "aria-describedby": [existing, describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": hasError ? true : el.props["aria-invalid"],
    });
  }

  return (
    <div className={["ui-field", hasError ? "ui-field--error" : "", className ?? ""].filter(Boolean).join(" ")}>
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {control}
      <p className="ui-field__error" id={errorId} aria-live="polite">
        {hasError ? error : null}
      </p>
    </div>
  );
}
