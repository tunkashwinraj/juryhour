"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx, segmentPanelId, segmentTabId } from "./lib";

export type SegmentedOption<T extends string> = { value: T; label: ReactNode };

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<NoInfer<T>>[];
  value: T;
  onChange(v: NoInfer<T>): void;
  ariaLabel: string;
  /** Tab ids are `${idPrefix}-tab-${value}`; give the matching panel `id={segmentPanelId(idPrefix, value)}`. */
  idPrefix: string;
  full?: boolean;
  className?: string;
};

/**
 * Two-or-more option switch with tab semantics (role="tablist"), roving tabindex,
 * ←/→/↑/↓ move and select, Home/End jump. Only the selected tab sets aria-controls, so a single
 * rendered panel is enough.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  full = false,
  className,
}: SegmentedControlProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function focusValue(v: T) {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(segmentTabId(idPrefix, v))}`);
    el?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const i = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const v = options[next].value;
    onChange(v);
    focusValue(v);
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cx("ui-seg", full && "ui-seg--full", className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            id={segmentTabId(idPrefix, o.value)}
            aria-selected={selected}
            aria-controls={selected ? segmentPanelId(idPrefix, o.value) : undefined}
            tabIndex={selected ? 0 : -1}
            className="ui-seg__tab"
            onClick={() => onChange(o.value)}
            onKeyDown={onKeyDown}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
