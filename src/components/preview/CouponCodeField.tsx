"use client";
// "Have a code?" — one field for discount and partner codes. A code that matches the running coupon
// applies it to the Verdict (the server re-checks it at checkout); any other code is recorded for
// attribution and never changes the price.
import { useId, useState } from "react";
import { Input } from "@/components/ui";
import { getAttribution, normalizeCode } from "@/lib/attribution";
import { sameCode } from "@/lib/coupons";
import { usePreview } from "./PreviewProvider";
import styles from "./preview.module.css";

export function CouponCodeField({ label = "Discount or referral code" }: { label?: string }) {
  const ctx = usePreview();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const code = ctx.effectiveCode;
  const coupon = ctx.coupon;
  const matches = Boolean(coupon && sameCode(code, coupon.code));
  const note = error
    ? error
    : !code
      ? coupon
        ? `${coupon.code} takes ${coupon.percentOff}% off your first Verdict.`
        : "Partner codes tell us who sent you."
      : matches
        ? `${coupon!.code} applied to your first Verdict.`
        : coupon
          ? `${code} isn't a discount code. We'll note who sent you; the price doesn't change.`
          : "Thanks. Codes tell us who sent you; the price doesn't change.";

  if (!open) {
    return (
      <span className={styles.codeRow}>
        {matches ? <span>{note} </span> : null}
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            setOpen(true);
            setDraft(ctx.code ?? getAttribution().code ?? "");
          }}
        >
          {matches ? "Change code" : "Have a code?"}
        </button>
      </span>
    );
  }
  return (
    <span className={styles.codeField}>
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        value={draft}
        maxLength={40}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note`}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          if (!v.trim()) {
            setError(null);
            ctx.setCode(null);
            return;
          }
          const c = normalizeCode(v);
          setError(c ? null : "Codes use letters, numbers, - and _ only.");
          ctx.setCode(c);
        }}
      />
      <span id={`${id}-note`} className={styles.small} aria-live="polite">
        {note}
      </span>
    </span>
  );
}
