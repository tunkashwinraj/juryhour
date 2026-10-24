"use client";
// Free preview in the hero (WEBSITE_SPEC §5.2, §7): a URL-only quick input that expands inline into
// the full form (URL/pitch, buyer, email, Turnstile), honest loading copy tied to the real request,
// then the result + upsell, the refusal view, or a plain-language error.
//
// Props B/D pass from the server (both optional, recommended wherever prices are shown):
//   prices — Record<TierName, number|null> from getShellPrices()
//   offer  — activeLaunchOffer(…) result (LaunchOffer | null); hidden client-side after endsAt
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Banner, Button, Field, Input, SegmentedControl, Textarea, segmentPanelId, segmentTabId } from "@/components/ui";
import type { TierName } from "@/lib/constants";
import type { LaunchOffer } from "@/lib/launch";
import { getAttribution, track } from "@/lib/attribution";
import { postJson } from "./client-api";
import {
  PITCH_MIN,
  TIER_LABELS,
  loadingStep,
  normalizeUrl,
  previewOutcome,
  validateForm,
  type FormErrors,
} from "./logic";
import { peekStoredPreview, takeDraftUrl, usePreview, type OpenFormOptions } from "./PreviewProvider";
import { PreviewRefusalView, PreviewResultView } from "./PreviewResultView";
import { Turnstile } from "./Turnstile";
import { Upsell } from "./Upsell";
import styles from "./preview.module.css";

export type HeroPreviewProps = {
  /** Anchor id (default "preview"). Field ids are derived from it, so use distinct ids per page. */
  id?: string;
  /** "hero" = the main instance; "band" = a final-CTA quick input that hands off to the hero when present. */
  variant?: "hero" | "band";
  prices?: Partial<Record<TierName, number | null>>;
  offer?: LaunchOffer | null;
};

type Phase = "quick" | "form" | "loading" | "result" | "skipped";
type Mode = "url" | "pitch";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

export function HeroPreview({ id = "preview", variant = "hero", prices, offer }: HeroPreviewProps) {
  const ctx = usePreview();
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("quick");
  const [ranHere, setRanHere] = useState(false);
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [pitch, setPitch] = useState("");
  const [buyer, setBuyer] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [quickError, setQuickError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [skipMessage, setSkipMessage] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  const fid = (name: string) => `${id}-${name}`;

  /** Focus a field (by suffix) after the next render. */
  const focusSoon = useCallback((name: string) => {
    focusRef.current = name;
  }, []);
  useEffect(() => {
    const name = focusRef.current;
    if (!name) return;
    focusRef.current = null;
    const el = document.getElementById(`${id}-${name}`);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  const expand = useCallback(
    (o: OpenFormOptions) => {
      if (o.mode) setMode(o.mode);
      if (o.url !== undefined) setUrl(o.url);
      setFormError(null);
      setPhase((p) => (p === "loading" ? p : "form"));
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      focusSoon(o.mode === "pitch" ? "pitch" : o.url ? "buyer" : "url");
    },
    [focusSoon],
  );

  // Register with the provider so TierCtas and the band input can open this form.
  useEffect(() => ctx.registerForm({ variant, open: expand }), [ctx.registerForm, variant, expand]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving from /?tier=…#preview, a band input on another page, or ?mode=pitch: open the form.
  useEffect(() => {
    if (variant !== "hero") return;
    try {
      const q = new URLSearchParams(window.location.search);
      const draft = takeDraftUrl();
      const wantsForm = draft !== null || q.has("tier") || q.get("mode") === "pitch" || window.location.hash === `#${id}`;
      // One-time sync from the URL/session on mount (browser-only state), not a render cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (wantsForm && !peekStoredPreview()) expand({ mode: q.get("mode") === "pitch" ? "pitch" : "url", url: draft ?? undefined });
    } catch {
      // stay on the quick input
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Honest loading copy: step text advances on elapsed time, and is replaced as soon as the response lands.
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => clearInterval(t);
  }, [phase, startedAt]);

  // The hero shows this tab's last preview (sessionStorage) until the visitor starts a new one.
  const showStored = ctx.preview && (phase === "result" || (variant === "hero" && phase === "quick" && !ranHere));

  function onQuickSubmit(e: FormEvent) {
    e.preventDefault();
    const u = normalizeUrl(url);
    if (!u.ok) {
      setQuickError(u.error);
      focusSoon("quick-url");
      return;
    }
    setQuickError(null);
    setUrl(u.url);
    if (variant === "band") ctx.openForm({ mode: "url", url: u.url });
    else expand({ mode: "url", url: u.url });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validateForm({ mode, url, pitch, buyer, email });
    if (!v.ok) {
      setErrors(v.errors);
      const first = (["url", "pitch", "buyer", "email"] as const).find((k) => v.errors[k]);
      const n = Object.keys(v.errors).length;
      setFormError(`Please fix ${n === 1 ? "the highlighted field" : `the ${n} highlighted fields`}.`);
      if (first) focusSoon(first);
      return;
    }
    setErrors({});
    if (v.input.url) setUrl(v.input.url);
    if (SITE_KEY && !turnstileToken) {
      setFormError("One moment: the bot check is still loading. Try again in a second.");
      return;
    }
    track("preview_started", { mode });
    const now = Date.now();
    setStartedAt(now);
    setElapsed(0);
    setPhase("loading");
    setRanHere(true);

    const res = await postJson("/api/preview", {
      ...v.input,
      turnstile_token: SITE_KEY ? turnstileToken : null,
      src: getAttribution().src ?? null,
    });
    // Turnstile tokens are single-use: remount the widget for any next submit.
    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);

    const out = previewOutcome(res.status, res.body);
    switch (out.kind) {
      case "done":
        ctx.setPreview({ id: out.previewId, input: v.input, status: "done", result: out.result, savedAt: Date.now() });
        track("preview_completed", {});
        setPhase("result");
        focusSoon("result-title");
        return;
      case "refused":
        ctx.setPreview({ id: out.previewId, input: v.input, status: "refused", reason: out.reason, savedAt: Date.now() });
        track("preview_refused", {});
        setPhase("result");
        focusSoon("result-title");
        return;
      case "unreadable":
        setMode("pitch");
        setPhase("form");
        setFormError(out.message);
        focusSoon("pitch");
        return;
      case "rate_limited":
        ctx.setDraftInput(v.input);
        setSkipMessage(out.message);
        setPhase("skipped");
        focusSoon("result-title");
        return;
      default:
        setPhase("form");
        setFormError(out.message);
    }
  }

  function startOver() {
    const last = ctx.preview?.input;
    if (last) {
      setBuyer((b) => b || last.buyer_desc);
      if (last.email) setEmail((m) => m || last.email || "");
    }
    ctx.setPreview(null);
    setRanHere(true);
    setUrl("");
    setPitch("");
    setMode("url");
    setPhase("form");
    focusSoon("url");
  }

  async function copyLink(previewId: string) {
    track("share_clicked", { where: "preview_result" });
    const link = `${window.location.origin}/preview/${previewId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      window.prompt("Copy this link:", link);
    }
  }

  // ------------------------------------------------------------ views

  let body: React.ReactNode;

  if (phase === "loading") {
    const step = loadingStep(elapsed, mode);
    const steps = [mode === "url" ? "Reading your page" : "Reading your pitch", "Finding the weakest line", "Writing a rewrite"];
    body = (
      <div className={styles.loading}>
        <p className={styles.loadingNow} role="status" aria-live="polite">
          {step.text}
        </p>
        <ol className={styles.steps}>
          {steps.map((s, i) => (
            <li key={s} data-state={i < step.index ? "done" : i === step.index ? "active" : "todo"}>
              {s}
            </li>
          ))}
        </ol>
        <p className={styles.small}>Usually about 10 seconds. Please keep this tab open.</p>
      </div>
    );
  } else if (showStored && ctx.preview) {
    const p = ctx.preview;
    body =
      p.status === "refused" ? (
        <div>
          <h2 id={fid("result-title")} tabIndex={-1} className={styles.title}>
            Your free preview
          </h2>
          <PreviewRefusalView reason={p.reason} />
          <Button type="button" variant="secondary" onClick={startOver}>
            Preview another page
          </Button>
        </div>
      ) : (
        <div>
          <h2 id={fid("result-title")} tabIndex={-1} className={styles.title}>
            Your free preview
          </h2>
          {p.result ? <PreviewResultView result={p.result} /> : null}
          <div className={styles.resultActions}>
            <a href={`/preview/${p.id}`}>Open as a page</a>
            <button type="button" className={styles.linkButton} onClick={() => copyLink(p.id)}>
              {copied ? "Link copied" : "Copy link"}
            </button>
            <button type="button" className={styles.linkButton} onClick={startOver}>
              Preview another page
            </button>
          </div>
          <span className={styles.srOnly} aria-live="polite">
            {copied ? "Link copied to clipboard" : ""}
          </span>
          <Upsell prices={prices} offer={offer} />
        </div>
      );
  } else if (phase === "skipped") {
    body = (
      <div>
        <h2 id={fid("result-title")} tabIndex={-1} className={styles.title}>
          Free preview limit reached
        </h2>
        <Banner tone="info" role="alert">
          <p>{skipMessage}</p>
        </Banner>
        <Upsell prices={prices} offer={offer} title="Skip the preview: have real people judge your page" />
        <button type="button" className={styles.linkButton} onClick={() => setPhase("form")}>
          Back to the form
        </button>
      </div>
    );
  } else if (phase === "form") {
    const turnstile = SITE_KEY ? <Turnstile key={turnstileKey} siteKey={SITE_KEY} onToken={setTurnstileToken} /> : null;
    body = (
      <form onSubmit={onSubmit} noValidate className={styles.form} aria-labelledby={fid("form-title")}>
        <h2 id={fid("form-title")} className={styles.title}>
          Free preview
        </h2>
        <p className={styles.small}>Free AI preview in about 10 seconds. No card, no login.</p>
        {ctx.selectedTier ? (
          <p className={styles.small}>
            Selected: <strong>{TIER_LABELS[ctx.selectedTier]}</strong>. Run the preview first; checkout uses the same details.
          </p>
        ) : null}
        <SegmentedControl<Mode>
          options={[
            { value: "url", label: "Page URL" },
            { value: "pitch", label: "Paste your pitch" },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErrors({});
          }}
          ariaLabel="What should we read?"
          idPrefix={fid("mode")}
        />
        <div
          className={styles.panel}
          role="tabpanel"
          id={segmentPanelId(fid("mode"), mode)}
          aria-labelledby={segmentTabId(fid("mode"), mode)}
        >
          {mode === "url" ? (
            <Field id={fid("url")} label="Your page URL" error={errors.url}>
              <Input
                id={fid("url")}
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="yourproduct.com"
                value={url}
                aria-invalid={errors.url ? true : undefined}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => {
                  const u = normalizeUrl(url);
                  if (u.ok && u.url !== url) setUrl(u.url);
                }}
              />
            </Field>
          ) : (
            <Field
              id={fid("pitch")}
              label="Your pitch"
              hint={`Paste your headline, main points and call to action (at least ${PITCH_MIN} characters). ${pitch.trim().length} so far.`}
              error={errors.pitch}
            >
              <Textarea
                id={fid("pitch")}
                rows={6}
                value={pitch}
                aria-invalid={errors.pitch ? true : undefined}
                onChange={(e) => setPitch(e.target.value)}
              />
            </Field>
          )}
        </div>
        <Field id={fid("buyer")} label="Who's your buyer?" hint="e.g. freelance designers who bill hourly" error={errors.buyer}>
          <Input
            id={fid("buyer")}
            type="text"
            maxLength={300}
            value={buyer}
            aria-invalid={errors.buyer ? true : undefined}
            onChange={(e) => setBuyer(e.target.value)}
          />
        </Field>
        <Field
          id={fid("email")}
          label="Your email"
          hint="We may send up to two follow-ups about your preview. Unsubscribe anytime."
          error={errors.email}
        >
          <Input
            id={fid("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            aria-invalid={errors.email ? true : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {turnstile}
        <Button type="submit" full size="lg">
          Run free preview
        </Button>
        <div aria-live="assertive" className={styles.statusLine}>
          {formError ? (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      </form>
    );
  } else {
    body = (
      <div>
        <form onSubmit={onQuickSubmit} noValidate className={styles.quick}>
          <label htmlFor={fid("quick-url")} className={styles.quickLabel}>
            Your landing page URL
          </label>
          <div className={styles.quickRow}>
            <Input
              id={fid("quick-url")}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="yourproduct.com"
              value={url}
              aria-invalid={quickError ? true : undefined}
              aria-describedby={`${fid("quick-url")}-note`}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" size="lg">
              Get free preview
            </Button>
          </div>
          <div aria-live="polite">
            {quickError ? (
              <p className={styles.error} role="alert">
                {quickError}
              </p>
            ) : null}
          </div>
          <p id={`${fid("quick-url")}-note`} className={styles.small}>
            Free AI preview in about 10 seconds. No card, no login.{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => (variant === "band" ? ctx.openForm({ mode: "pitch" }) : expand({ mode: "pitch" }))}
            >
              or paste your pitch
            </button>
          </p>
        </form>
        {ctx.linkedPreviewId && !ctx.preview ? (
          <p className={styles.small}>
            Picking up from our email?{" "}
            <a href={`/preview/${ctx.linkedPreviewId}${ctx.selectedTier ? `?tier=${ctx.selectedTier}` : ""}`}>
              Open your earlier preview
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div id={id} ref={rootRef} className={styles.root} data-variant={variant}>
      {body}
    </div>
  );
}
