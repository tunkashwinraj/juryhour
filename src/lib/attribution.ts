// First-party attribution + analytics events (docs/WEBSITE_SPEC.md §10, WEBSITE_CONTRACTS §2 C).
// Browser-only helpers (every function is a safe no-op on the server / when storage is blocked).
//
// Cookie "jh_attr" (30 days, first-party, SameSite=Lax): JSON { src?, utm_source?, utm_medium?,
// utm_campaign?, utm_term?, utm_content?, code?, first_seen }.
// Precedence: captured on the first visit; on later visits a value present in the current URL
// replaces the stored value for that key only (an explicit new ?src= / ?code= is the stronger
// signal, matching the existing jh_src rule), keys absent from the URL keep their stored value.
// The legacy "jh_src" cookie is still written when a new valid ?src= is present, because
// /api/preview, /api/checkout and /api/quote fall back to it (pickSrc in @/lib/analytics).
// No PII is ever stored here or sent with track().
import { track as vercelTrack } from "@vercel/analytics";
import { SRC_COOKIE, SRC_COOKIE_MAX_AGE_SECONDS, normalizeSrc } from "@/lib/analytics";

export const ATTR_COOKIE = "jh_attr";
export const ATTR_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
type UtmKey = (typeof UTM_KEYS)[number];

export type Attribution = {
  src?: string;
  code?: string;
  first_seen?: string;
} & Partial<Record<UtmKey, string>>;

const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** Promo / partner code as /api/checkout accepts it ([A-Za-z0-9_-]{1,40}), uppercased; else null. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return CODE_RE.test(s) ? s.toUpperCase() : null;
}

/** utm_* values: printable, trimmed, ≤ 100 chars. Anything else is dropped. */
export function normalizeUtm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f<>"'`]/g, "").trim().slice(0, 100);
  return s.length > 0 ? s : null;
}

/** Attribution params present in a query string (normalized). Empty object when none. */
export function attributionFromSearch(search: string | URLSearchParams): Attribution {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: Attribution = {};
  const src = normalizeSrc(q.get("src"));
  if (src) out.src = src;
  const code = normalizeCode(q.get("code"));
  if (code) out.code = code;
  for (const k of UTM_KEYS) {
    const v = normalizeUtm(q.get(k));
    if (v) out[k] = v;
  }
  return out;
}

/** Parses a stored jh_attr value defensively (unknown keys and invalid values are dropped). */
export function parseAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Attribution = {};
    const src = normalizeSrc(v.src);
    if (src) out.src = src;
    const code = normalizeCode(v.code);
    if (code) out.code = code;
    for (const k of UTM_KEYS) {
      const u = normalizeUtm(v[k]);
      if (u) out[k] = u;
    }
    if (typeof v.first_seen === "string" && !Number.isNaN(Date.parse(v.first_seen))) out.first_seen = v.first_seen;
    return out;
  } catch {
    return null;
  }
}

/** Stored values, overridden key-by-key by params in the current URL. */
export function mergeAttribution(stored: Attribution | null, fromUrl: Attribution, nowIso: string): Attribution {
  return { ...(stored ?? {}), ...fromUrl, first_seen: stored?.first_seen ?? nowIso };
}

// ---------------------------------------------------------------- cookies (browser)

/** Reads a cookie from a `document.cookie`-style string. */
export function readCookieFrom(cookieString: string, name: string): string | null {
  for (const part of cookieString.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function browserDoc(): Document | null {
  return typeof document === "undefined" ? null : document;
}

function writeCookie(name: string, value: string, maxAge: number) {
  const doc = browserDoc();
  if (!doc) return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  doc.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

let captured = false;

/**
 * Call once per page load (PreviewProvider does). Captures ?src / utm_* / ?code into jh_attr and
 * refreshes jh_src when a new valid ?src= is present. Never throws.
 */
export function captureAttribution(): Attribution | null {
  try {
    const doc = browserDoc();
    if (!doc || typeof location === "undefined") return null;
    const fromUrl = attributionFromSearch(location.search);
    const stored = parseAttribution(readCookieFrom(doc.cookie, ATTR_COOKIE));
    if (captured && Object.keys(fromUrl).length === 0) return stored;
    captured = true;
    if (!stored || Object.keys(fromUrl).length > 0) {
      const merged = mergeAttribution(stored, fromUrl, new Date().toISOString());
      writeCookie(ATTR_COOKIE, JSON.stringify(merged), ATTR_MAX_AGE_SECONDS);
      if (fromUrl.src) writeCookie(SRC_COOKIE, fromUrl.src, SRC_COOKIE_MAX_AGE_SECONDS);
      return merged;
    }
    return stored;
  } catch {
    return null;
  }
}

/**
 * Current attribution: URL params win, then jh_attr, then the legacy jh_src cookie (src only;
 * it is httpOnly when the proxy sets it, in which case the API reads it server-side anyway).
 */
export function getAttribution(): Attribution {
  try {
    const doc = browserDoc();
    if (!doc || typeof location === "undefined") return {};
    const stored = parseAttribution(readCookieFrom(doc.cookie, ATTR_COOKIE)) ?? {};
    const fromUrl = attributionFromSearch(location.search);
    const legacySrc = normalizeSrc(readCookieFrom(doc.cookie, SRC_COOKIE));
    const out: Attribution = { ...stored, ...fromUrl };
    if (!out.src && legacySrc) out.src = legacySrc;
    return out;
  } catch {
    return {};
  }
}

/** Test helper: forget that this page load already captured. */
export function resetAttributionCapture() {
  captured = false;
}

// ---------------------------------------------------------------- analytics events

export type TrackEvents = {
  preview_started: { mode: "url" | "pitch" };
  preview_completed: Record<string, never>;
  preview_refused: Record<string, never>;
  pricing_viewed: { where?: string };
  tier_clicked: { tier: string; has_preview?: boolean };
  checkout_redirected: { tier: string; code: string | null };
  waitlist_joined: Record<string, never>;
  share_clicked: { where?: string };
};
export type TrackEvent = keyof TrackEvents;

/**
 * Vercel Web Analytics custom event. Props are typed per event and never carry PII (no email,
 * URL, pitch or buyer text). Analytics failures never affect the page.
 */
export function track<E extends TrackEvent>(event: E, props?: TrackEvents[E]): void {
  try {
    const clean: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v === undefined) continue;
      clean[k] = typeof v === "string" ? v.slice(0, 60) : (v as number | boolean | null);
    }
    vercelTrack(event, clean);
  } catch {
    // analytics must never break the money path
  }
}
