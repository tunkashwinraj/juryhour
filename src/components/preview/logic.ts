// Pure, framework-free logic for the preview + checkout UX (unit-tested in tests/website/c).
// No React, no DOM: storage is passed in so tests can fake it.
import { TIERS, type AddonName, type TierName } from "@/lib/constants";

export type BuyableTier = "spark" | "pulse" | "proof" | "launch_pack";
export type CtaTier = BuyableTier | "specialist";
export const CTA_TIERS: readonly CtaTier[] = ["spark", "pulse", "proof", "launch_pack", "specialist"];
export const SITE_ADDONS: readonly AddonName[] = ["extra5", "rush"]; // "secondPage" is not sold (lead decision)

export const TIER_LABELS: Record<TierName, string> = {
  spark: "Spark",
  pulse: "Pulse",
  proof: "Proof",
  launch_pack: "Launch Pack",
  specialist: "Specialist Jury",
};

export function isCtaTier(v: unknown): v is CtaTier {
  return typeof v === "string" && (CTA_TIERS as readonly string[]).includes(v);
}

export const PITCH_MIN = 40;
export const PITCH_MAX = 6_000;
export const BUYER_MIN = 3;
export const BUYER_MAX = 300;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

// ---------------------------------------------------------------- input validation

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/** Trims, adds https:// when no scheme, and accepts only public-looking http(s) URLs. */
export function normalizeUrl(raw: string): UrlCheck {
  const s = raw.trim();
  if (!s) return { ok: false, error: "Enter your page URL." };
  if (/\s/.test(s)) return { ok: false, error: "That URL has spaces in it. Check it and try again." };
  if (s.length > 2_000) return { ok: false, error: "That URL is too long." };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/:]+:\d+(\/|$)/.test(s);
  if (hasScheme && !/^https?:\/\//i.test(s)) {
    return { ok: false, error: "Use a web address that starts with http:// or https://." };
  }
  const withScheme = hasScheme ? s : `https://${s.replace(/^\/+/, "")}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, error: "That doesn't look like a web address. Try something like yourproduct.com." };
  }
  const host = u.hostname;
  if (!host.includes(".") || host.endsWith(".") || /^[\d.]+$/.test(host) || host.startsWith("[")) {
    return { ok: false, error: "That doesn't look like a public web address. Try something like yourproduct.com." };
  }
  if (u.username || u.password) return { ok: false, error: "Remove the username or password from the URL." };
  return { ok: true, url: u.toString() };
}

export function isValidEmail(email: string): boolean {
  const e = email.trim();
  return e.length <= 254 && EMAIL_RE.test(e);
}

export type FormValues = { mode: "url" | "pitch"; url: string; pitch: string; buyer: string; email: string };
export type FormErrors = Partial<Record<"url" | "pitch" | "buyer" | "email", string>>;
export type CheckoutInput = { url?: string; pitch_text?: string; buyer_desc: string; email: string };

/** Validates the full form. On success returns the API-ready input (normalized URL). */
export function validateForm(v: FormValues): { ok: true; input: CheckoutInput } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  let target: { url: string } | { pitch_text: string } | null = null;
  if (v.mode === "url") {
    const u = normalizeUrl(v.url);
    if (u.ok) target = { url: u.url };
    else errors.url = u.error;
  } else {
    const p = v.pitch.trim();
    if (p.length < PITCH_MIN) errors.pitch = `Paste at least ${PITCH_MIN} characters: your headline, main points and call to action.`;
    else if (p.length > PITCH_MAX) errors.pitch = `Keep it under ${PITCH_MAX.toLocaleString("en-US")} characters.`;
    else target = { pitch_text: p };
  }
  const buyer = v.buyer.trim();
  if (buyer.length < BUYER_MIN) errors.buyer = "Describe your buyer in a few words, e.g. “freelance designers who bill hourly”.";
  else if (buyer.length > BUYER_MAX) errors.buyer = `Keep it under ${BUYER_MAX} characters.`;
  if (!isValidEmail(v.email)) errors.email = "Enter a valid email address.";
  if (!target || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: { ...target, buyer_desc: buyer, email: v.email.trim().toLowerCase() } };
}

// ---------------------------------------------------------------- stored preview

export type PreviewView = {
  headline: string;
  weakest_line: string;
  rewrite_suggestion: string;
  recommended_panel: string;
};

/** The last preview of this tab: id + inputs + result (or refusal). */
export type StoredPreview = {
  id: string;
  input: { url?: string; pitch_text?: string; buyer_desc: string; email: string | null };
  status: "done" | "refused";
  result?: PreviewView;
  reason?: string;
  savedAt: number;
};

export const PREVIEW_STORAGE_KEY = "jh_preview_v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Defensive parse: anything malformed → null (never trust storage). */
export function parseStoredPreview(raw: string | null): StoredPreview | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || !isUuid(v.id) || (v.status !== "done" && v.status !== "refused")) return null;
    const i = (v.input ?? {}) as Record<string, unknown>;
    const buyer = s(i.buyer_desc, BUYER_MAX);
    if (!buyer) return null;
    const url = s(i.url, 2_000);
    const pitch = s(i.pitch_text, PITCH_MAX);
    if (!url === !pitch) return null;
    const email = typeof i.email === "string" && isValidEmail(i.email) ? i.email : null;
    const out: StoredPreview = {
      id: v.id,
      input: { ...(url ? { url } : { pitch_text: pitch }), buyer_desc: buyer, email },
      status: v.status,
      savedAt: typeof v.savedAt === "number" ? v.savedAt : 0,
    };
    if (v.status === "done") {
      const r = (v.result ?? {}) as Record<string, unknown>;
      const view = {
        headline: s(r.headline, 2_000),
        weakest_line: s(r.weakest_line, 2_000),
        rewrite_suggestion: s(r.rewrite_suggestion, 4_000),
        recommended_panel: s(r.recommended_panel, 2_000),
      };
      if (Object.values(view).some((x) => x === undefined)) return null;
      out.result = view as PreviewView;
    } else {
      out.reason = s(v.reason, 1_000) ?? "";
    }
    return out;
  } catch {
    return null;
  }
}

/** A `previews` row as /preview/[id] selects it (no email column). */
export type PreviewRow = {
  id: string;
  url: string | null;
  pitch_text: string | null;
  buyer_desc: string;
  headline: string | null;
  weakest_line: string | null;
  rewrite_suggestion: string | null;
  recommended_panel: string | null;
  safety_verdict: "allow" | "refuse";
  safety_reason: string | null;
  created_at: string;
};

/** Row → StoredPreview. Email is deliberately null: the page never receives it. */
export function previewRowToStored(r: PreviewRow): StoredPreview {
  const input = { ...(r.url ? { url: r.url } : { pitch_text: r.pitch_text ?? "" }), buyer_desc: r.buyer_desc, email: null };
  const savedAt = Date.parse(r.created_at) || 0;
  if (r.safety_verdict === "refuse") return { id: r.id, input, status: "refused", reason: r.safety_reason ?? "", savedAt };
  return {
    id: r.id,
    input,
    status: "done",
    result: {
      headline: r.headline ?? "",
      weakest_line: r.weakest_line ?? "",
      rewrite_suggestion: r.rewrite_suggestion ?? "",
      recommended_panel: r.recommended_panel ?? "",
    },
    savedAt,
  };
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readStoredPreview(storage: StorageLike | null | undefined): StoredPreview | null {
  try {
    return parseStoredPreview(storage?.getItem(PREVIEW_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writeStoredPreview(storage: StorageLike | null | undefined, p: StoredPreview | null): void {
  try {
    if (!storage) return;
    if (p) storage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(p));
    else storage.removeItem(PREVIEW_STORAGE_KEY);
  } catch {
    // private mode / quota: the in-memory context still works for this page
  }
}

// ---------------------------------------------------------------- API outcomes

export type ApiFailure = { ok: false; status: number; code: string; error: string };

export type PreviewOutcome =
  | { kind: "done"; previewId: string; result: PreviewView }
  | { kind: "refused"; previewId: string; reason: string }
  | { kind: "unreadable"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "error"; message: string; resetBotCheck: boolean };

/** Maps a /api/preview JSON body (+ HTTP status) to what the UI shows. */
export function previewOutcome(status: number, body: unknown): PreviewOutcome {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.ok === true && isUuid(b.preview_id)) {
    if (b.refused === true) return { kind: "refused", previewId: b.preview_id, reason: String(b.reason ?? "") };
    const r = (b.result ?? {}) as Record<string, unknown>;
    const safety = (r.safety ?? {}) as Record<string, unknown>;
    if (safety.verdict === "refuse") return { kind: "refused", previewId: b.preview_id, reason: String(safety.reason ?? "") };
    if (typeof r.headline === "string") {
      return {
        kind: "done",
        previewId: b.preview_id,
        result: {
          headline: r.headline,
          weakest_line: String(r.weakest_line ?? ""),
          rewrite_suggestion: String(r.rewrite_suggestion ?? ""),
          recommended_panel: String(r.recommended_panel ?? ""),
        },
      };
    }
  }
  const code = typeof b.code === "string" ? b.code : status === 0 ? "network" : `http_${status}`;
  switch (code) {
    case "page_unreadable":
      return { kind: "unreadable", message: "We couldn't read that page. Paste your pitch instead?" };
    case "rate_limited":
      return {
        kind: "rate_limited",
        message:
          "You've reached today's free preview limit (3 per email, 10 per network in 24 hours). Try again tomorrow, or skip the preview and have real people judge your page now.",
      };
    case "turnstile_failed":
      return { kind: "error", message: "The bot check didn't go through. Complete it again and resubmit.", resetBotCheck: true };
    case "preview_failed":
      return { kind: "error", message: "Our reviewer is busy right now. Please try again in a minute.", resetBotCheck: true };
    case "bad_request":
      return { kind: "error", message: "Some details didn't pass our checks. Review the fields and try again.", resetBotCheck: true };
    case "network":
      return { kind: "error", message: "Network error. Check your connection and try again.", resetBotCheck: true };
    default:
      return { kind: "error", message: "Something went wrong on our side. Please try again.", resetBotCheck: true };
  }
}

/** Honest loading copy: advances on elapsed time, but the caller swaps it out the moment the response lands. */
export function loadingStep(elapsedMs: number, mode: "url" | "pitch"): { index: number; text: string } {
  const steps = [mode === "url" ? "Reading your page…" : "Reading your pitch…", "Finding the weakest line…", "Writing a rewrite…"];
  const index = elapsedMs < 3_000 ? 0 : elapsedMs < 7_000 ? 1 : 2;
  return { index, text: steps[index] };
}

// ---------------------------------------------------------------- checkout

export type TierAction =
  | { kind: "hidden" } // refused content: no pricing anywhere
  | { kind: "waitlist" } // sales paused
  | { kind: "open_form" } // no preview/input yet: scroll to the form (or link to /?tier=…#preview)
  | { kind: "need_email" } // preview loaded from a shared link without this tab's email
  | { kind: "quote" } // specialist with input → /api/quote
  | { kind: "checkout" }; // buyable tier with input → /api/checkout

export function decideTierAction(i: {
  tier: CtaTier;
  refused: boolean;
  salesPaused: boolean;
  input: { email: string | null } | null;
}): TierAction {
  if (i.refused) return { kind: "hidden" };
  if (i.salesPaused) return { kind: "waitlist" };
  if (!i.input) return { kind: "open_form" };
  if (!i.input.email) return { kind: "need_email" };
  return i.tier === "specialist" ? { kind: "quote" } : { kind: "checkout" };
}

export type CheckoutBody = {
  tier: BuyableTier;
  addons: AddonName[];
  email: string;
  buyer_desc: string;
  url?: string;
  pitch_text?: string;
  preview_id?: string;
  parent_order_id?: string;
  code?: string;
  src?: string;
};

export function buildCheckoutBody(i: {
  tier: BuyableTier;
  addons: AddonName[];
  input: CheckoutInput;
  previewId?: string | null;
  parentOrderId?: string | null;
  code?: string | null;
  src?: string | null;
}): CheckoutBody {
  const addons = [...new Set(i.addons.filter((a) => (SITE_ADDONS as readonly string[]).includes(a)))];
  return {
    tier: i.tier,
    addons,
    email: i.input.email,
    buyer_desc: i.input.buyer_desc,
    ...(i.input.url ? { url: i.input.url } : { pitch_text: i.input.pitch_text }),
    ...(isUuid(i.previewId) ? { preview_id: i.previewId } : {}),
    ...(isUuid(i.parentOrderId) ? { parent_order_id: i.parentOrderId } : {}),
    ...(i.code ? { code: i.code } : {}),
    ...(i.src ? { src: i.src } : {}),
  };
}

export type CheckoutOutcome =
  | { kind: "redirect"; url: string }
  | { kind: "quote"; token: string }
  | { kind: "paused"; message: string }
  | { kind: "refused"; message: string }
  | { kind: "bad_parent"; message: string }
  | { kind: "error"; message: string };

/** Maps /api/checkout and /api/quote responses. Only https purchase URLs are followed. */
export function checkoutOutcome(status: number, body: unknown): CheckoutOutcome {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.ok === true) {
    if (typeof b.purchase_url === "string" && /^https:\/\//i.test(b.purchase_url)) return { kind: "redirect", url: b.purchase_url };
    if (typeof b.purchase_url !== "string" && typeof b.token === "string" && b.token) return { kind: "quote", token: b.token };
    return { kind: "error", message: "Checkout returned an unexpected answer. Nothing was charged. Please try again." };
  }
  const code = typeof b.code === "string" ? b.code : status === 0 ? "network" : `http_${status}`;
  switch (code) {
    case "sales_paused":
      return { kind: "paused", message: "We're at capacity right now, so buying is paused. Join the waitlist and we'll email you once when we reopen." };
    case "content_refused":
      return { kind: "refused", message: "We can't test this product." };
    case "bad_parent":
      return {
        kind: "bad_parent",
        message: "That upgrade link doesn't match this email. Use the email from your original order, or continue without the upgrade credit.",
      };
    case "checkout_unavailable":
      return { kind: "error", message: "Our payment provider didn't respond. Nothing was charged. Try again in a moment." };
    case "bad_request":
      return { kind: "error", message: `Some order details didn't pass our checks${b.error ? ` (${String(b.error).slice(0, 160)})` : ""}. Fix them and try again.` };
    case "network":
      return { kind: "error", message: "Network error. Check your connection and try again. Nothing was charged." };
    default:
      return { kind: "error", message: "Something went wrong creating your order. Nothing was charged. Please try again." };
  }
}

// ---------------------------------------------------------------- prices

export type PriceMap = Partial<Record<TierName, number | null>>;
export type OfferLike = { tier: TierName; priceUsd: number; normalUsd: number; endsAt: string } | null | undefined;

/** The launch offer only while its end time is in the future (static shells can be minutes stale). */
export function liveOffer(offer: OfferLike, nowMs: number): Exclude<OfferLike, undefined> {
  if (!offer) return null;
  const ends = Date.parse(offer.endsAt);
  return Number.isFinite(ends) && nowMs < ends ? offer : null;
}

/** Display price for a tier: the live offer price, else the server price, else the constant. */
export function displayPrice(tier: TierName, prices: PriceMap | undefined, offer: OfferLike, nowMs: number): { price: number | null; compareAt: number | null } {
  const base = prices?.[tier] ?? TIERS[tier].price;
  const o = liveOffer(offer, nowMs);
  if (o && o.tier === tier) return { price: o.priceUsd, compareAt: o.normalUsd };
  return { price: base, compareAt: null };
}

/** "/?tier=proof#preview" — where a TierCta sends people on pages without a preview form. */
export function previewHref(tier?: CtaTier | null): string {
  return tier ? `/?tier=${tier}#preview` : "/#preview";
}
