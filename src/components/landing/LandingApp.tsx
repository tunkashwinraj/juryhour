"use client";
// Landing client island: free preview form → result → price ladder → checkout / specialist quote.
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import type { AddonName } from "@/lib/constants";
import type { PreviewResult } from "@/lib/types";
import type { LandingData } from "@/lib/queries";
import { SRC_COOKIE, isUuid, normalizeSrc, usd } from "@/components/rules";
import { ADDON_OPTIONS, PACKAGES, addonsTotal, type BuyableTier } from "./packages";
import { Turnstile } from "./Turnstile";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; previewId: string; result: PreviewResult }
  | { status: "refused"; previewId: string | null; reason: string }
  | { status: "error"; error: string };

const MIN_PITCH_CHARS = 40; // /api/checkout rejects shorter pitches

type ApiError = { ok: false; code?: string; error?: string };

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function postJson<T>(url: string, body: unknown): Promise<T | ApiError> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, code: `http_${res.status}`, error: `The server answered ${res.status}.` };
    return data as T | ApiError;
  } catch {
    return { ok: false, code: "network", error: "Network error. Check your connection and try again." };
  }
}

export function LandingApp({
  intro,
  data,
  turnstileSiteKey,
}: {
  intro: React.ReactNode;
  data: Promise<LandingData>;
  turnstileSiteKey: string | null;
}) {
  const [inputMode, setInputMode] = useState<"url" | "pitch">("url");
  const [url, setUrl] = useState("");
  const [pitch, setPitch] = useState("");
  const [buyer, setBuyer] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [parentOrderId, setParentOrderId] = useState<string | null>(null);
  const [linkedPreviewId, setLinkedPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // ?src= capture → cookie (30 days); ?parent= for retests/upgrades from a report page;
  // ?preview= from follow-up emails links the earlier free preview to the order.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fromQuery = normalizeSrc(q.get("src"));
    if (fromQuery) {
      document.cookie = `${SRC_COOKIE}=${encodeURIComponent(fromQuery)}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax`;
    }
    const parent = q.get("parent");
    // Reading browser-only state after mount is the intent here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(fromQuery ?? normalizeSrc(readCookie(SRC_COOKIE)));
    if (isUuid(parent)) setParentOrderId(parent);
    const linked = q.get("preview");
    if (isUuid(linked)) setLinkedPreviewId(linked);
  }, []);

  const pageInput = inputMode === "url" ? { url: url.trim() } : { pitch_text: pitch.trim() };
  const hasPageInput = inputMode === "url" ? url.trim().length > 0 : pitch.trim().length >= MIN_PITCH_CHARS;
  const formComplete = hasPageInput && buyer.trim().length > 0 && /\S+@\S+\.\S+/.test(email);
  const incompleteMsg =
    inputMode === "pitch" && pitch.trim().length > 0 && pitch.trim().length < MIN_PITCH_CHARS
      ? `Your pitch needs at least ${MIN_PITCH_CHARS} characters.`
      : "Add your page, who your buyer is, and your email.";
  const refused = preview.status === "refused";

  const focusForm = useCallback((msg: string) => {
    setFormError(msg);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const first = formRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    first?.focus({ preventScroll: true });
  }, []);

  async function runPreview(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!formComplete) {
      setFormError(incompleteMsg);
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setFormError("One moment: the bot check is still loading.");
      return;
    }
    setPreview({ status: "loading" });
    const res = await postJson<
      | { ok: true; preview_id: string; result: PreviewResult }
      | { ok: true; preview_id: string; refused: true; reason: string }
    >("/api/preview", {
      ...pageInput,
      buyer_desc: buyer.trim(),
      email: email.trim(),
      turnstile_token: turnstileSiteKey ? turnstileToken : null,
      ...(src ? { src } : {}),
    });
    // Turnstile tokens are single-use: get a fresh widget for the next submit.
    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);
    if (!res.ok) {
      setPreview({ status: "error", error: res.error ?? "Something went wrong. Try again." });
      return;
    }
    if ("refused" in res && res.refused) {
      setPreview({ status: "refused", previewId: res.preview_id, reason: res.reason });
      return;
    }
    const r = res as { preview_id: string; result: PreviewResult };
    if (r.result.safety.verdict === "refuse") {
      setPreview({ status: "refused", previewId: r.preview_id, reason: r.result.safety.reason });
      return;
    }
    setPreview({ status: "done", previewId: r.preview_id, result: r.result });
  }

  const previewId = preview.status === "done" ? preview.previewId : linkedPreviewId;

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>{intro}</div>
      <div className="case-file" aria-live="polite">
        {preview.status === "done" ? (
          <PreviewResultView
            result={preview.result}
            onReset={() => setPreview({ status: "idle" })}
          />
        ) : preview.status === "refused" ? (
          <div>
            <div className="notice notice-bad" role="alert">
              <p>
                <strong>We can&apos;t test this product.</strong>
              </p>
              {preview.reason ? <p className="small">{preview.reason}</p> : null}
            </div>
            <p className="small muted">
              We don&apos;t run juries on gambling picks, adult content, get-rich-quick offers, scams, hate, weapons, illegal
              goods or MLM.
            </p>
          </div>
        ) : (
          <form ref={formRef} onSubmit={runPreview} noValidate>
            <h2>Free preview</h2>
            <p className="lede">No card, no login. See what a stranger takes from your page in about 10 seconds.</p>

            {inputMode === "url" ? (
              <div className="field">
                <label htmlFor="pv-url">Your page URL</label>
                <input
                  id="pv-url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://yourproduct.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <button type="button" className="btn-link small" onClick={() => setInputMode("pitch")}>
                  Paste your pitch instead
                </button>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="pv-pitch">Your pitch</label>
                <textarea
                  id="pv-pitch"
                  placeholder="Headline, subheadline, the main points, and your call to action."
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value)}
                />
                <button type="button" className="btn-link small" onClick={() => setInputMode("url")}>
                  Use a URL instead
                </button>
              </div>
            )}

            <div className="field">
              <label htmlFor="pv-buyer">Who&apos;s your buyer?</label>
              <input
                id="pv-buyer"
                type="text"
                placeholder="e.g. freelance designers who bill hourly"
                value={buyer}
                onChange={(e) => setBuyer(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="field">
              <label htmlFor="pv-email">Email</label>
              <input
                id="pv-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="hint">We may send up to two follow-ups about your preview. Unsubscribe anytime.</span>
            </div>

            {turnstileSiteKey ? (
              <Turnstile key={turnstileKey} siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
            ) : null}

            <button className="btn btn-primary" type="submit" disabled={preview.status === "loading"} style={{ width: "100%" }}>
              {preview.status === "loading" ? "Reading your page…" : "Run free preview"}
            </button>
            {preview.status === "error" ? (
              <p className="form-error" role="alert">
                {preview.error}
              </p>
            ) : null}
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
          </form>
        )}
      </div>
        </div>
      </section>

      <section className="section" id="pricing" aria-labelledby="prices-h">
        <div className="wrap">
        <h2 id="prices-h">Have real people judge it</h2>
        <p className="muted narrow">
          The preview is our AI&apos;s read. A jury is real, identity-verified people who match your buyer, recruited and paid
          through Terac. You get a directional signal from real people, not a guarantee of sales.
        </p>
        <Suspense fallback={<p className="skeleton">Loading prices…</p>}>
          <Ladder
            data={data}
            refused={refused}
            formComplete={formComplete}
            onIncomplete={() => focusForm(`${incompleteMsg} The free preview is optional.`)}
            checkoutBase={{
              ...pageInput,
              email: email.trim(),
              buyer_desc: buyer.trim(),
              ...(previewId ? { preview_id: previewId } : {}),
              ...(parentOrderId ? { parent_order_id: parentOrderId } : {}),
              ...(src ? { src } : {}),
            }}
          />
        </Suspense>
        </div>
      </section>
    </>
  );
}

function PreviewResultView({ result, onReset }: { result: PreviewResult; onReset: () => void }) {
  return (
    <div>
      <h2>Your free preview</h2>
      <p className="lede">This is our AI&apos;s read, not a jury. Real people confirm or overturn it.</p>
      <dl className="preview-result">
        <div>
          <dt>What we read as your headline</dt>
          <dd className="quoteish">{result.headline}</dd>
        </div>
        <div>
          <dt>Your weakest line</dt>
          <dd className="quoteish">{result.weakest_line}</dd>
        </div>
        <div>
          <dt>How we&apos;d rewrite it</dt>
          <dd className="rewrite">{result.rewrite_suggestion}</dd>
        </div>
        <div>
          <dt>Who we&apos;d recruit for your jury</dt>
          <dd>{result.recommended_panel}</dd>
        </div>
      </dl>
      <div className="cta-row" style={{ marginTop: 20, marginBottom: 0 }}>
        <a className="btn btn-primary" href="#pricing">
          See jury prices
        </a>
        <button type="button" className="btn-link" onClick={onReset}>
          Preview another page
        </button>
      </div>
    </div>
  );
}

function Ladder({
  data,
  refused,
  formComplete,
  onIncomplete,
  checkoutBase,
}: {
  data: Promise<LandingData>;
  refused: boolean;
  formComplete: boolean;
  onIncomplete: () => void;
  checkoutBase: Record<string, string | undefined>;
}) {
  const { prices, salesPaused: initiallyPaused } = use(data);
  const [salesPaused, setSalesPaused] = useState(initiallyPaused);
  const [addons, setAddons] = useState<AddonName[]>([]);
  const [secondUrl, setSecondUrl] = useState("");
  const [buying, setBuying] = useState<BuyableTier | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ status: "idle" | "loading" | "done" | "error"; token?: string; error?: string }>({
    status: "idle",
  });

  const extra = addonsTotal(addons);
  const canBuy = !refused && !salesPaused;

  function toggleAddon(a: AddonName) {
    setAddons((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  }

  async function buy(tier: BuyableTier) {
    setBuyError(null);
    if (!formComplete) return onIncomplete();
    if (addons.includes("secondPage") && !secondUrl.trim()) {
      setBuyError("Add the URL of your second page, or untick “Test a second page”.");
      return;
    }
    setBuying(tier);
    const res = await postJson<{ ok: true; purchase_url: string; token: string }>("/api/checkout", {
      ...checkoutBase,
      tier,
      addons,
      ...(addons.includes("secondPage") ? { second_url: secondUrl.trim() } : {}),
    });
    if (res.ok) {
      window.location.assign(res.purchase_url);
      return;
    }
    setBuying(null);
    if (res.code === "sales_paused") setSalesPaused(true);
    setBuyError(res.error ?? "Checkout failed. Try again.");
  }

  async function requestQuote() {
    if (!formComplete) return onIncomplete();
    setQuote({ status: "loading" });
    const res = await postJson<{ ok: true; token: string }>("/api/quote", checkoutBase);
    if (res.ok) setQuote({ status: "done", token: res.token });
    else setQuote({ status: "error", error: res.error ?? "Could not request a quote. Try again." });
  }

  return (
    <>
      {salesPaused ? (
        <div className="notice notice-warn" role="status">
          <p>
            <strong>We&apos;re at capacity, verdicts reopen shortly.</strong> Leave your email with a free preview above;
            buying is paused until we have room for your jury.
          </p>
        </div>
      ) : null}
      {refused ? (
        <div className="notice notice-bad" role="status">
          <p>We can&apos;t test this product, so there&apos;s nothing to buy.</p>
        </div>
      ) : null}

      {canBuy ? (
        <fieldset className="addons">
          <legend>Add-ons</legend>
          {ADDON_OPTIONS.map((a) => (
            <label key={a.key} className="check">
              <input type="checkbox" checked={addons.includes(a.key)} onChange={() => toggleAddon(a.key)} />
              <span>
                {a.label} <span className="muted num">+{usd(a.price)}</span>
              </span>
            </label>
          ))}
          {addons.includes("secondPage") ? (
            <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
              <label htmlFor="second-url">Second page URL</label>
              <input
                id="second-url"
                type="url"
                placeholder="https://yourproduct.com/pricing"
                value={secondUrl}
                onChange={(e) => setSecondUrl(e.target.value)}
              />
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <ul className="ladder">
        {PACKAGES.map((p) => {
          const price = prices[p.tier];
          return (
            <li key={p.tier} className={p.featured ? "rung rung-featured" : "rung"}>
              <div>
                <h3 className="rung-name">
                  {p.name}
                  {p.featured ? <span className="badge badge-live">Recommended</span> : null}
                </h3>
                <p className="rung-meta">{p.summary}. Same-day delivery.</p>
              </div>
              <ul className="rung-includes">
                {p.includes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="rung-buy">
                <div>
                  <div className="rung-price">{usd(price)}</div>
                  {canBuy && extra > 0 && price !== null ? (
                    <div className="small muted num">{usd(price + extra)} with add-ons</div>
                  ) : null}
                </div>
                {refused ? null : (
                  <button
                    type="button"
                    className={p.featured ? "btn btn-primary" : "btn"}
                    disabled={!canBuy || buying !== null}
                    onClick={() => buy(p.tier)}
                  >
                    {buying === p.tier ? "Opening checkout…" : "Get my verdict"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {buyError ? (
        <p className="form-error" role="alert">
          {buyError}
        </p>
      ) : null}

      <div className="specialist" id="specialist">
        <h3 className="rung-name">Specialist Jury</h3>
        <p className="rung-meta">From $499, quoted. 8 verified professionals. 24–72 hours.</p>
        <p>
          The Proof format with professionals who match your buyer and questions written for them: would they buy, what
          stops them, what price feels right.
        </p>
        {refused ? null : quote.status === "done" ? (
          <div className="notice" role="status">
            <p>
              <strong>Quote requested.</strong> We email your price as soon as our jury partner quotes it. The quote
              holds for 48 hours. <a href={`/o/${quote.token}`}>Track your request</a>.
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={salesPaused || quote.status === "loading"}
              onClick={requestQuote}
            >
              {quote.status === "loading" ? "Requesting…" : "Get a quote"}
            </button>
            <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
              Uses the page, buyer and email from the preview form.
            </p>
            {quote.status === "error" ? (
              <p className="form-error" role="alert">
                {quote.error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
