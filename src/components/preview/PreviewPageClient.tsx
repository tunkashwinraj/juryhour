"use client";
// Client part of /preview/[id]: makes the shown preview this tab's current one (so every TierCta
// checks out with it), asks for an email when the link was opened without this tab's session,
// and renders the result/refusal + upsell. Server passes only fields from the `previews` row.
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import type { TierName } from "@/lib/constants";
import { track } from "@/lib/attribution";
import { isValidEmail, type StoredPreview } from "./logic";
import { usePreview } from "./PreviewProvider";
import { PreviewRefusalView, PreviewResultView } from "./PreviewResultView";
import { CONFIRM_EMAIL_ID } from "./TierCta";
import { Upsell } from "./Upsell";
import styles from "./preview.module.css";

export function PreviewPageClient({
  serverPreview,
  prices,
}: {
  serverPreview: StoredPreview;
  prices?: Partial<Record<TierName, number | null>>;
}) {
  const ctx = usePreview();
  const mine = ctx.preview?.id === serverPreview.id ? ctx.preview : null;
  const p = mine ?? serverPreview;
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Adopt this preview for checkout unless the tab already holds it (with its email).
  const { setPreview } = ctx;
  const adopt = ctx.preview?.id !== serverPreview.id;
  useEffect(() => {
    if (adopt) setPreview(serverPreview);
  }, [adopt, serverPreview, setPreview]);

  function confirmEmail(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    setPreview({ ...p, input: { ...p.input, email: email.trim().toLowerCase() } });
  }

  async function copyLink() {
    track("share_clicked", { where: "preview_page" });
    try {
      await navigator.clipboard.writeText(window.location.href.split("?")[0]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      window.prompt("Copy this link:", window.location.href.split("?")[0]);
    }
  }

  const source = p.input.url ? p.input.url : "Your pasted pitch";
  return (
    <div className={styles.root}>
      <p className={styles.pageMeta}>
        <span className={styles.num}>Page:</span> {source} · <span className={styles.num}>Buyer:</span> {p.input.buyer_desc}
      </p>
      {p.status === "refused" ? (
        <PreviewRefusalView reason={p.reason} />
      ) : (
        <>
          {p.result ? <PreviewResultView result={p.result} /> : null}
          <div className={styles.resultActions}>
            <button type="button" className={styles.linkButton} onClick={copyLink}>
              {copied ? "Link copied" : "Copy link"}
            </button>
            <Link href="/#preview">Preview another page</Link>
          </div>
          <span className={styles.srOnly} aria-live="polite">
            {copied ? "Link copied to clipboard" : ""}
          </span>
          {!mine?.input.email ? (
            <form className={styles.confirm} onSubmit={confirmEmail} noValidate>
              <Field
                id={CONFIRM_EMAIL_ID}
                label="Your email"
                hint="Where we send your verdict. Needed before checkout."
                error={emailError}
              >
                <Input
                  id={CONFIRM_EMAIL_ID}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </Field>
              <Button type="submit" variant="secondary">
                Use this email
              </Button>
            </form>
          ) : null}
          <Upsell prices={prices} />
        </>
      )}
      {p.status === "refused" ? <Link href="/#preview">Preview another page</Link> : null}
    </div>
  );
}
