"use client";
// The ONLY way any page starts a checkout (WEBSITE_CONTRACTS §2 C, WEBSITE_SPEC §5.7, §7.6–7.7).
// - refused preview  → renders nothing (no pricing while refused)
// - sales paused     → "Join the waitlist" (inline WaitlistForm)
// - no preview yet   → opens the preview form with this tier preselected (or /?tier=<tier>#preview)
// - preview present  → POST /api/checkout → window.location.assign(purchase_url)
// - specialist       → POST /api/quote → link to /o/{token}
import { useState, type MouseEvent } from "react";
import { Button } from "@/components/ui";
import { getAttribution, track } from "@/lib/attribution";
import { postJson } from "./client-api";
import { performTierClick, type TierClickResult } from "./checkout";
import { TIER_LABELS, decideTierAction, previewHref, type CtaTier } from "./logic";
import { usePreview } from "./PreviewProvider";
import { WaitlistForm } from "./LeadForms";
import styles from "./preview.module.css";

export const CONFIRM_EMAIL_ID = "preview-confirm-email";

export type TierCtaProps = {
  tier: CtaTier;
  label?: string;
  variant?: "primary" | "secondary";
  /** Show the small "Secure checkout by Whop" line under the button (default true). */
  showSecureNote?: boolean;
  /** Stretch the button to its container (default true). */
  full?: boolean;
};

export function TierCta({ tier, label, variant = "primary", showSecureNote = true, full = true }: TierCtaProps) {
  const ctx = usePreview();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badParent, setBadParent] = useState(false);
  const [quoteToken, setQuoteToken] = useState<string | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const action = decideTierAction({
    tier,
    refused: ctx.refused,
    salesPaused: ctx.salesPaused,
    input: ctx.checkoutInput,
  });
  const name = TIER_LABELS[tier];
  const defaultLabel = tier === "specialist" ? "Get a quote" : `Get ${name}`;

  if (action.kind === "hidden") return null;

  if (action.kind === "waitlist") {
    return (
      <div className={styles.cta}>
        <Button
          type="button"
          variant="secondary"
          full={full}
          aria-expanded={waitlistOpen}
          onClick={() => setWaitlistOpen((v) => !v)}
        >
          Join the waitlist
        </Button>
        {waitlistOpen ? <WaitlistForm tier={tier} /> : null}
      </div>
    );
  }

  if (quoteToken) {
    return (
      <div className={styles.cta} role="status">
        <p className={styles.small}>
          <strong>Quote requested.</strong> We email your price as soon as our jury partner quotes it; it holds for 48
          hours. <a href={`/o/${encodeURIComponent(quoteToken)}`}>Track your request</a>
        </p>
      </div>
    );
  }

  async function onClick(e: MouseEvent<HTMLElement>) {
    if (action.kind === "open_form" || action.kind === "need_email") e.preventDefault();
    if (busy) return;
    setError(null);
    setBadParent(false);
    const isRequest = action.kind === "checkout" || action.kind === "quote";
    if (isRequest) setBusy(true);
    const result = await performTierClick(
      tier,
      {
        refused: ctx.refused,
        salesPaused: ctx.salesPaused,
        checkoutInput: ctx.checkoutInput,
        previewId: ctx.preview?.status === "done" ? ctx.preview.id : null,
        extraJurors: ctx.extraJurors,
        coupon: tier === "specialist" ? null : (ctx.appliedCoupon(tier)?.code ?? null),
        parentOrderId: ctx.parentOrderId,
        code: ctx.code,
      },
      { post: postJson, assign: (u) => window.location.assign(u), attribution: getAttribution, track },
    );
    if (result.kind !== "redirecting") setBusy(false); // keep "Opening…" while the browser leaves
    handleResult(result);
  }

  function handleResult(r: TierClickResult) {
    switch (r.kind) {
      case "open_form":
        ctx.openForm({ tier });
        return;
      case "need_email": {
        ctx.selectTier(tier);
        const el = document.getElementById(CONFIRM_EMAIL_ID);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          (el as HTMLInputElement).focus({ preventScroll: true });
          setError("Add your email above to continue.");
        } else {
          ctx.openForm({ tier });
        }
        return;
      }
      case "quote":
        setQuoteToken(r.token);
        return;
      case "paused":
      case "waitlist":
        ctx.setSalesPaused(true);
        setWaitlistOpen(true);
        return;
      case "refused":
        if (ctx.preview) ctx.setPreview({ ...ctx.preview, status: "refused", result: undefined, reason: ctx.preview.reason ?? "" });
        return;
      case "bad_parent":
        setBadParent(true);
        setError(r.message);
        return;
      case "error":
        setError(r.message);
        return;
      default:
        return;
    }
  }

  const href = action.kind === "open_form" ? previewHref(tier) : undefined;
  return (
    <div className={styles.cta}>
      <Button
        variant={variant}
        full={full}
        href={href}
        type={href ? undefined : "button"}
        onClick={onClick}
        disabled={busy}
        aria-busy={busy || undefined}
      >
        {busy ? (tier === "specialist" ? "Requesting your quote…" : "Opening secure checkout…") : (label ?? defaultLabel)}
      </Button>
      {showSecureNote ? (
        <p className={styles.secureNote}>
          {tier === "specialist" ? "Price quoted by email. Nothing to pay now." : "Secure checkout by Whop"}
        </p>
      ) : null}
      <div aria-live="polite">
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {badParent ? (
          <Button
            type="button"
            variant="link"
            onClick={() => {
              ctx.clearParent();
              setBadParent(false);
              setError(null);
            }}
          >
            Continue without the upgrade credit
          </Button>
        ) : null}
      </div>
    </div>
  );
}
