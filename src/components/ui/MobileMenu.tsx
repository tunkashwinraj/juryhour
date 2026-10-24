"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type NavItem = { href: string; label: string };

/**
 * Mobile menu sheet: a native modal <dialog> (focus is trapped and the page behind is inert;
 * Esc closes). Focus moves to the close button on open and back to the trigger on close.
 */
export function MobileMenu({ items, cta }: { items: NavItem[]; cta: NavItem }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      closeRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Close if the viewport grows past the mobile breakpoint while open.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 960px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  function onClose() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ui-header__menu-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen(true)}
      >
        <span className="ui-header__menu-icon" aria-hidden="true" />
        <span className="ui-header__menu-label">Menu</span>
      </button>
      <dialog
        ref={dialogRef}
        id="site-menu"
        className="ui-sheet"
        aria-label="Site menu"
        onClose={onClose}
        onClick={(e) => {
          // A click on the ::backdrop lands on the dialog element itself.
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="ui-sheet__panel">
          <div className="ui-sheet__top">
            <span className="ui-eyebrow">Menu</span>
            <button ref={closeRef} type="button" className="ui-sheet__close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <nav aria-label="Main">
            <ul className="ui-sheet__list">
              {items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} className="ui-sheet__link" onClick={() => setOpen(false)}>
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link href={cta.href} className="ui-btn ui-btn--primary ui-btn--lg ui-btn--full" onClick={() => setOpen(false)}>
            {cta.label}
          </Link>
        </div>
      </dialog>
    </>
  );
}
